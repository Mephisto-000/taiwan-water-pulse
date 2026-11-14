"""Authenticated, AOI-only HDF5 reads with credentials confined to NASA hosts."""

import contextlib
import io
import json
import logging
import os
import re
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from multiprocessing import get_context
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.parse import urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

import aiohttp
import fsspec
import h5py
import numpy as np
from earthaccess import Auth
from pyproj import Transformer

from .models import RESERVOIRS, data_url, observation_times
from .sources import timestamp, write_json

_worker_filesystem: Any = None


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(
        self, request: Any, fp: Any, code: Any, message: Any, headers: Any, new_url: Any
    ) -> None:
        return None


def _validate_download_url(url: str, *, source: bool) -> None:
    parsed = urlsplit(url)
    allowed = (
        {"nisar.asf.earthdatacloud.nasa.gov"}
        if source
        else {"nisar.asf.earthdatacloud.nasa.gov", "d1mv8zhcvry6x4.cloudfront.net"}
    )
    if (
        parsed.scheme != "https"
        or parsed.hostname not in allowed
        or parsed.username
        or parsed.password
    ):
        raise ValueError("Unexpected GCOV source or download host.")


class ScopedDataFilesystem:
    """Resolve NASA redirects separately; never attach credentials to CDN requests.

    The ASF endpoint may return a temporary CDN URL. It stays in memory, while
    provenance retains the original NASA URL. File size is read with a two-byte
    range request; only later requested HDF5 blocks are downloaded.
    """

    def __init__(self, token: str, nasa_filesystem: Any) -> None:
        self._token = token
        self._nasa = nasa_filesystem
        self._opener = build_opener(_NoRedirect())

        async def validate(session: Any, context: Any, parameters: Any) -> None:
            _validate_download_url(str(parameters.url), source=False)
            if hasattr(parameters, "response"):
                location = parameters.response.headers.get("Location")
                if location:
                    _validate_download_url(urljoin(str(parameters.url), location), source=False)

        trace = aiohttp.TraceConfig()
        trace.on_request_start.append(validate)
        trace.on_request_redirect.append(validate)
        self._anonymous = fsspec.filesystem(
            "https",
            skip_instance_cache=True,
            client_kwargs={
                "trust_env": False,
                "timeout": aiohttp.ClientTimeout(total=90, connect=15),
                "trace_configs": [trace],
            },
        )

    def open(self, url: str, mode: str, **kwargs: Any) -> Any:
        _validate_download_url(url, source=True)
        request = Request(
            url, headers={"Authorization": "Bearer " + self._token, "Range": "bytes=0-1"}
        )
        try:
            with self._opener.open(request, timeout=30):
                return self._nasa.open(url, mode, **kwargs)
        except HTTPError as response:
            if response.code not in {301, 302, 303, 307, 308}:
                raise RuntimeError("NASA source access was refused.") from None
            location = response.headers.get("Location")
            response.close()
        if not location:
            raise RuntimeError("NASA source omitted its download location.")
        target = urljoin(url, location)
        _validate_download_url(target, source=False)
        # A fresh request has no Authorization header and redirects stay disabled.
        with self._opener.open(
            Request(target, headers={"Range": "bytes=0-1"}), timeout=30
        ) as response:
            match = re.fullmatch(r"bytes 0-1/(\d+)", response.headers.get("Content-Range", ""))
            if response.status != 206 or match is None:
                raise RuntimeError("Download server did not honor the small range probe.")
            size = int(match.group(1))
            response.read(2)
        return self._anonymous.open(target, mode, size=size, **kwargs)


def load_credentials(path: Path | None = None) -> None:
    """Read supported labelled files into process memory without logging their values."""
    if path:
        content = path.read_text().strip()
        credentials = {}
        for line in content.splitlines():
            match = re.match(r"^\s*\**`?([^:=]+)`?\**\s*[:=]\s*(.*?)\s*$", line)
            if not match:
                continue
            label, value = match.groups()
            # Strip balanced presentation delimiters only, preserving password punctuation.
            for delimiter in ("**", "`", '"', "'"):
                if value.startswith(delimiter) and value.endswith(delimiter):
                    value = value[len(delimiter) : -len(delimiter)]
            if re.search(r"pass|密碼", label, re.I):
                credentials["EARTHDATA_PASSWORD"] = value
            elif re.search(r"token|金鑰|令牌", label, re.I):
                credentials["EARTHDATA_TOKEN"] = value.removeprefix("Bearer ")
            elif re.search(r"user|account|login|帳號|使用者", label, re.I):
                credentials["EARTHDATA_USERNAME"] = value
        if not credentials and content and not any(character.isspace() for character in content):
            credentials["EARTHDATA_TOKEN"] = content
        if not credentials:
            raise ValueError("Credential file must contain a token or labelled username/password.")
        os.environ.update(credentials)
    if not (
        os.getenv("EARTHDATA_TOKEN")
        or (os.getenv("EARTHDATA_USERNAME") and os.getenv("EARTHDATA_PASSWORD"))
    ):
        raise ValueError("Set Earthdata environment credentials or use --credentials-file.")


def authenticated_filesystem() -> Any:
    """Use Auth directly; avoid unrelated cloud-region detection and credential persistence."""
    level = logging.root.manager.disable
    try:
        logging.disable(logging.CRITICAL)
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            authentication = Auth().login(strategy="environment", persist=False)
    except Exception:
        raise RuntimeError(
            "Earthdata authentication failed. Check credentials and ASF app access."
        ) from None
    finally:
        logging.disable(level)
    if not authentication.authenticated or not authentication.token:
        raise RuntimeError("Earthdata did not establish an authenticated session.")

    async def validate_host(session: Any, context: Any, parameters: Any) -> None:
        allowed = {
            "nisar.asf.earthdatacloud.nasa.gov",
            "urs.earthdata.nasa.gov",
        }
        if parameters.url.scheme != "https" or parameters.url.host not in allowed:
            raise RuntimeError("Authenticated request refused for an unexpected host.")
        if hasattr(parameters, "response"):
            location = parameters.response.headers.get("Location")
            if location:
                target = urlsplit(urljoin(str(parameters.url), location))
                if target.scheme != "https" or target.hostname not in allowed:
                    raise RuntimeError("Authenticated redirect refused for an unexpected host.")

    trace = aiohttp.TraceConfig()
    trace.on_request_start.append(validate_host)
    trace.on_request_redirect.append(validate_host)
    nasa_filesystem = fsspec.filesystem(
        "https",
        skip_instance_cache=True,
        client_kwargs={
            "headers": {"Authorization": "Bearer " + authentication.token["access_token"]},
            "trust_env": False,
            "timeout": aiohttp.ClientTimeout(total=90, connect=15),
            "trace_configs": [trace],
        },
    )
    return ScopedDataFilesystem(authentication.token["access_token"], nasa_filesystem)


def read_granule(fs: Any, name: str, keys: list[str], cache: Path) -> dict[str, Any]:
    utc, _ = observation_times(name)
    compact = utc[:10].replace("-", "")
    targets = {key: cache / f"{key}_{compact}.npz" for key in keys}
    if all(path.exists() for path in targets.values()):
        return {"granule": name, "cached": True}
    started = time.monotonic()
    metrics: dict[str, Any] = {
        "granule": name,
        "accessed_at": timestamp(),
        "source_url": data_url(name),
    }
    try:
        with fs.open(
            data_url(name),
            "rb",
            cache_type="blockcache",
            block_size=1024 * 1024,
            cache_options={"maxblocks": 256},
        ) as remote:
            with h5py.File(remote, "r") as hdf:
                group = hdf["/science/LSAR/GCOV/grids/frequencyA"]
                epsg = int(group["projection"][()])
                x, y = group["xCoordinates"][:], group["yCoordinates"][:]
                transform = Transformer.from_crs(4326, epsg, always_xy=True)
                metrics["epsg"] = epsg
                metrics["mask_description"] = group["mask"].attrs["description"].decode()
                metrics["windows"] = {}
                for reservoir in RESERVOIRS:
                    key = reservoir["key"]
                    if key not in keys or targets[key].exists():
                        continue
                    south, north, west, east = reservoir["bbox"]
                    xx, yy = transform.transform(
                        [west, east, west, east], [south, south, north, north]
                    )
                    columns = np.flatnonzero((x >= min(xx) - 600) & (x <= max(xx) + 600))
                    rows = np.flatnonzero((y >= min(yy) - 600) & (y <= max(yy) + 600))
                    if rows.size == 0 or columns.size == 0:
                        raise ValueError("Reservoir AOI is outside the product grid.")
                    selection = np.s_[
                        rows.min() : rows.max() + 1, columns.min() : columns.max() + 1
                    ]
                    arrays = {
                        layer: group[layer][selection]
                        for layer in ("HHHH", "HVHV", "mask", "numberOfLooks")
                    }
                    arrays.update(
                        x=x[columns.min() : columns.max() + 1],
                        y=y[rows.min() : rows.max() + 1],
                        epsg=np.array(epsg),
                        granule=np.array(name),
                    )
                    cache.mkdir(parents=True, exist_ok=True)
                    temporary = targets[key].with_suffix(".tmp")
                    with temporary.open("wb") as stream:
                        np.savez_compressed(stream, **arrays)
                    temporary.replace(targets[key])
                    metrics["windows"][key] = list(arrays["HHHH"].shape)
            metrics["range_bytes"] = int(remote.cache.total_requested_bytes)
            metrics["range_requests"] = int(remote.cache.miss_count)
        metrics.update(status="passed", elapsed_seconds=round(time.monotonic() - started, 3))
        return metrics
    except Exception as error:
        raise RuntimeError(
            f"GCOV AOI read failed for {utc[:10]} ({type(error).__name__}). "
            "Retry using the cache; check Earthdata/ASF access and network availability."
        ) from None


def read_all(
    root: Path, names: list[str], keys: list[str], *, workers: int = 4
) -> list[dict[str, Any]]:
    if workers < 1 or workers > 4:
        raise ValueError("Use between one and four concurrent granules.")
    cache = root / "data" / "cache"
    metrics_path = cache / "read-metrics.json"
    previous = json.loads(metrics_path.read_text()) if metrics_path.exists() else []
    metrics = {row["granule"]: row for row in previous}
    # HDF5 serializes library calls within a process. Spawn isolates that lock and
    # avoids sharing open HDF5 handles or event-loop state between workers.
    with ProcessPoolExecutor(max_workers=workers, mp_context=get_context("spawn")) as executor:
        jobs = {executor.submit(_worker_read, name, keys, cache): name for name in names}
        for future in as_completed(jobs):
            result = future.result()
            if not result.get("cached") or result["granule"] not in metrics:
                metrics[result["granule"]] = result
            print(
                json.dumps(
                    {
                        "utc_date": observation_times(jobs[future])[0][:10],
                        "cached": result.get("cached", False),
                        "seconds": result.get("elapsed_seconds"),
                        "range_bytes": result.get("range_bytes"),
                    }
                ),
                flush=True,
            )
            write_json(metrics_path, sorted(metrics.values(), key=lambda row: row["granule"]))
    return list(metrics.values())


def _worker_read(name: str, keys: list[str], cache: Path) -> dict[str, Any]:
    global _worker_filesystem
    compact = observation_times(name)[0][:10].replace("-", "")
    if all((cache / f"{key}_{compact}.npz").exists() for key in keys):
        return {"granule": name, "cached": True}
    if _worker_filesystem is None:
        _worker_filesystem = authenticated_filesystem()
    return read_granule(_worker_filesystem, name, keys, cache)

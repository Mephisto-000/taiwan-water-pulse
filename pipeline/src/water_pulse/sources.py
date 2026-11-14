"""Bounded, cached public HTTP access. No credentials are used for browse assets."""

import hashlib
import json
import struct
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

from .geometry import validate_geometry
from .models import RESERVOIRS, WRA_URL, browse_url

CMR_URL = (
    "https://cmr.earthdata.nasa.gov/search/granules.json?"
    "short_name=NISAR_L2_GCOV_PROVISIONAL_V1&bounding_box=121.20,24.75,121.30,24.85"
    "&page_size=1000&sort_key=start_date"
)
OSM_URL = (
    "https://nominatim.openstreetmap.org/lookup?"
    "osm_ids=R3304018,R4749861,R16850337,R5460776,W154546569,R2766172,"
    "W202162584,R3858334&format=geojson&polygon_geojson=1"
)
USER_AGENT = "TaiwanWaterPulse/0.1 (https://github.com/Mephisto-000/taiwan-water-pulse)"


def timestamp() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n")
    temporary.replace(path)


def fetch(url: str, *, body: bytes | None = None, attempts: int = 3) -> bytes:
    headers = {"User-Agent": USER_AGENT, "Accept": "*/*"}
    if body is not None:
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(url, data=body, headers=headers)
            with urllib.request.urlopen(request, timeout=30) as response:
                return response.read()
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            if attempt + 1 == attempts:
                raise RuntimeError(
                    f"Could not retrieve {urllib.parse.urlsplit(url).hostname}; "
                    "check network access and retry, or use --offline."
                ) from error
            time.sleep(1 + attempt)
    raise AssertionError("Unreachable retry state")


def discover(assets: Path, expected: list[str], *, refresh: bool) -> list[str]:
    cache = assets / "cmr-response.json"
    if refresh or not cache.exists():
        payload = json.loads(fetch(CMR_URL))
        write_json(cache, payload)
    else:
        payload = json.loads(cache.read_text())
    names = sorted(
        {
            entry["producer_granule_id"]
            for entry in payload["feed"]["entry"]
            if "_111_A_014_4005_DHDH_A_" in entry.get("producer_granule_id", "")
            and "_P05023_N_F_" in entry.get("producer_granule_id", "")
        }
    )
    if set(names) != set(expected):
        missing, extra = set(expected) - set(names), set(names) - set(expected)
        raise RuntimeError(
            f"CMR manifest differs from the brief: {len(missing)} missing, "
            f"{len(extra)} extra products. Review before exporting."
        )
    write_json(assets / "granules.json", names)
    return names


def geometry(assets: Path, *, refresh: bool) -> dict[str, Any]:
    cache = assets / "reservoirs.geojson"
    if cache.exists() and not refresh:
        payload = json.loads(cache.read_text())
        validate_geometry(payload)
        return payload
    # Nominatim receives exactly one attempt per explicit refresh, per service policy.
    payload = json.loads(fetch(OSM_URL, attempts=1))
    if payload.get("type") != "FeatureCollection" or len(payload.get("features", [])) < 4:
        raise RuntimeError("OSM did not return the required reservoir polygons.")
    validate_geometry(payload)
    write_json(cache, payload)
    return payload


def png_info(path: Path) -> tuple[int, int, str]:
    content = path.read_bytes()
    if len(content) < 24 or content[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"Invalid PNG content in {path.name}; remove it and retry read.")
    width, height = struct.unpack(">II", content[16:24])
    if not width or not height:
        raise ValueError(f"Empty PNG dimensions in {path.name}.")
    return width, height, hashlib.sha256(content).hexdigest()


def acquire_browse(output: Path, names: list[str]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for name in names:
        utc_date = name.split("_")[11][:8]
        for polarization in ("HH", "HV"):
            path = output / "browse" / f"{utc_date}_{polarization}.png"
            url = browse_url(name, polarization)
            if not path.exists():
                data = fetch(url)
                path.parent.mkdir(parents=True, exist_ok=True)
                temp = path.with_suffix(".tmp")
                temp.write_bytes(data)
                png_info(temp)
                temp.replace(path)
            width, height, digest = png_info(path)
            records.append(
                {
                    "date": f"{utc_date[:4]}-{utc_date[4:6]}-{utc_date[6:]}",
                    "polarization": polarization,
                    "url": url,
                    "path": path.relative_to(output).as_posix(),
                    "bytes": path.stat().st_size,
                    "sha256": digest,
                    "width": width,
                    "height": height,
                    "status": "ok",
                }
            )
    return records


def dense_dates(start: date, end: date, observation_dates: list[str]) -> list[str]:
    dates = {start + timedelta(days=offset) for offset in range(0, (end - start).days + 1, 5)}
    dates.update(date.fromisoformat(value) for value in observation_dates)
    dates.add(end)
    return [value.isoformat() for value in sorted(dates)]


def official_refresh(assets: Path, observation_dates: list[str]) -> dict[str, Any]:
    """Two dates per request, at most 60 requests, each spaced by at least one second."""
    dates = dense_dates(date(2025, 11, 6), date(2026, 10, 20), observation_dates)
    pairs = [dates[index : index + 2] for index in range(0, len(dates), 2)]
    if len(pairs) > 60:
        raise ValueError("Official source plan exceeds the 60-request budget.")
    path = assets / "wra_cache.json"
    cache: dict[str, Any] = json.loads(path.read_text()) if path.exists() else {"requests": {}}
    covered = {day for pair_key in cache["requests"] for day in pair_key.split(",")}
    pending = [pair for pair in pairs if not set(pair).issubset(covered)]
    if len(cache["requests"]) + len(pending) > 60:
        raise ValueError("Official refresh would exceed the cumulative 60-request budget.")
    last_request = 0.0
    for pair in pairs:
        key = ",".join(pair)
        if set(pair).issubset(covered):
            continue
        time.sleep(max(0, 1.05 - (time.monotonic() - last_request)))
        last_request = time.monotonic()
        body = urllib.parse.urlencode(
            {
                "ST_NO": ",".join(reservoir["station"] for reservoir in RESERVOIRS),
                "StartDate": pair[0].replace("-", "/"),
                "EndDate": pair[-1].replace("-", "/"),
            }
        ).encode()
        payload = json.loads(fetch(WRA_URL, body=body, attempts=1))
        if not isinstance(payload, list):
            raise RuntimeError("WRA response schema changed; keep the seed fallback and review.")
        cache["requests"][key] = {"retrieved_at": timestamp(), "records": payload}
        cache["retrieved_at"] = timestamp()
        write_json(path, cache)
    cache["complete"] = True
    write_json(path, cache)
    return cache

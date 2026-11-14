"""Generate six unfiltered, native-grid GCOV HH diagnostic figures.

Uses existing pipeline dependencies and macOS AppKit only for figure labels.
No image generation, sharpening, fitted offset, thresholding or gauge fitting.
"""

import hashlib
import json
import struct
import subprocess
import tempfile
import zlib
from pathlib import Path

import numpy as np
from rasterio import Affine
from rasterio.features import rasterize
from rasterio.warp import transform_geom
from scipy.ndimage import binary_erosion

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = Path(__file__).resolve().parent
DATES = ["2025-11-05", "2026-03-17", "2026-06-21"]
RESERVOIRS = [("baoshan2", "Baoshan II", "4749861"), ("liyutan", "Liyutan", "16850337")]
LOW_DB, HIGH_DB = -35.0, 5.0


def rgb_png(path: Path, pixels: np.ndarray) -> None:
    height, width, channels = pixels.shape
    assert channels == 3 and pixels.dtype == np.uint8

    def chunk(kind: bytes, body: bytes) -> bytes:
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body))

    rows = b"".join(b"\0" + row.tobytes() for row in pixels)
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(rows, 9))
        + chunk(b"IEND", b"")
    )


def main() -> None:
    features = {
        str(item["properties"]["osm_id"]): item
        for item in json.loads((ROOT / "pipeline/assets/reservoirs.geojson").read_text())["features"]
    }
    manifest = []
    provenance = []
    with tempfile.TemporaryDirectory(prefix="water-pulse-gcov-figures-") as work:
        temporary = Path(work)
        for key, title, osm_id in RESERVOIRS:
            reference_grid = None
            official = json.loads((ROOT / "web/public/data/official" / f"{key}.json").read_text())
            by_utc_date = {record["nisar_utc_date"]: record for record in official["records"]}
            for date in DATES:
                source = ROOT / "data/cache" / f"{key}_{date.replace('-', '')}.npz"
                with np.load(source, allow_pickle=False) as cached:
                    x, y = cached["x"], cached["y"]
                    power = np.asarray(cached["HHHH"], dtype=np.float64)
                    source_mask = cached["mask"]
                    epsg = int(cached["epsg"].item())
                    granule = str(cached["granule"].item()) if "granule" in cached else None
                dx, dy = float(x[1] - x[0]), float(y[1] - y[0])
                if dx <= 0 or dy >= 0 or epsg != 32651:
                    raise ValueError("Expected the verified north-up source UTM grid.")
                grid_identity = (x.tolist(), y.tolist(), epsg)
                if reference_grid is None:
                    reference_grid = grid_identity
                if grid_identity != reference_grid:
                    raise ValueError("Source date grids differ; do not silently realign this diagnostic.")
                transform = Affine(dx, 0, x[0] - dx / 2, 0, dy, y[0] - dy / 2)
                geometry = transform_geom("EPSG:4326", f"EPSG:{epsg}", features[osm_id]["geometry"])
                inside = rasterize([(geometry, 1)], out_shape=power.shape, transform=transform, dtype="uint8", all_touched=False) > 0
                boundary = inside & ~binary_erosion(inside)
                valid = (source_mask > 0) & (source_mask < 255) & np.isfinite(power) & (power > 0)
                db = np.full(power.shape, np.nan)
                db[valid] = 10 * np.log10(power[valid])
                gray = np.zeros(power.shape, dtype=np.uint8)
                gray[valid] = np.round(np.clip((db[valid] - LOW_DB) / (HIGH_DB - LOW_DB), 0, 1) * 255).astype(np.uint8)
                pixels = np.repeat(gray[:, :, None], 3, axis=2)
                row, col = np.indices(power.shape)
                checker = np.where(((row // 4 + col // 4) % 2)[..., None], 208, 232)
                pixels[~valid] = np.broadcast_to(checker, pixels.shape)[~valid]
                pixels[boundary] = [126, 255, 214]
                raw_name = f"{key}-{date}-native-hh.png"
                rgb_png(temporary / raw_name, pixels)
                observation = by_utc_date[date]
                manifest.append({"raw": raw_name, "output": f"{key}-{date}-gcov-hh.png", "title": f"{title} · {date} UTC", "subtitle": f"Native GCOV HH · EPSG:{epsg} · {dx:.0f} m source grid", "gauge": f"Official storage {observation['pct']:.1f}% · level {observation['level_m']:.2f} m · {observation['local_date']}", "width": power.shape[1], "height": power.shape[0], "scale_pixels": int(500 / dx)})
                provenance.append({
                    "reservoir": key, "utc_date": date, "figure": f"{key}-{date}-gcov-hh.png",
                    "source_cached_aoi": source.relative_to(ROOT).as_posix(),
                    "source_cached_aoi_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
                    "cached_granule": granule,
                    "source_grid": {"epsg": epsg, "width": power.shape[1], "height": power.shape[0], "pixel_spacing": [dx, dy], "top_left_pixel_center": [float(x[0]), float(y[0])]},
                    "source_valid_fraction_inside_osm": float(np.count_nonzero(valid & inside) / np.count_nonzero(inside)),
                    "display_db_range": [LOW_DB, HIGH_DB],
                    "processing": "10*log10(raw positive finite HHHH power), fixed display clipping, no filtering or reprojection; OSM boundary rasterized from WGS84 into actual source UTM coordinates",
                    "official_record": observation,
                })
        (temporary / "manifest.json").write_text(json.dumps(manifest))
        subprocess.run(["/usr/bin/swift", "-module-cache-path", str(Path(tempfile.gettempdir()) / "water-pulse-swift-module-cache"), str(OUTPUT / "label-gcov-quickviews.swift"), str(temporary / "manifest.json"), str(OUTPUT)], check=True)
    for item in provenance:
        item["figure_sha256"] = hashlib.sha256((OUTPUT / item["figure"]).read_bytes()).hexdigest()
    (OUTPUT / "gcov-quickviews.json").write_text(json.dumps({"si_usage": "SI-assisted plotting code and annotations; radar observations are not SI-generated", "display_note": "Identical fixed dB mapping for every date and reservoir; OSM is a reference outline, not water truth.", "figures": provenance}, indent=2) + "\n")
    print(json.dumps({"figures": len(provenance), "output": "docs/review", "db_range": [LOW_DB, HIGH_DB]}))


if __name__ == "__main__":
    main()

import hashlib
import io
import json
from pathlib import Path
from urllib.error import HTTPError

import numpy as np
import pytest

from water_pulse.release import (
    correlation_summary,
    grayscale_png,
    image_threshold,
    publication_grade,
    shoreline_contrast,
)
from water_pulse.remote import ScopedDataFilesystem, _validate_download_url
from water_pulse.sources import png_info


def test_image_only_otsu_is_not_clipped_to_the_old_project_range() -> None:
    values = np.concatenate([np.full(100, -13.0), np.full(100, -7.0), [np.nan]])
    assert image_threshold(values) == pytest.approx(-10, abs=0.03)
    assert image_threshold(values[::-1]) == image_threshold(values)
    with pytest.raises(ValueError, match="distinct"):
        image_threshold(np.array([1.0, 1.0, np.nan]))


def test_bootstrap_preserves_pairs_missingness_and_seed() -> None:
    areas = [1.0, 2, 3, 4, 5, 200]
    levels = [10.0, 20, 30, 40, 50, None]
    result = correlation_summary(areas, levels, repetitions=100)
    assert result == correlation_summary(areas, levels, repetitions=100)
    assert result["n"] == 5
    assert result["pearson_area_vs_level"] == pytest.approx(1)
    assert result["spearman_area_vs_level"] == pytest.approx(1)
    assert result["pearson_ci95"] == pytest.approx([1, 1])
    assert result["spearman_ci95"] == pytest.approx([1, 1])
    assert result["leave_one_out_pearson_range"] == pytest.approx([1, 1])
    assert correlation_summary([1, 1, 1], [1, 2, 3])["pearson_ci95"] is None
    with pytest.raises(ValueError, match="align"):
        correlation_summary([1, 2], [1])
    with pytest.raises(ValueError, match="finite"):
        correlation_summary([1, float("nan"), 3], [1, 2, 3])


def test_grades_fail_closed_for_physical_checks_and_uncertain_correlations() -> None:
    assert (
        publication_grade({"pearson_area_vs_level": 0.9, "pearson_ci95": [0.6, 1]}, True, True)[0]
        == "A"
    )
    assert (
        publication_grade({"pearson_area_vs_level": 0.9, "pearson_ci95": [0.59, 1]}, True, True)[0]
        == "B"
    )
    assert (
        publication_grade({"pearson_area_vs_level": 0.5, "pearson_ci95": [0.1, 0.8]}, True, True)[0]
        == "B"
    )
    assert (
        publication_grade({"pearson_area_vs_level": 0.49, "pearson_ci95": [0.1, 0.8]}, True, True)[
            0
        ]
        == "C"
    )
    assert (
        publication_grade({"pearson_area_vs_level": 1, "pearson_ci95": [1, 1]}, False, True)[0]
        == "C"
    )
    assert publication_grade({"pearson_area_vs_level": None}, True, True)[0] == "C"
    assert (
        publication_grade({"pearson_area_vs_level": 0.9, "pearson_ci95": [0.7, 1]}, True, False)[0]
        == "B"
    )
    for lower in (0, -0.1):
        assert (
            publication_grade(
                {"pearson_area_vs_level": 0.9, "pearson_ci95": [lower, 1]}, True, True
            )[0]
            == "C"
        )
    assert publication_grade({"pearson_area_vs_level": 0.9}, True, True)[0] == "C"


def test_shoreline_contrast_uses_disjoint_spatial_groups_and_handles_nodata() -> None:
    from water_pulse.numerics import quantize_db

    pixels = quantize_db(np.array([[-22, -20, -6], [-21, -8, np.nan]]))
    inside = np.array([[1, 1, 0], [1, 0, 0]], dtype=np.uint8)
    ring = np.array([[0, 0, 1], [0, 1, 1]], dtype=np.uint8)
    value, counts = shoreline_contrast(pixels, inside, ring)
    assert value is not None and value > 10
    assert counts == {"inside": 3, "ring": 2}
    reverse, _ = shoreline_contrast(pixels, ring, inside)
    assert reverse == pytest.approx(-value)
    with pytest.raises(ValueError, match="overlap"):
        shoreline_contrast(pixels, inside, inside)


def test_png_encoder_is_deterministic_lossless_and_has_expected_dimensions(tmp_path: Path) -> None:
    import rasterio
    from rasterio.errors import NotGeoreferencedWarning

    path = tmp_path / "image.png"
    values = np.arange(80, dtype=np.uint8).reshape((8, 10))
    grayscale_png(path, values)
    first = path.read_bytes()
    grayscale_png(path, values)
    assert path.read_bytes() == first
    assert png_info(path)[:2] == (10, 8)
    with pytest.warns(NotGeoreferencedWarning), rasterio.open(path) as image:
        np.testing.assert_array_equal(image.read(1), values)


def test_download_hosts_are_scoped_before_credentials_are_attached() -> None:
    _validate_download_url("https://nisar.asf.earthdatacloud.nasa.gov/path", source=True)
    _validate_download_url("https://d1mv8zhcvry6x4.cloudfront.net/path", source=False)
    for url in (
        "http://nisar.asf.earthdatacloud.nasa.gov/path",
        "https://example.com/path",
        "https://nisar.asf.earthdatacloud.nasa.gov.example.com/path",
        "https://user:pass@nisar.asf.earthdatacloud.nasa.gov/path",
        "https://d1mv8zhcvry6x4.cloudfront.net/path",
    ):
        with pytest.raises(ValueError, match="host"):
            _validate_download_url(url, source=True)


def test_cdn_redirect_never_receives_authorization() -> None:
    source = "https://nisar.asf.earthdatacloud.nasa.gov/source.h5"
    target = "https://d1mv8zhcvry6x4.cloudfront.net/temporary-download"
    requests = []

    class Response(io.BytesIO):
        status = 206
        headers = {"Content-Range": "bytes 0-1/1000000"}

    class Opener:
        def open(self, request: object, timeout: int) -> Response:
            requests.append(request)
            if len(requests) == 1:
                raise HTTPError(source, 303, "Redirect", {"Location": target}, io.BytesIO())
            return Response(b"ab")

    class Filesystem:
        def open(self, url: str, mode: str, **kwargs: object) -> str:
            assert url == target
            assert kwargs["size"] == 1000000
            return "range-backed-file"

    fs = object.__new__(ScopedDataFilesystem)
    fs._token = "test-credential"
    fs._opener = Opener()
    fs._anonymous = Filesystem()
    assert fs.open(source, "rb", block_size=1024) == "range-backed-file"
    assert requests[0].get_header("Authorization") == "Bearer test-credential"
    assert requests[1].get_header("Authorization") is None
    assert requests[1].get_header("Range") == "bytes=0-1"


def test_published_calibrated_assets_and_grades_match_provenance() -> None:
    root = Path(__file__).resolve().parents[2]
    output = root / "web/public/data"
    index = json.loads((output / "index.json").read_text())
    if index.get("release_method") not in {"pooled_otsu_v2", "relative_power_v3"}:
        pytest.skip("Reviewed release has not been generated in this checkout.")
    provenance = json.loads((output / "provenance.json").read_text())
    for asset in provenance["numeric_assets"]:
        path = output / asset["path"]
        assert path.stat().st_size == asset["bytes"]
        assert hashlib.sha256(path.read_bytes()).hexdigest() == asset["sha256"]
    for key in index["image_reservoirs"]:
        folder = output / "reservoirs" / key
        meta = json.loads((folder / "meta.json").read_text())
        series = json.loads((folder / "timeseries.json").read_text())
        assert meta["validation"] == series["stats"] == provenance["validation"][key]
        assert (key in index["numeric_reservoirs"]) == meta["validation"]["publish_area"]
        size = meta["grid"]["width"] * meta["grid"]["height"]
        assert (folder / "mask.bin").stat().st_size == size
        assert len(series["records"]) == len(index["dates"]) == 21
        for date in index["dates"]:
            for channel in ("HH", "HV"):
                assert (
                    folder / f"{date['utc_date'].replace('-', '')}_{channel}.bin"
                ).stat().st_size == size
        if "analysis" in meta:
            analysis = meta["analysis"]
            size = analysis["grid"]["width"] * analysis["grid"]["height"]
            assert analysis["grid"]["epsg"] == 32651
            assert analysis["grid"]["pixel_side_m"] == 30
            assert (folder / "analysis/mask.bin").stat().st_size == size
            for record in series["records"]:
                date = record["utc"][:10]
                assert (folder / f"analysis/{date.replace('-', '')}_HH.bin").stat().st_size == size
                assert record["land_median_db"] == analysis["land_median_db_by_date"][date]


def test_v2_review_retains_dates_and_suppresses_grade_c_csv_area() -> None:
    import csv

    from water_pulse.review import effect_size

    output = Path(__file__).resolve().parents[2] / "web/public/data"
    report = json.loads((output / "validation.json").read_text())
    if report.get("review_version") != "2026-11-14-v2":
        pytest.skip("Second review data have not been generated in this checkout.")
    for key, entry in report["reservoirs"].items():
        series = json.loads((output / "reservoirs" / key / "timeseries.json").read_text())
        rows, stats = series["records"], series["stats"]
        assert len(rows) == 21
        assert stats["effect_size"] == effect_size(rows)
        for channel in ("HH", "HV"):
            result = stats["polarization_comparison"]["channels"][channel]
            assert result["all"]["n"] == sum(r["official"]["level_m"] is not None for r in rows)
            assert result["without_flagged"]["n"] == sum(
                r["official"]["level_m"] is not None and not r["qa_by_channel"][channel]
                for r in rows
            )
        assert all(r["qa"] == r["qa_by_channel"]["HH"] for r in rows)
        if stats["grade"] == "C":
            with (output / "reservoirs" / key / "timeseries.csv").open(newline="") as stream:
                csv_rows = list(csv.DictReader(stream))
            assert len(csv_rows) == len(rows)
            assert all(
                row["area_km2"] == row["area_low_km2"] == row["area_high_km2"] == ""
                for row in csv_rows
            )
        else:
            assert stats["pearson_ci95"][0] > 0
        assert stats == entry["statistics"]

import hashlib
import json
import shutil
from datetime import date
from pathlib import Path

import pytest

from water_pulse.export import export
from water_pulse.geometry import validate_geometry
from water_pulse.models import browse_url, observation_times, official_date
from water_pulse.official import load_seed, parse_live
from water_pulse.sources import dense_dates, png_info

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "pipeline" / "assets"


@pytest.mark.parametrize(
    "utc, expected",
    [
        ("2026-03-17T21:16:47Z", "2026-03-18"),
        ("2025-12-31T21:16:40Z", "2026-01-01"),
        ("2026-01-31T21:16:40Z", "2026-02-01"),
    ],
)
def test_official_mapping_uses_taipei_calendar_date(utc: str, expected: str) -> None:
    assert official_date(utc) == expected


def test_naive_timestamp_rejected() -> None:
    with pytest.raises(ValueError):
        official_date("2026-03-17T21:16:47")


def test_seed_all_checksums_and_missingness() -> None:
    seeds = load_seed(ASSETS / "wra_seed.csv")
    expected = {
        "shimen": (2253.0, 6061.53),
        "baoshan2": (2041.3, 3666.09),
        "liyutan": (1909.6, 7312.72),
        "feitsui": (2074.2, 3943.95),
        "yongheshan": (1777.5, 1785.95),
        "mingde": (1737.3, 1351.13),
        "deji": (2237.7, 35074.23),
        "sunmoonlake": (2129.1, 18650.55),
    }
    for key, (pct, level) in expected.items():
        assert len(seeds[key]) == 25
        assert sum(row["pct"] or 0 for row in seeds[key]) == pytest.approx(pct)
        assert sum(row["level_m"] or 0 for row in seeds[key]) == pytest.approx(level)
    assert sum(row["pct"] is None for records in seeds.values() for row in records) == 6


def test_granule_identity_and_channel_urls() -> None:
    names = json.loads((ASSETS / "granules_seed.json").read_text())
    assert len(names) == len(set(names)) == 21
    utc, local = observation_times(names[0])
    assert utc == "2025-11-05T21:16:41Z"
    assert local == "2025-11-06T05:16:41+08:00"
    assert browse_url(names[0], "HV").endswith("_NATIVE_A_HVHV.png")
    with pytest.raises(ValueError):
        browse_url(names[0], "VV")


def test_official_dense_request_budget_and_missing_semantics() -> None:
    dates = dense_dates(date(2025, 11, 6), date(2026, 10, 20), ["2026-03-18"])
    assert dates == sorted(set(dates))
    assert len(dates) <= 120
    cache = {
        "requests": {
            "x": {
                "records": [
                    {
                        "ST_NO": "10405",
                        "DATE": "2026-03-18T07:00:00",
                        "WaterLine": None,
                        "CapacityRate": 0,
                    },
                ]
            }
        }
    }
    records = parse_live(cache, "baoshan2", {})
    assert records[0]["pct"] is None
    assert records[0]["level_m"] is None


def test_exported_asset_integrity_and_honest_fallback() -> None:
    output = ROOT / "web" / "public" / "data"
    index = json.loads((output / "index.json").read_text())
    provenance = json.loads((output / "provenance.json").read_text())
    assert index["mode"] == "browse"
    assert len(index["dates"]) == 21
    assert len(provenance["assets"]) == 42
    assert all("area_km2" not in record for record in index["dates"])
    for asset in provenance["assets"]:
        path = output / asset["path"]
        width, height, digest = png_info(path)
        assert (width, height) == (2016, 1982)
        assert digest == asset["sha256"]
    assert (
        hashlib.sha256((ASSETS / "wra_seed.csv").read_bytes()).hexdigest()
        == (provenance["official"]["seed_sha256"])
    )


def test_real_osm_boundaries_match_reference_and_fit_frame() -> None:
    collection = json.loads((ASSETS / "reservoirs.geojson").read_text())
    result = validate_geometry(collection)
    assert len(result) == 8
    assert all(row["relative_error"] < 0.01 and row["bbox_inside_frame"] for row in result)


def test_si_disclosure_survives_export_without_changing_source_data(tmp_path: Path) -> None:
    assets = tmp_path / "pipeline/assets"
    assets.mkdir(parents=True)
    shutil.copyfile(ROOT / "si-usage.json", tmp_path / "si-usage.json")
    shutil.copyfile(ASSETS / "wra_seed.csv", assets / "wra_seed.csv")
    names = json.loads((ASSETS / "granules_seed.json").read_text())[:1]
    relative = "browse/20251105_HH.png"
    original = ROOT / "web/public/data" / relative
    target = tmp_path / "web/public/data" / relative
    target.parent.mkdir(parents=True)
    shutil.copyfile(original, target)
    digest = hashlib.sha256(target.read_bytes()).hexdigest()

    for _ in range(2):
        index = export(tmp_path, names, ["baoshan2"], generated_at="2026-11-14")
        output = tmp_path / "web/public/data"
        provenance = json.loads((output / "provenance.json").read_text())
        official = json.loads((output / "official/baoshan2.json").read_text())
        declaration = json.loads((output / "si-usage.json").read_text())
        assert declaration == json.loads((ROOT / "si-usage.json").read_text())
        for document in (index, provenance, official):
            assert document["si_usage"]["tool"] == "OpenAI Codex"
            assert document["si_usage"]["source_observations_si_generated"] is False
            assert document["si_usage"]["browse_images_si_generated"] is False
        assert provenance["assets"][0]["si_generated"] is False
        assert hashlib.sha256(target.read_bytes()).hexdigest() == digest
        assert official["records"] == load_seed(assets / "wra_seed.csv")["baoshan2"]

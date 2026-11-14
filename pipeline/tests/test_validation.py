import json
from pathlib import Path

import pytest

from water_pulse import cli
from water_pulse.remote import load_credentials
from water_pulse.validation import correlations

ROOT = Path(__file__).resolve().parents[2]


def test_calibration_and_holdout_dates_are_disjoint_and_frozen() -> None:
    config = json.loads((ROOT / "pipeline/assets/numeric-calibration.json").read_text())
    train, heldout = config["calibration_utc_dates"], config["validation_utc_dates"]
    assert len(train) == 4
    assert len(heldout) == 17
    assert not set(train) & set(heldout)
    report = json.loads((ROOT / "pipeline/assets/numeric-validation.json").read_text())
    assert report["calibration"] == config
    for item in report["reservoirs"].values():
        assert item["heldout"]["n"] == 17
        assert item["all_dates"]["n"] == 21
        assert not item["passed"]
        assert item["heldout"]["spearman_area_vs_level"] < 0.8


def test_failed_validation_cannot_publish_or_overwrite_browse(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    output = tmp_path / "web/public/data"
    output.mkdir(parents=True)
    index = output / "index.json"
    original = b'{"mode":"browse"}\n'
    index.write_bytes(original)
    monkeypatch.setattr(cli, "ROOT", tmp_path)
    monkeypatch.setattr(cli, "_measure", lambda names: {"passed": False})
    monkeypatch.setattr(
        "sys.argv",
        [
            "water-pulse",
            "export",
            "--numeric",
            "--offline",
            "--reservoirs",
            "baoshan2,liyutan",
        ],
    )
    assert cli.main() == 2
    assert index.read_bytes() == original
    assert not list(output.rglob("*.bin"))


def test_credential_parser_preserves_password_punctuation_and_prints_nothing(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    for variable in ("EARTHDATA_USERNAME", "EARTHDATA_PASSWORD", "EARTHDATA_TOKEN"):
        monkeypatch.delenv(variable, raising=False)
    file = tmp_path / "credentials.md"
    file.write_text("Username: test-user\nPassword: p:ass*\n")
    # Restore environment automatically after this test, including newly added keys.
    monkeypatch.setenv("EARTHDATA_USERNAME", "")
    monkeypatch.setenv("EARTHDATA_PASSWORD", "")
    load_credentials(file)
    import os

    assert os.environ["EARTHDATA_USERNAME"] == "test-user"
    assert os.environ["EARTHDATA_PASSWORD"] == "p:ass*"
    captured = capsys.readouterr()
    assert captured.out == ""
    assert captured.err == ""


def test_correlation_retains_nulls_and_handles_constant_values() -> None:
    records = [
        {"area_km2": {"primary": 1}, "official": {"level_m": 10}},
        {"area_km2": {"primary": 1}, "official": {"level_m": 20}},
        {"area_km2": {"primary": 1}, "official": {"level_m": 30}},
        {"area_km2": {"primary": 5}, "official": {"level_m": None}},
    ]
    result = correlations(records)
    assert result["n"] == 3
    assert result["spearman_area_vs_level"] is None
    assert result["pearson_area_vs_level"] is None

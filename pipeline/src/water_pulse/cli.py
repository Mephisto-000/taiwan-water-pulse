"""Reentrant public-browse CLI and explicitly gated numerical experiments."""

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any

from .export import export
from .models import RESERVOIRS, observation_times
from .official import compare_seed, load_seed
from .sources import acquire_browse, discover, geometry, official_refresh, timestamp, write_json

ROOT = Path(__file__).resolve().parents[3]
ASSETS = ROOT / "pipeline" / "assets"
EXPERIMENT_KEYS = ["baoshan2", "liyutan"]


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser(
        description="Build the browse edition or reproduce gated calibrated-data experiments."
    )
    value.add_argument(
        "command",
        choices=[
            "discover",
            "geometry",
            "read",
            "process",
            "measure",
            "official",
            "export",
            "all",
            "gates",
            "release",
        ],
    )
    value.add_argument(
        "--reservoirs",
        default="baoshan2,liyutan,shimen,feitsui",
        help="Comma-separated reservoir keys",
    )
    value.add_argument("--dates", help="Comma-separated NISAR UTC dates, YYYY-MM-DD")
    value.add_argument(
        "--dry-run", action="store_true", help="Print plan without network or mutation"
    )
    value.add_argument(
        "--numeric",
        action="store_true",
        help="Attempt quantitative export; failed scientific validation blocks publication",
    )
    value.add_argument(
        "--credentials-file",
        type=Path,
        help="Local ignored token or labelled username/password file; values are never logged",
    )
    value.add_argument(
        "--workers",
        type=int,
        choices=range(1, 5),
        default=4,
        help="Maximum concurrent granules (1–4)",
    )
    mode = value.add_mutually_exclusive_group()
    mode.add_argument(
        "--offline", action="store_true", help="Require existing tracked/local caches"
    )
    mode.add_argument(
        "--refresh", action="store_true", help="Refresh public sources (WRA <=60 requests)"
    )
    return value


def _require_windows(names: list[str], keys: list[str]) -> None:
    missing = [
        f"{key}/{observation_times(name)[0][:10]}"
        for key in keys
        for name in names
        if not (
            ROOT / "data/cache" / f"{key}_{observation_times(name)[0][:10].replace('-', '')}.npz"
        ).exists()
    ]
    if missing:
        raise ValueError(
            f"Missing {len(missing)} calibrated AOI windows (first: {missing[0]}). "
            "Run read with Earthdata credentials, or select cached dates/reservoirs."
        )


def _read(args: argparse.Namespace, names: list[str], keys: list[str]) -> None:
    if args.offline:
        _require_windows(names, keys)
        print("Authenticated AOI caches present; no network used.")
        return
    from .remote import load_credentials, read_all

    path = args.credentials_file
    if path is None and os.getenv("EARTHDATA_CREDENTIALS_FILE"):
        path = Path(os.environ["EARTHDATA_CREDENTIALS_FILE"])
    load_credentials(path)
    read_all(ROOT, names, keys, workers=args.workers)


def _process(names: list[str], keys: list[str], all_names: list[str]) -> None:
    if set(keys) - set(EXPERIMENT_KEYS):
        raise ValueError("Frozen experiment covers baoshan2,liyutan. Select those reservoirs.")
    from .numeric_export import prepare
    from .validation import freeze_calibration

    _require_windows(names, keys)
    calibration = freeze_calibration(ROOT, all_names)
    prepared = prepare(ROOT, names, keys, calibration)
    for key, item in prepared.items():
        folder = ROOT / "data/cache/processed" / key
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "mask.bin").write_bytes(item["mask"].tobytes(order="C"))
        write_json(
            folder / "meta.json",
            {
                "grid": item["grid"],
                "thresholds": item["thresholds"],
                "classification_channel": item["classification_channel"],
                "status": "unvalidated candidate; not a website asset",
            },
        )
        for date, channels in item["rasters"].items():
            for polarization, raster in channels.items():
                (folder / f"{date.replace('-', '')}_{polarization}.bin").write_bytes(
                    raster.tobytes(order="C")
                )
    print(f"Processed {len(names)} dates × {len(keys)} reservoirs into ignored candidate cache.")


def _measure(all_names: list[str]) -> dict[str, Any]:
    from .validation import evaluate, freeze_calibration

    _require_windows(all_names, EXPERIMENT_KEYS)
    configuration = freeze_calibration(ROOT, all_names)
    report, _ = evaluate(ROOT, all_names, configuration)
    write_json(ASSETS / "numeric-validation.json", report)
    print(
        json.dumps(
            {
                "passed": report["passed"],
                "reservoirs": {
                    key: {
                        "channel": item["classification_channel"],
                        "heldout": item["heldout"],
                        "all_dates": item["all_dates"],
                        "passed": item["passed"],
                    }
                    for key, item in report["reservoirs"].items()
                },
            },
            indent=2,
        )
    )
    return report


def _validate_published_numeric() -> None:
    """Never erase a later scientific release when reproducing this earlier CLI."""
    output = ROOT / "web/public/data"
    provenance = json.loads((output / "provenance.json").read_text())
    assets = provenance.get("numeric_assets", [])
    if not assets:
        raise ValueError("Numeric manifest lacks asset provenance; refuse to overwrite it.")
    for asset in assets:
        path = output / asset["path"]
        if not path.exists() or hashlib.sha256(path.read_bytes()).hexdigest() != asset["sha256"]:
            raise ValueError(
                "Published numeric asset integrity check failed; release remains unchanged."
            )
    print("Preserved existing numeric release; tracked asset checksums validated.")


def main() -> int:
    args = parser().parse_args()
    keys = list(dict.fromkeys(args.reservoirs.split(",")))
    unknown = set(keys) - {item["key"] for item in RESERVOIRS}
    if unknown:
        print(f"Unknown reservoir keys: {', '.join(sorted(unknown))}", file=sys.stderr)
        return 2
    all_names: list[str] = json.loads((ASSETS / "granules_seed.json").read_text())
    names = all_names
    if args.dates:
        selected = set(args.dates.split(","))
        valid = {observation_times(name)[0][:10] for name in names}
        if selected - valid:
            print(
                "Dates must match available observations; gap dates cannot be selected.",
                file=sys.stderr,
            )
            return 2
        names = [name for name in names if observation_times(name)[0][:10] in selected]
    if args.dry_run:
        print(
            json.dumps(
                {
                    "command": args.command,
                    "mode": "numeric experiment" if args.numeric else "browse",
                    "reservoirs": keys,
                    "dates": [observation_times(n)[0][:10] for n in names],
                    "network": not args.offline
                    and (args.refresh or args.command in {"read", "all"}),
                    "publication": "blocked unless independent scientific validation passes",
                },
                indent=2,
            )
        )
        return 0
    try:
        if args.command == "release":
            if args.dates:
                raise ValueError("The reviewed release requires the complete acquisition list.")
            from .release import release

            report = release(ROOT, all_names, keys)
            print(
                json.dumps(
                    {
                        key: {
                            "grade": item["statistics"]["grade"],
                            "n": item["statistics"]["n"],
                            "pearson_r": item["statistics"]["pearson_area_vs_level"],
                            "spearman_rho": item["statistics"]["spearman_area_vs_level"],
                            "pearson_ci95": item["statistics"]["pearson_ci95"],
                        }
                        for key, item in report["reservoirs"].items()
                    },
                    indent=2,
                )
            )
            return 0
        if args.command == "read":
            _read(args, names, keys)
            return 0
        if args.command == "process":
            _process(names, keys, all_names)
            return 0
        if args.command == "gates":
            from .validation import gate_evidence

            evidence = gate_evidence(ROOT, all_names)
            print(
                json.dumps(
                    {
                        "ga": evidence["ga"],
                        "gb_epsg": evidence["gb"]["epsg"],
                        "gc_status": evidence["gc"]["status"],
                        "gd": evidence["gd"],
                    },
                    indent=2,
                )
            )
            return 0 if evidence["gd"]["passed"] else 2
        if args.command == "measure" or args.numeric:
            if args.dates or set(keys) != set(EXPERIMENT_KEYS):
                raise ValueError(
                    "Validation requires all21 dates and --reservoirs baoshan2,liyutan."
                )
            if args.command == "all":
                _read(args, names, keys)
            report = _measure(all_names)
            if not report["passed"]:
                print(
                    "Scientific validation failed (held-out rho below 0.8). "
                    "Publication blocked; the browse release remains unchanged.",
                    file=sys.stderr,
                )
                return 2
            if args.numeric:
                raise ValueError(
                    "Validation report changed. A reviewed release implementation is required "
                    "before publishing quantitative assets; browse mode is preserved."
                )
            return 0
        if args.command in {"discover", "all"}:
            if args.offline and not (ASSETS / "cmr-response.json").exists():
                raise RuntimeError("Missing CMR cache; run discover with network access first.")
            discover(ASSETS, all_names, refresh=args.refresh)
        if args.command in {"geometry", "all"}:
            if args.offline and not (ASSETS / "reservoirs.geojson").exists():
                raise RuntimeError("Missing OSM cache; run geometry with network access first.")
            geometry(ASSETS, refresh=args.refresh)
        if args.command in {"official", "all"} and args.refresh:
            dates = {observation_times(name)[1][:10] for name in names}
            dates.update(
                row["local_date"] for row in load_seed(ASSETS / "wra_seed.csv")["baoshan2"]
            )
            cache = official_refresh(ASSETS, sorted(dates))
            cache["seed_validation"] = compare_seed(cache, ASSETS / "wra_seed.csv")
            write_json(ASSETS / "wra_cache.json", cache)
        if args.command == "all" and not args.offline:
            records = acquire_browse(ROOT / "web/public/data", names)
            source_path = ASSETS / "source-checks.json"
            source = json.loads(source_path.read_text()) if source_path.exists() else {}
            source.setdefault("retrieved_at", timestamp())
            source["browse"] = records
            write_json(source_path, source)
        if args.command in {"official", "export", "all"}:
            index_path = ROOT / "web/public/data/index.json"
            if index_path.exists() and json.loads(index_path.read_text())["mode"] != "browse":
                _validate_published_numeric()
                return 0
            checks = ASSETS / "source-checks.json"
            generated = (
                json.loads(checks.read_text()).get("retrieved_at") if checks.exists() else None
            )
            index = export(ROOT, names, keys, generated_at=generated or "2026-11-14")
            print(
                f"Exported level-2 browse edition: {len(index['dates'])} observations, "
                f"{len(index['reservoirs'])} reservoirs; numerical publication is not validated."
            )
        else:
            print(f"{args.command}: cached public source validated.")
        return 0
    except (RuntimeError, ValueError, KeyError, OSError) as error:
        print(f"{args.command} failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

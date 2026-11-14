"""Reproduce ADV-10 from unchanged published observations; no network or secrets."""

import argparse
import hashlib
import json
import subprocess
from pathlib import Path

from water_pulse.storage_estimation import REFERENCE_ADVICE_SHA256, evaluate_archive

ROOT = Path(__file__).resolve().parents[2]
BASELINE_COMMIT = "b037f2bfd4985ee9651b57a46f9a8dc68fff3010"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output", type=Path, default=ROOT / "web/public/data/storage-estimation.json"
    )
    parser.add_argument("--source-commit", default=BASELINE_COMMIT)
    parser.add_argument(
        "--check", action="store_true", help="Verify the existing report, without writing."
    )
    args = parser.parse_args()
    public = ROOT / "web/public/data"
    index = json.loads((public / "index.json").read_text())
    inputs, sources = {}, []
    source_paths = [public / "index.json"]
    for reservoir in index["reservoirs"]:
        key = reservoir["key"]
        folder = public / "reservoirs" / key
        meta_path, series_path = folder / "meta.json", folder / "timeseries.json"
        source_paths.extend((meta_path, series_path))
        meta, series = (json.loads(p.read_text()) for p in (meta_path, series_path))
        inputs[key] = {"grade": meta["validation"]["grade"], "records": series["records"]}
    for path in source_paths:
        relative = path.relative_to(ROOT).as_posix()
        body = path.read_bytes()
        # Refuse to associate changed scientific data with an old provenance commit.
        archived = subprocess.run(
            ["/usr/bin/git", "show", f"{args.source_commit}:{relative}"],
            cwd=ROOT,
            capture_output=True,
            check=True,
        ).stdout
        if archived != body:
            raise ValueError(f"Published source differs from --source-commit: {relative}")
        sources.append({"path": relative, "sha256": hashlib.sha256(body).hexdigest()})
    code_paths = [ROOT / "pipeline/src/water_pulse/storage_estimation.py", Path(__file__).resolve()]
    source = {
        "commit": args.source_commit,
        "files": sources,
        "code_files": [
            {
                "path": p.relative_to(ROOT).as_posix(),
                "sha256": hashlib.sha256(p.read_bytes()).hexdigest(),
            }
            for p in code_paths
        ],
        "advice_document": "06-storage-estimation-advice.md",
        "advice_sha256": REFERENCE_ADVICE_SHA256,
        "reproduction": "uv run --project pipeline python pipeline/scripts/evaluate_storage.py",
    }
    report = evaluate_archive(inputs, index["gap"]["start"], source)
    if not report["gate"]["passed"]:
        print("DEF-12 completeness gate failed; no public report was written.")
        for check in report["gate"]["checks"]:
            if not check["passed"]:
                print(check["name"])
        return 2
    serialized = json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    if args.check:
        if not args.output.exists() or args.output.read_text() != serialized:
            print("Stored DEF-12 report differs from deterministic recomputation.")
            return 1
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        temporary = args.output.with_suffix(".tmp")
        temporary.write_text(serialized)
        temporary.replace(args.output)
    for key, result in report["reservoirs"].items():
        if not result["eligible"]:
            print(f"{key}: no estimation ({result['reason']}; grade {result['grade']})")
            continue
        high, numeric = result["evaluation"]["high"], result["evaluation"]["numeric"]
        print(
            f"{key}: high n={high['n']}, lower={high['actual_min_pct']:.6f}%; "
            f"low LOO n={numeric['n']}, MAE={numeric['mae_pp']:.6f} pp, "
            f"max={numeric['max_abs_error_pp']:.6f} pp; "
            f"misclassified={len(high['misclassified'])}"
        )
    print("DEF-12 completeness checks passed; this is not independent accuracy validation.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

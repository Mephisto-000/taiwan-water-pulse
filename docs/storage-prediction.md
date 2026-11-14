# Two-stage SAR storage alignment / 兩段式蓄水率估計

Status: local ADV-10 implementation, not pushed or deployed. The current public website and historical deployment evidence are separate from this change.

In Charts, **Estimate storage from SAR / 由 SAR 估計蓄水率** defaults to two-stage estimation. **Adjust prediction method / 調整估計方法** retains the original first-N linear model as a comparison. Grade A is required for either method. Feitsui is grade B because its variation is smaller than method sensitivity; Shimen is grade C because its signal cannot be resolved reliably. Their method dialogs explain why estimation is unavailable. This restriction does not change any grade, published area, classification threshold or official observation.

## Fixed definitions

The implementation follows `06-storage-estimation-advice.md` §§2.2–2.3, ADV-10 and DEF-06/07/11/12. The machine-readable results and definitions are in [`web/public/data/storage-estimation.json`](../web/public/data/storage-estimation.json).

| Definition | Implementation |
| --- | --- |
| DEF-06: full-pool range | Use every paired observation with official storage ≥99.5%, retaining QA flags. Calculate area mean μ and sample standard deviation σ (`ddof=1`). The lower area boundary is μ−2σ; at least three full-pool observations are required. This sample SD is specific to Align and does not replace the existing descriptive population SD in the Grade report. |
| Drawdown cohort | Use observations whose UTC acquisition date precedes `index.json.gap.start`. The current archive has 11 such observations. This boundary follows the existing long product gap; it is not selected to improve error. |
| DEF-07: earliest detection | Find the first drawdown observation with area strictly below μ−2σ; also report μ−3σ as a sensitivity result. Display the Taiwan date and the actual official storage at that observation. The 3σ result does not replace the fixed 2σ estimation rule. |
| DEF-11: high class | Area ≥μ−2σ yields only “偏高，分不出更細 / High; finer levels unresolved.” Its band runs from the minimum actual storage among these high-class dates to 100%. No single numerical estimate is assigned. |
| DEF-11: numerical class | Calibrate with the last drawdown observation still inside the full-pool range, plus the drawdown observations below the boundary. Sort by area and interpolate linearly between adjacent points. Below the smallest calibrated area, extrapolate using the two smallest-area points. Clamp the result to 0–100%, retaining the raw value, extrapolation flag and clamp flag. Do not impose monotonicity, discard unusual points or retune the classifier. |
| DEF-12: high-class assessment | Report class count, minimum observed storage and both misclassification directions separately. Reference high storage means actual storage at least the observed high-class minimum. This is descriptive: the minimum is derived from the same class, so zero false-high errors do not establish independent classification accuracy. |
| DEF-12: numerical assessment | Hold out each below-boundary drawdown observation in turn. Keep the full-pool boundary and the last in-range anchor fixed, remove the held-out observation from calibration, and estimate it from the remaining points. Report every fold, mean absolute error and maximum absolute error in percentage points. Do not combine these errors with the categorical assessment. |

The full-pool boundary uses the entire year's full-pool dates. The low-water folds assess interpolation conditional on that boundary; they do not independently validate the whole workflow. Adjacent dates are related, and only one drawdown is available.

## Recomputed results

All dates below are Taiwan calendar dates. The report retains the UTC timestamps as well.

| Quantity | Baoshan II | Liyutan |
| --- | ---: | ---: |
| Full-pool observations | 8 | 7 |
| μ (km²) | 1.321425 | 3.783471429 |
| Sample σ (km²) | 0.015989707 | 0.029937363 |
| μ−2σ (km²) | 1.289445587 | 3.723596702 |
| High-class count | 15 | 16 |
| Minimum actual storage in high class | 71.3623% | 68.0981% |
| False-high / false-low counts | 0 / 1 | 0 / 0 |
| Low-water folds | 5 | 5 |
| Low-water MAE (percentage points) | 5.1744 | 3.9826 |
| Maximum absolute error (percentage points) | 9.2150 | 10.3904 |
| Earliest 2σ detection | 2026-01-29, 65.6791% | 2026-01-29, 63.9088% |
| Earliest 3σ detection | 2026-02-10, 58.0496% | 2026-02-10, 59.2261% |

| Held-out Taiwan date | Baoshan II absolute error (pp) | Liyutan absolute error (pp) |
| --- | ---: | ---: |
| 2026-01-29 | 2.3044 | 0.0142 |
| 2026-02-10 | 2.7943 | 0.4021 |
| 2026-02-22 | 3.4147 | 0.2260 |
| 2026-03-06 | 8.1435 | 10.3904 |
| 2026-03-18 | 9.2150 | 8.8801 |

Baoshan II's 4 July 2026 observation falls below the area boundary despite 100% official storage. The complete calibrated model estimates 66.2204% for that date. Its `full_storage_area_below_median_minus_3_mad` flag remains, and it is counted as a false-low classification rather than silently removed. Liyutan has no such mismatch under this descriptive reference.

The two low-water cohorts together have a mean absolute error of 4.5785 percentage points; this may be described as “about 4.6 points on average.” It is neither a ±4.6 prediction interval nor a bound for every date. The largest error is 10.3904 points. A high annual grade does not make high-water storage identifiable.

## Chart and selected-date presentation

- High-class dates use pale bands labelled **偏高，分不出更細**. There is no single estimated percentage or overflow triangle for these dates in the two-stage view. Official gauge percentages remain official observations and are not hidden.
- Numerical dates use points and error bars. Bars are the estimate ± that reservoir's maximum absolute leave-one-out error, clipped to 0–100%. This is a fixed descriptive display rule added where ADV-10 asks for a range; it is not a confidence interval, a future-error guarantee or a new parameter search.
- Calibration points are labelled as calibration. The complete model passes through these points; their displayed agreement with official values is not held-out performance. Only DEF-12's separately recorded folds supply the numerical evaluation.
- Extrapolated dates and QA flags stay visible. High bands do not bridge the long radar-product gap or imply observations on missing dates.
- The summary separates high-class counts, observed lower bound and misclassifications from low-water MAE and maximum error. The method dialog explains full-pool selection, sample SD, the drawdown anchor, the evaluation cohort and limitations.

The Chinese and English explanation follows the two **Grade / Align** steps in 06 §4. Its numerical placeholders use the recomputed range 68.1–71.4% for the descriptive high-water boundary, first-detection storage 63.9–65.7%, low-water mean error 4.6 points and maximum error 10.4 points. “±5” is expressed as an average error and a separate maximum, rather than a precision guarantee. “Cannot replace a gauge” preserves the intended use where current gauge data are unavailable without claiming an unfair comparison between different evaluation cohorts.

## Linear comparison and baselines

The original first-N model uses ordinary least squares with an intercept, fitted only to the earliest N valid chronological pairs. At least three later pairs remain for evaluation. Later official percentages are used only for MAE/RMSE, not fitting. The report lists N=3 through N=12 without choosing the best result. Model values and error calculations remain unclamped for this comparison. Boundary triangles identify estimates outside the fixed 0–100% chart axis; those triangles belong only to the explicitly selected linear comparison.

The report names each baseline and its evaluation cohort:

- `calibration_mean`: for each of the same five low-water leave-one-out folds, estimate the held-out storage using the mean of that fold's remaining calibration points.
- `archive_mean`: an in-sample, all-archive mean benchmark, reported separately rather than presented as held-out prediction.
- `previous_official`: reuse the previous official reading only when its observation is exactly **12 Taiwan calendar days** earlier. Do not cross the long gap or treat a 24-day interval as a 12-day reading. The n=17 MAE is 4.4607 points for Baoshan II and 4.3833 for Liyutan.
- `previous_official_low_water`: report the previous official reading on the same five low-water evaluation dates so the reader can compare a matched cohort with the two-stage numerical result.

The all-archive and previous-reading benchmarks use different cohorts from the five-fold low-water assessment; their aggregate errors alone do not establish relative performance.

| Numerical benchmark MAE (percentage points) | Cohort size per reservoir | Baoshan II | Liyutan |
| --- | ---: | ---: | ---: |
| Two-stage leave-one-out | 5 | 5.1744 | 3.9826 |
| Remaining calibration mean, same folds | 5 | 14.4415 | 11.7158 |
| Previous official reading, same low-water dates | 5 | 8.6345 | 6.7446 |
| Previous official reading, every exact 12-day pair | 17 | 4.4607 | 4.3833 |
| Archive mean, descriptive in-sample benchmark | 21 | 18.6293 | 17.0723 |

The advice's rounded ADV-10 counts, low-water errors and detection dates are reproduced. Its Liyutan previous-reading baseline of 4.3 differs from this strict 12-day result of 4.4. Including the two 24-day intervals gives n=19 and 4.3255 points, which explains the reference's rounded value; those intervals are excluded from the explicitly 12-day baseline. See [decisions](decisions.md).

## Reproduction and completion checks

Run from the repository root using the existing isolated environments:

```bash
uv sync --project pipeline --frozen
uv run --project pipeline python pipeline/scripts/evaluate_storage.py
uv run --project pipeline python pipeline/scripts/evaluate_storage.py --check
uv run --project pipeline pytest pipeline/tests/test_storage_estimation.py
uv run --project pipeline pytest pipeline/tests
npm --prefix web test
npm --prefix web run format:check
npm --prefix web run build
npm --prefix web run check:deploy
```

The evaluation script reads the existing published manifest, reservoir metadata and paired area series, and writes only the separate storage-estimation report. `--check` checks deterministic recomputation against the saved report without rewriting it. `--output PATH` writes an alternative report. `--source-commit SHA` selects a source reference; the default is `b037f2b`, and the script compares each scientific input against that commit before attributing it. Source hashes and definitions make the result traceable. It neither downloads new observations nor runs the classification/export pipeline. No new dependency, Earthdata credential or network request is needed.

DEF-12 specifies what to calculate, but supplies no numerical acceptance threshold. The report's `gate` contains a `passed` flag and named checks of whether the prescribed evaluation is complete and internally consistent; passing it is not a scientific accuracy certification. A missing or failed report must not enable two-stage estimation. Merge/publication remains separate from calculation: this local change is not pushed or deployed.

## Local verification and changed files

The ADV-10 implementation passed 115 frontend tests, 9 deployment-guard tests and 61 Python tests, including 14 new calculation tests. TypeScript/build, frontend formatting, deterministic report comparison, the deployment artifact check and Ruff on the three new Python files passed. Browser checks covered both languages, both estimation methods, the grade B/C explanations and the selected-date result. The final chart had no console errors or horizontal overflow.

The repository-wide Ruff check still reports 17 pre-existing issues in `fetch_weather.py` and `test_fetch_weather.py`. Those unrelated files were not changed; this is not a claim that the entire existing CI workflow is green. No new dependency was installed, and all nine existing scientific input files matched the source commit byte for byte.

This implementation changes the following 26 files:

| Area | Files |
| --- | --- |
| Calculation and reproducible evaluation | `pipeline/src/water_pulse/storage_estimation.py`, `pipeline/scripts/evaluate_storage.py`, `pipeline/tests/test_storage_estimation.py`, `web/public/data/storage-estimation.json` |
| Report types, validation and loading | `web/src/storageEstimationTypes.ts`, `web/src/storageEstimation.ts`, `web/src/storageEstimation.test.ts`, `web/src/components/useStorageEstimation.ts` |
| Chart, dialog and selected-date integration | `web/src/App.tsx`, `web/src/components/AnalysisCharts.tsx`, `web/src/components/ChartsWorkspace.tsx`, `web/src/components/PredictionSettings.tsx`, `web/src/components/WorkspaceInspector.tsx`, `web/src/components/TwoStagePredictionLayer.tsx`, `web/src/components/TwoStagePredictionLayer.test.tsx`, `web/src/components/TwoStageEvaluation.tsx`, `web/src/components/StorageEstimateDetail.tsx`, `web/src/components/StorageExplanation.tsx`, `web/src/components/StorageEstimation.test.tsx`, `web/src/style.css` |
| CI and documentation | `.github/workflows/ci.yml`, `README.md`, `README.en.md`, `docs/decisions.md`, `docs/dependency-management.md`, `docs/storage-prediction.md` |

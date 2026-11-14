# SAR storage alignment

In Charts, enable **Align Prediction Mode** to fit a linear mapping from HH radar water area (km²) to official storage (%). Choose the first N valid, chronologically ordered pairs (default 6). At least three pairs remain for evaluation. The fit is ordinary least squares with an intercept; later official percentages are used only to calculate MAE and RMSE in percentage points.

Orange squares and dashed lines show estimates on acquisition dates, not future forecasts. Hollow orange squares and shading identify the calibration period. Black lines and circles remain official observations. Lines break across acquisition gaps longer than 36 days. Out-of-range predictions are displayed without clipping; the axis expands to include them. Extrapolation beyond the calibration area range is counted explicitly. Near-constant area prevents fitting, and a storage span below 10 percentage points or a non-positive slope raises a warning. These are transparent usability checks, not a scientific acceptance standard.

Changing N changes the model and the evaluation period. Early full-pool samples may fail to explain dry-season behavior. A linear area-to-storage relationship is only a baseline: reservoir geometry, radar classification error and operations can all violate it. Previously selected area-processing parameters already used this archive, so this chronological experiment is not an independent validation of the complete pipeline. Grade C reservoirs remain disabled for quantitative prediction. No prediction confidence interval is claimed.

The existing vertical radar-area bars remain threshold sensitivity (0.5/0.7), not predictive uncertainty. Source observations and published validation grades are unchanged.

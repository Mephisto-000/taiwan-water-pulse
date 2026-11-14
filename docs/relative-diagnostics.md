# Relative-power diagnostic audit

Method fixed to HH, relative ratio 0.6, exact OSM mask (0 m buffer). Scale comparisons are exploratory, not held-out validation. Bbox diagnostics use complete native UTM cells with the local cached exterior reference (approximately 600 m padding), rather than the review screenshot's 5.1 km reference.

## Step 1 — historical Baoshan II channel-only swaps

| Interpretation | Threshold dB | Held-out r / rho / n | All-date r / rho / n |
| --- | ---: | --- | --- |
| strict_same_numeric_threshold | -15.858760 | -0.208509 / -0.601227 / 17 | -0.134080 / -0.528609 / 21 |
| select_existing_HH_configuration | -14.000000 | -0.187823 / -0.495098 / 17 | -0.124053 / -0.400000 / 21 |

Neither interpretation rescued the original rule. All mask/filter settings remain historical.

## Steps 2 and 3 — fixed bbox classifier across all scales

Both 170 m HH core results exceeded the predeclared r>0.85 check before the scale ladder was inspected. No channel, ratio or mask buffer was selected against official values.

| Reservoir | Grid m | HH r | HH rho | HV r | HV rho | n |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Baoshan II | 170 | 0.969767 | 0.788369 | 0.139213 | 0.668016 | 21 |
| Baoshan II | 100 | 0.958266 | 0.847205 | 0.227853 | 0.738486 | 21 |
| Baoshan II | 50 | 0.794147 | 0.402083 | -0.044050 | 0.135241 | 21 |
| Baoshan II | 30 | 0.556557 | 0.233842 | -0.199227 | -0.363223 | 21 |
| Baoshan II | 10 | 0.713368 | 0.424675 | -0.073359 | 0.189610 | 21 |
| Liyutan | 170 | 0.922357 | 0.845356 | 0.857915 | 0.810614 | 21 |
| Liyutan | 100 | 0.728950 | 0.638438 | 0.404572 | 0.306038 | 21 |
| Liyutan | 50 | 0.575353 | 0.328130 | 0.077552 | -0.004550 | 21 |
| Liyutan | 30 | 0.661663 | 0.406758 | 0.199447 | 0.068876 | 21 |
| Liyutan | 10 | 0.847545 | 0.822612 | 0.763416 | 0.662118 | 21 |
| Shimen | 170 | 0.217433 | 0.116707 | -0.090388 | 0.091031 | 21 |
| Shimen | 100 | 0.299128 | -0.153746 | -0.220864 | -0.283529 | 21 |
| Shimen | 50 | -0.057077 | -0.215215 | -0.381215 | -0.401560 | 21 |
| Shimen | 30 | -0.138258 | -0.332034 | -0.355411 | -0.384016 | 21 |
| Shimen | 10 | 0.122796 | -0.013645 | -0.191813 | -0.224172 | 21 |
| Feitsui | 170 | 0.919886 | 0.852089 | 0.668904 | 0.651079 | 20 |
| Feitsui | 100 | 0.768288 | 0.689733 | 0.518257 | 0.473110 | 20 |
| Feitsui | 50 | 0.631987 | 0.563910 | 0.604134 | 0.465589 | 20 |
| Feitsui | 30 | 0.568291 | 0.469173 | 0.573031 | 0.478195 | 20 |
| Feitsui | 10 | 0.633808 | 0.491729 | 0.622626 | 0.457143 | 20 |

## Exact OSM mask check and final scale

The final zero-buffer polygon removes unrelated dark pixels inside the broader bbox. It is the predefined reservoir geometry, not a shape fitted to official values. 30 m is the finest listed scale meeting grade A for both core reservoirs; at 10 m both r values exceed 0.85, but Baoshan II's confidence-interval lower bound is below 0.6.

| Reservoir | Grid m | r (95% interval) | rho | n | Grade | Physical checks |
| --- | ---: | --- | ---: | ---: | --- | --- |
| Baoshan II | 170 | 0.966321 (0.884489, 0.987280) | 0.710384 | 21 | A | True |
| Baoshan II | 30 | 0.936345 (0.734129, 0.979717) | 0.755686 | 21 | A | True |
| Baoshan II | 10 | 0.896325 (0.517994, 0.979470) | 0.638961 | 21 | B | True |
| Liyutan | 170 | 0.944591 (0.830384, 0.978417) | 0.886649 | 21 | A | True |
| Liyutan | 30 | 0.914557 (0.753336, 0.960851) | 0.782510 | 21 | A | True |
| Liyutan | 10 | 0.946950 (0.843957, 0.979238) | 0.875894 | 21 | A | True |
| Shimen | 170 | 0.403486 (0.140664, 0.706689) | 0.353550 | 21 | C | True |
| Shimen | 30 | 0.504781 (-0.357065, 0.828193) | 0.083523 | 21 | B | True |
| Shimen | 10 | 0.168122 (-0.218498, 0.665834) | -0.157245 | 21 | C | True |
| Feitsui | 170 | 0.873907 (0.784684, 0.941968) | 0.864032 | 20 | A | True |
| Feitsui | 30 | 0.820627 (0.673708, 0.917643) | 0.746145 | 20 | A | True |
| Feitsui | 10 | 0.831419 (0.688092, 0.958372) | 0.774436 | 20 | A | True |

Shimen 30 m is B by the literal scalar grading rule but has a zero-crossing interval and rho near zero. The published reason is `LOW_CONFIDENCE`; it is not evidence of reliable monitoring.

## Exposed-bed hypothesis (descriptive only)

Candidate groups are November HH water / March HH nonwater, not independent ground-truth dry bed. This selection makes an HH increase expected; the HV comparison can reveal channel contrast but cannot prove a physical cause. Stable-HH-water and reference-ring groups are retained in the JSON.

| Reservoir | Candidate pixels | March HH dB | March HV dB | HH change dB | HV change dB | March fraction still HV-dark |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Baoshan II | 203 | -5.551 | -15.787 | 6.614 | 2.205 | 0.759 |
| Liyutan | 393 | -6.654 | -14.685 | 5.827 | 4.252 | 0.733 |

HV stays relatively dark in many HH-defined transition pixels. This is consistent with channel-dependent contrast; it does not establish exposure or a false-positive rate without independent water/land reference data.

Reproduce with `uv run --project pipeline python -m water_pulse.diagnostics`. Complete observations and fixed parameters are in `pipeline/assets/relative-diagnostics.json` and [the public report](https://taiwan-water-pulse.vercel.app/data/diagnostics.json).

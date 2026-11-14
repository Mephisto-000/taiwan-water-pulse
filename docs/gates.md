# Gate evidence

Date: 2026-11-14 (Asia/Taipei). This is a fallback-level-2 release. The original numerical acceptance criteria remain open.

## Preflight

The initial checkout contained no application files or commits and pointed to `https://github.com/Mephisto-000/taiwan-water-pulse.git`. Observed tools: Node.js `v24.15.0`, npm `11.12.1`, uv `0.13.8`. The default macOS `python3` was `3.9.6`; the project uses an available Python 3.14 interpreter instead.

The initial presence-only environment check found no exported Earthdata credentials. The user later supplied a local credential file, which is ignored and excluded from the repository. Authenticated numerical access and actual HDF5 structure passed G-A and G-B. The initial HH direction test failed, and both frozen R-01 alternatives then failed independent held-out validation; quantitative publication stopped. Credential availability alone is not used as gate evidence. No credential contents are recorded here. The sandbox's initial GitHub DNS request failed; network capability is distinct from an authentication result.

## Scientific and source gates

| Gate | State | Evidence and implication |
| --- | --- | --- |
| G-A Authentication and streaming | Passed | One 17 March 2026 granule was opened once and all four reservoir windows were read for HH, HV, mask and looks in 91.279 s. HTTPS Range transferred 79,691,776 bytes over 76 blocks, below the 3-minute criterion and without downloading the full granule. |
| G-B Actual HDF5 structure | Passed | Actual coordinates report EPSG:32651, x spacing +10 m, y spacing −10 m. HH/HV arrays are float32 with NaN fill. Mask attributes identify 0 as invalid/partial focus, 255 as outside imagery and positive subswath codes as valid. |
| G-C Numerical separation | Not scientifically established | Threshold-separated groups were found, but separated medians alone do not prove physical water/land classes. Neither synthetic tests nor the threshold-group check establishes classification validity. |
| G-D Temporal direction and validation | Failed; quantitative release stopped | Default HH failed the four-date ordering. R-01 alternatives passed the four calibration dates but failed the remaining 17-date validation: Spearman 0.421569 for Baoshan II and 0.436810 for Liyutan, both below 0.8. |
| G-E Official source | Passed; discrepancy documented | Anonymous two-date probe returned HTTP 200, 16 records, 7,469 bytes in 0.349 s; all matched the seed at its precision. A subsequent 45-request refresh exported 88 sampled dates per station. All seed percentages match; one 0.01 m level discrepancy follows the actual response. |
| G-F Reservoir boundaries | Passed | A single anonymous Nominatim lookup returned HTTP 200, 8 polygons, 272,641 bytes in 1.495 s. All reservoir bounding boxes are within the supplied frame. The four main polygon areas match the supplied reference within 0.014%. |
| G-G Public host | Partially passed | Vercel production is READY; anonymous interaction and all 54 public files verified. Owner push → Git deployment remains untested because private-repo integration is not connected. See deployment.md. |

## Authenticated HDF5 measurements

For the 17 March 2026 granule (`NISAR_L2_PR_GCOV_015_111_A_014_4005_DHDH_A_20260317T211647_20260317T211719_P05023_N_F_J_001`), the run read all four main reservoir windows for HHHH, HVHV, mask and number-of-looks data. The file was opened once. Total elapsed time was 91.279 s and observed Range transfer was 79,691,776 bytes across 76 blocks.

The actual frequency-A projection is EPSG:32651, with ascending x coordinates at +10 m spacing and descending y coordinates at −10 m spacing. HH/HV dtype is float32 and fill is NaN. Mask semantics were checked against dataset attributes: 0 is invalid/partial focus, 255 is outside imagery, and positive subswath codes other than 255 are valid. Those facts come from the opened product, rather than assumed file layout.

The sanitized source structure, mask attributes, original read metrics and baseline failure are retained in [numeric-gates.json](../pipeline/assets/numeric-gates.json). Credentials and authorization headers are excluded. `uv run --project pipeline water-pulse gates --offline` recomputes the original four-date baseline from cached arrays and returns exit code 2 for the recorded failure.

G-A and G-B establish access and file interpretation. They do not establish water-detection accuracy or temporal validation. The published frontend remains in browse mode because the subsequent independent numerical validation failed.

## Initial numerical direction check and independent replay

The first calibrated four-date HH run used the prescribed clipped pooled threshold, −14 dB. Diagnostic dark-pixel candidate areas for Baoshan II were 0.1350, 0.1475, 0.1895 and 0.2006 km² for 5 November 2025, 16 January, 17 March and 21 June 2026. This **fails G-D**: it is not the expected full-to-dry ordering. These values are diagnostic evidence, not validated water-area results.

The threshold-separated groups had medians −14.37 and −7.44 dB, a 6.93 dB difference. That difference alone does not prove two physical water/land populations: splitting a distribution at a threshold can also produce separated medians. G-C therefore cannot be claimed as a physical water/land validation pass.

An independent local replay rasterized the OSM polygon directly onto the native EPSG:32651 grid and applied a separate 3×3 linear-power mean. It did not use the Web Mercator reprojection, Uint8 quantization or 150 m analysis buffer. Polygon raster area was 1.4005 km² versus the supplied 1.404 km² reference; all four dates shared the same grid, and source mask values inside the polygon were all 1. The native HH −14 dB counts still had the wrong direction (0.1478, 0.1650, 0.2030 and 0.2182 km²). This evidence weighs against reprojection, quantization, coordinate direction or mask invalid-code interpretation as the cause.

Native filtered HH medians inside the polygon were approximately −12.45, −12.63, −12.18 and −12.71 dB. The prescribed −14 dB upper bound therefore selects the darker tail rather than most of that mapped water extent. Native HV at −14 dB produced the expected four-date ordering, but the difference was small; this is a diagnostic lead for R-01, not an independently validated classification. Choosing parameters to fit only these four dates could overfit the gate, so no numerical frontend result is enabled on that evidence alone.

## Frozen calibration and failed held-out validation

After the initial HH failure, R-01 was evaluated with rules fixed **before** inspecting the remaining acquisition dates. The calibration dates are 5 November 2025, 16 January, 17 March and 21 June 2026. The other 17 listed acquisition dates form the held-out validation set. Gauge pairs are excluded only when the corresponding official water level is missing; sample counts must be reported with each result.

| Reservoir | Frozen candidate rule | Calibration dates | Held-out result | Publication state |
| --- | --- | ---: | --- | --- |
| Baoshan II | HV classification; OSM polygon with 0 m buffer; fixed four-date pooled Otsu threshold −15.8587598425 dB | 4 | Spearman 0.421569, n=17: failed | Numerical output withheld |
| Liyutan | HH classification; 150 m buffered OSM mask; fixed four-date threshold −14 dB | 4 | Spearman 0.436810, n=17: failed | Numerical output withheld |

The predeclared promotion requirement was held-out Spearman correlation of classified candidate area versus official water level **≥0.8 for each reservoir**, with valid paired sample counts and the calibration/validation split preserved in provenance. Both alternatives failed. Their four calibration dates having the expected direction was insufficient. No retuning was performed against the held-out results to change this outcome.

| Diagnostic | Baoshan II frozen HV candidate | Liyutan frozen HH candidate |
| --- | ---: | ---: |
| Held-out paired n | 17 | 17 |
| Held-out Spearman ρ | 0.4215686275 | 0.4368101448 |
| Held-out Pearson r | −0.0744936811 | 0.3879747987 |
| All-date paired n (includes calibration) | 21 | 21 |
| All-date Spearman ρ | 0.5376623377 | 0.4821313558 |
| All-date Pearson r | −0.0411117644 | 0.4877953852 |

Baoshan II's actual HH all-date Spearman was −0.4 (n=21), independently illustrating why its HV candidate must never be labelled as an HH result. All-date figures include calibration data and are not independent validation.

The R-01 experiment explicitly departed from D-04 / the original all-HH design: Baoshan II used measured HV for classification and a smaller mask. Shimen and Feitsui did not receive validated numerical results. The final release remains level-2 browse for all four reservoirs; no candidate area, sensitivity interval, correlation readout or numeric raster is released in the product UI. Safe machine-readable evidence is retained in [numeric-calibration.json](../pipeline/assets/numeric-calibration.json) and [numeric-validation.json](../pipeline/assets/numeric-validation.json), including source granules and date partitions. These are failed-method diagnostic records, not validated water measurements.

## Public-source measurements

Evidence is retained in `pipeline/assets/source-checks.json`, retrieved at `2026-11-14T02:56:55.379256+00:00` (10:56 Taiwan time). Requests were anonymous.

- CMR returned HTTP 200, 1,057,714 bytes in 1.298 s. Its 42 returned records filter to 21 selected granules with an exact match to the supplied manifest.
- All 42 browse images (21 dates × HH/HV) returned HTTP 200. The total was 52,259,971 bytes; each PNG is 2016 × 1982 pixels. SHA-256 hashes and individual request durations are recorded per image.
- WRA probe dates were 18 March and 16 July 2026. Decimal `ROUND_HALF_UP` is used only for comparison against the rounded seed; the probe's raw values are preserved.
- Polygon areas were computed by a spherical polygon integral using authalic radius 6,371,007.1809 m, exteriors minus holes. These checks assess consistency with the brief, not official full-storage area accuracy.

| Reservoir | Measured OSM area (km²) | Brief reference (km²) |
| --- | ---: | ---: |
| Baoshan II | 1.4038057694 | 1.404 |
| Liyutan | 4.1212594979 | 4.121 |
| Shimen | 5.8830687187 | 5.883 |
| Feitsui | 9.7224204249 | 9.722 |

## Dense official refresh

`pipeline/assets/wra_cache.json` completed at `2026-11-14T03:02:42.315314Z`. The dense refresh used 45 requests with at least 1.05 s spacing, plus the earlier independent probe (46 total, under the brief's 60-request budget). Every exported station has 88 date records. Main-series missing observations remain null: Baoshan II 1, Liyutan 1, Shimen 0, Feitsui 1.

All 25 seed dates were cross-checked for eight stations. Storage percentages agree at 0.1% precision. Baoshan II's 8 October 2026 level differs by 0.01 m at the seed's display precision: seed 151.13 m; actual fresh response rounds to 151.14 m. Export uses the fresh response. This is a documented source-rounding discrepancy, not a numerical radar validation result.

## Reproducible checks

Run from the repository root:

```bash
uv run --project pipeline water-pulse all --dry-run
uv run --project pipeline water-pulse all --offline
uv run --project pipeline pytest pipeline/tests
uv run --project pipeline ruff check pipeline
npm --prefix web test
npm --prefix web run format:check
VITE_BASE_PATH=/taiwan-water-pulse/ npm --prefix web run build
```

Verified pipeline results:

```text
uv run --project pipeline pytest pipeline/tests
22 passed
uv run --project pipeline ruff check pipeline
All checks passed!
uv run --project pipeline water-pulse all --offline
Exported level-2 browse edition: 21 observations, 4 reservoirs; numerical measurements unavailable.
```

The seed parser tests cover all eight station column sums and six missing station-days. Other tests cover power/dB conversion, quantization error and invalid values, masked pixel area with latitude correction, synthetic Otsu separation, date rollover and offline export integrity, and OSM area/frame consistency. The expanded tests also cover processing orientation/invalid-aware filtering and publication guards. Their success does not turn the failed real-image classifier validation into a pass.

Frontend verification reported during integration:

```text
npm --prefix web test
14 tests passed
npm --prefix web run build
TypeScript check and GitHub Pages-base production build passed
npm --prefix web run format:check
All matched files use Prettier code style!
```

The production preview at `http://127.0.0.1:4173/taiwan-water-pulse/` was checked at 1280 px width, with no new console errors during the checked flow. HH/HV selection, chart-point selection, reservoir map/gauge synchronization, right-arrow stepping across the March–June radar gap, playback advancement/pause, synchronized tour entry and chapter-four selection were observed. Manual reservoir selection exited the tour; the final Feitsui gauge remained missing. UTC-product gap shading is shifted one day on the Taiwan gauge axis. Three representative screenshots are retained; see [validation](validation.md). This is local verification, not proof of an anonymous public deployment.

The repository CI workflow runs on pushes to `main` and pull requests. The Pages workflow was removed for the Vercel-only deployment. Git-trigger verification remains pending until Vercel has access to the private repository and an owner push is explicitly authorized.

## Acceptance boundary

FR-04 (threshold processing) and the radar area, sensitivity interval and correlation portions of FR-05 are intentionally unavailable. FR-03 uses browse imagery without a calibrated dB legend. Browse images are not overlaid as geographic rasters. The fallback meets a reduced, explicit product scope and must not be reported as full M2 or full Must-feature completion.

Before a numerical release, G-A through G-D must pass with real arrays, actual projection/mask metadata, reproducible parameters and measured timing. Before claiming a public deployment, open the production Vercel domain anonymously and verify the page and assets.

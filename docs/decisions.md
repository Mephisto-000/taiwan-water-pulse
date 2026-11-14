# Implementation decisions

Recorded 2026-11-14 (Asia/Taipei).

| ID | Decision | Reason and consequence |
| --- | --- | --- |
| D-01 | Static assets and a static frontend; no runtime data backend. | The demonstration can serve cached data without exposing credentials or depending on live science services. |
| D-02 | Retain the supplied 21-granule catalog for Track 111 ascending, Frame 014, mode 4005, DHDH, P05023. | Avoid mixing acquisition geometry, processing release or the duplicate mixed-mode product. Catalog verification is recorded separately. |
| D-03 | Activate the brief's fallback level 2. | Access/structure gates G-A and G-B passed; default HH direction and both R-01 held-out tests failed. Only real browse imagery and labelled official data are published. No simulated rasters, areas or correlations fill the numerical gap. |
| D-04 | Defer threshold-based measurement, sensitivity intervals and numerical correlation. | Browse PNG values are display values, not calibrated power. Source access passed but scientific validation failed; those capabilities remain unreleased. |
| D-05 | Use Vite, React, strict TypeScript, MapLibre and an SVG chart; npm for the frontend, Python/uv for the pipeline. | Keep the requested stack, using native SVG for the small chart instead of a separate chart dependency. NumPy supports tested pure numerical primitives; Earthdata/HDF5/geospatial dependencies were subsequently added to investigate numerical access and processing. Their installation does not imply validated radar output. |
| D-06 | Prepare manual GitHub Pages publication; enable it through repository settings. | The explicit user request authorizes implementing and pushing the initial repository. The attachment is a product brief and does not by itself authorize unrelated account changes. Pages runs only on manual workflow dispatch; CI runs on main pushes and pull requests. A prepared workflow is distinct from a verified public deployment. |
| D-07 | MIT for project code. | Adopt the brief's default. Third-party data and package licenses remain separate. |
| D-08 | Publish the fresh cached WRA series; preserve and label the supplied seed separately. | A bounded 45-request refresh produced 88 sampled dates per station. One 0.01 m seed/live level discrepancy is documented and the actual response takes precedence. The seed remains a reproducible fallback. |
| D-09 | Display full-frame browse imagery separately from the geographic locator. | Browse images are not treated as georeferenced analysis layers. Selecting a reservoir changes the context and gauge data without asserting a validated per-reservoir radar measurement. |
| D-10 | Keep missing observations explicit. | No radar observation is fabricated during 2026-03-18 through 2026-06-20; null official values remain null. |
| D-11 | Use Node.js 24 LTS and Python 3.14. | Both were available locally and supported at implementation time. Pin the selected runtime families and commit lock files; exact observed versions are recorded in dependency management. |
| D-13 | Gate numerical UI behind validated exported metadata. | Numerical controls are prepared, but the released manifest stays in browse mode after both held-out classifiers failed. There is no client-side switch that substitutes browse pixels for calibrated values. |
| D-14 | Freeze the R-01 candidate before held-out validation. | Calibrate on four fixed dates, then evaluate the other 17. Proposed Baoshan II classification is HV with the unbuffered OSM polygon; Liyutan retains HH with 150 m buffer. These depart from the original all-HH rule. Require held-out area-versus-level Spearman ≥0.8 for both with sample counts before enabling a partial numerical release. Actual results were 0.421569 and 0.436810 (n=17 each): both failed, so the partial numerical release was rejected. |
| D-12 | Traditional Chinese Conventional Commit message. | The user explicitly selected this language for the initial commit. No AI signature trailer is added; assistance is recorded in ai-usage.md. |

The fallback is a scoped initial release, not completion of the original numerical acceptance criteria. Authenticated access and actual HDF5 inspection have passed. The completed held-out investigation rejected quantitative publication. A later method needs new independent validation before revisiting D-03 and D-04; the already-inspected 17 dates cannot be reused as an untouched test set.

## Language update

The user requested Traditional Chinese and English README versions and a Traditional Chinese main interface. `README.md` is the Taiwan Traditional Chinese entry point; `README.en.md` retains the English version, with reciprocal links. UI copy, dates, accessible labels and error messages use Taiwan terminology, with English technical terms where useful. This supersedes the original brief's English UI/README assumption. Scientific results and publication gates are unchanged.

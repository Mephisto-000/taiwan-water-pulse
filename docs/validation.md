# Initial-release validation

This record separates the released browse experience from the numerical methods that failed validation. See [gates](gates.md) for source measurements and scientific validation.

## Established automated evidence

- Python pipeline: 22 tests passed; Ruff clean. Seed checksums, missingness, dates, quantization, synthetic area/Otsu behavior, exported assets and OSM area/frame consistency are covered.
- Frontend: 15 Vitest tests passed. These cover the tested pure functions and data parsing; they are not a full browser automation suite.
- Frontend production build: TypeScript check and Vite build with GitHub Pages base path passed; Prettier format check passed.
- Public assets: all 42 HH/HV browse PNGs were downloaded anonymously and checksummed.
- Official data: 88 sampled dates per station; the original 25-date seed remains separately available.

## Browser verification

The production preview at `http://127.0.0.1:4173/taiwan-water-pulse/` was checked at 1280 px width. Observed interactions: HH/HV switching; chart-point selection; right-arrow stepping across the radar gap; playback advancement and pause; reservoir map/gauge synchronization; tour entry synchronizing to 18 March after a 10 February selection; chapter four selecting 22 June at 100.0%; manual Feitsui selection leaving the tour; and the final 20 October Feitsui gauge remaining missing (—). The methods panel showed UTC/Taiwan times, absence of a valid gauge reading, and the failed-validation report link. No new console errors appeared during this checked flow. Three screenshots were replaced with genuine captures of this final production-preview state; see [submission screenshots](submission/screenshots.md). Cross-browser checks, three-second first-load performance and WCAG conformance have not been measured as formal acceptance results.

| Requirement | Current scope / evidence |
| --- | --- |
| FR-01 Reservoir selection | Four reservoirs implemented; map/gauge synchronization observed, including Baoshan II and Feitsui. |
| FR-02 Timeline and playback | Observed real-date controls, playback and pause; right-arrow skips from March to June across the marked UTC-product gap. Chart shading is shifted one day to match Taiwan gauge dates. |
| FR-03 HH/HV | Implemented authentic browse-channel selection; calibrated dB visualization is deferred. |
| FR-04 Water threshold | Disabled and explicitly unavailable in the browse edition. |
| FR-05 Validation chart | Official gauge curve and missing values implemented; radar area, sensitivity intervals and correlation are unavailable. |
| FR-06 Sources and limits | Expanded source/limitations panel is captured with the granule, UTC/Taiwan times and missing-gauge handling. |
| FR-07 Radar explanation | Explanation and a simple code-drawn schematic are included. |
| FR-08 Five-chapter tour | Observed synchronized tour entry, chapter four → 22 June / 100.0%, and manual Feitsui selection leaving the tour. |
| FR-09 Two-date swipe | Deferred. |
| FR-10 Pixel inspection | Deferred; browse display values cannot supply calibrated pixel readings. |

## Scientific guardrails

The interface identifies the common track/frame/mode/channels and Provisional maturity, distinguishes area from volume, identifies the radar gap, shows UTC and Taiwan times, and explains measured HH/HV selection. Browse brightness is not labelled as calibrated dB and is not used for area calculation. The explanation covers wind, rain, floating debris, layover, shadow, speckle, orbit precision, reprocessing and the distinction between spacing and resolution. No unsupported causal explanation or real-time monitoring claim is made.

Threshold sensitivity and area-versus-level statistics are withheld because the real held-out tests failed. Their absence is explicit. Passing synthetic unit tests or authenticated file access does not close the scientific validation gates.

## Reproducing the checked production preview

```bash
VITE_BASE_PATH=/taiwan-water-pulse/ npm --prefix web run build
VITE_BASE_PATH=/taiwan-water-pulse/ npm --prefix web run preview
```

Use the same base variable for both commands, then open the printed URL with `/taiwan-water-pulse/`. A default root-path build pairs with a default preview without the variable.

## Publication and review still required

- Pages must be enabled and its manually dispatched deployment must succeed before a public URL is claimed.
- The deployed page and assets must be opened anonymously; a local build or GitHub push is insufficient.
- Review screenshot captions and the final competition requirements before submission.
- Review the final tracked diff and generated output for secrets; local credentials and cache files stay ignored.

The initial release must not be reported as completing every Must feature in the original numerical specification. Authenticated access and HDF5 inspection passed, but the original HH direction gate failed and both R-01 classifiers failed the 17-date held-out Spearman target. Safe failed-method reports remain in the repository; no numerical results are enabled in the public UI.

## Taiwan Traditional Chinese update

The main UI uses `zh-Hant`, Taiwan Traditional Chinese terminology and `zh-TW` dates. The README is available in Traditional Chinese and English. Browser checks confirmed channel selection, chapter navigation, date synchronization and the sources panel with no console errors. At a 1280 px viewport, document width was 1265 px (no horizontal overflow). The current interface is captured in `submission/04-traditional-chinese.jpg`. The frontend suite now has 15 passing tests, including Chinese date formatting; the production build also passed.

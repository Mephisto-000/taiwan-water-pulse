# Validation record

## Reviewed calibrated release — relative-power v3

The reviewed release now has four fixed north-up HH/HV reservoir grids for all 21 acquisitions. Baoshan II/Liyutan/Shimen use 10 m ground spacing and Feitsui 20 m. Current method and per-reservoir A/B/C statistics are in [gates](gates.md) and [methods](methods.md). Python reports 34 passing tests with Ruff clean. Tests verify output/source integrity, fixed HH/relative-power threshold behavior, seeded correlation intervals, physical publication guards and credential separation between NASA and its download CDN. Historical failed experiments are preserved and do not become passed held-out tests.

Frontend archive integration parses all four real display archives (168 HH/HV frames), plus the separate 30 m native analysis grids, masks and 84 HH frames. Every ratio-0.6 area and ratio-0.5/0.7 sensitivity value matches Python to nine decimal places. Display and analysis resolution are explicitly distinguished. Final grades are A/A/B/A; Shimen B carries LOW_CONFIDENCE because its interval crosses zero. Scale exploration is descriptive, not new held-out validation. Final browser and Vercel delivery checks are recorded by the release verification workflow.

## Historical initial-release validation

Everything below this heading records the earlier Browse releases, their tests and their publication decisions. These historical limitations do **not** describe the current relative-power v3 UI above, which publishes experimental area and sensitivity for all four reservoirs with grades A/A/B/A. The original held-out failures remain failures; the new exploratory method does not replace that evidence. See [gates](gates.md) for the separate current and historical records.

### Initial-release automated evidence

- Python pipeline: 22 tests passed; Ruff clean. Seed checksums, missingness, dates, quantization, synthetic area/Otsu behavior, exported assets and OSM area/frame consistency are covered.
- Frontend: 15 Vitest tests passed. These cover the tested pure functions and data parsing; they are not a full browser automation suite.
- Frontend production build: TypeScript check and Vite build with GitHub Pages base path passed; Prettier format check passed.
- Public assets: all 42 HH/HV browse PNGs were downloaded anonymously and checksummed.
- Official data: 88 sampled dates per station; the original 25-date seed remains separately available.

### Initial-release browser verification

The production preview at `http://127.0.0.1:4173/taiwan-water-pulse/` was checked at 1280 px width. Observed interactions: HH/HV switching; chart-point selection; right-arrow stepping across the radar gap; playback advancement and pause; reservoir map/gauge synchronization; tour entry synchronizing to 18 March after a 10 February selection; chapter four selecting 22 June at 100.0%; manual Feitsui selection leaving the tour; and the final 20 October Feitsui gauge remaining missing (—). The methods panel showed UTC/Taiwan times, absence of a valid gauge reading, and the failed-validation report link. No new console errors appeared during this checked flow. Three screenshots were replaced with genuine captures of this final production-preview state; see [submission screenshots](submission/screenshots.md). Cross-browser checks, three-second first-load performance and WCAG conformance have not been measured as formal acceptance results.

| Requirement | Historical Browse scope / evidence |
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

### Initial-release scientific guardrails

The interface identifies the common track/frame/mode/channels and Provisional maturity, distinguishes area from volume, identifies the radar gap, shows UTC and Taiwan times, and explains measured HH/HV selection. Browse brightness is not labelled as calibrated dB and is not used for area calculation. The explanation covers wind, rain, floating debris, layover, shadow, speckle, orbit precision, reprocessing and the distinction between spacing and resolution. No unsupported causal explanation or real-time monitoring claim is made.

In that Browse release, threshold sensitivity and area-versus-level statistics were withheld because the real held-out tests failed. Their absence was explicit. Passing synthetic unit tests or authenticated file access did not close those scientific validation gates.

### Historical preview build configuration

These commands describe the earlier repository-subpath preview configuration. They build whichever assets are present in the checkout; running them now does not restore the historical Browse data. The current archive is reproduced with `water-pulse release --offline` as documented in the README.

```bash
VITE_BASE_PATH=/taiwan-water-pulse/ npm --prefix web run build
VITE_BASE_PATH=/taiwan-water-pulse/ npm --prefix web run preview
```

Use the same base variable for both commands, then open the printed URL with `/taiwan-water-pulse/`. A default root-path build pairs with a default preview without the variable.

### Publication checks recorded for the initial release

- Current Vercel deployment verification is recorded in [deployment.md](deployment.md); historical Pages-base tests below are local evidence only.
- The deployed page and assets must be opened anonymously; a local build or GitHub push is insufficient.
- Review screenshot captions and the final competition requirements before submission.
- Review the final tracked diff and generated output for secrets; local credentials and cache files stay ignored.

The initial release did not complete every Must feature in the original numerical specification. Authenticated access and HDF5 inspection passed, but the original HH direction gate failed and both R-01 classifiers failed the 17-date held-out Spearman target. Safe failed-method reports remain in the repository. Numerical results were disabled in **that historical Browse UI**; current v3 publication follows the separate method and grades at the top of this record.

### Historical Taiwan Traditional Chinese Browse update

That Browse UI used `zh-Hant`, Taiwan Traditional Chinese terminology and `zh-TW` dates. The README was available in Traditional Chinese and English. Browser checks confirmed channel selection, chapter navigation, date synchronization and the sources panel with no console errors. At a 1280 px viewport, document width was 1265 px (no horizontal overflow). The historical interface is captured in `submission/04-traditional-chinese.jpg`. At that stage the frontend suite had 15 passing tests, including Chinese date formatting, and the production build passed. The current UI instead supports explicit language switching and an English five-chapter demo.

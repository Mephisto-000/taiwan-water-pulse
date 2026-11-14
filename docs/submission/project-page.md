# Project-page draft

Status: initial browse-image release. Review the current competition rules and replace any pending hosting references before submission.

## Summary

Taiwan's Water Pulse explores the changing rhythm of four Taiwanese reservoirs through NISAR's first year. Visitors move through 21 radar acquisition dates, switch the HH and HV channels actually measured by the satellite, and compare the imagery with official reservoir records. The application makes an observation gap visible and explains what the available data can and cannot support.

## Project description

Reservoirs can change while optical views are obscured by clouds. L-band radar provides another way to inspect the landscape. Calm water often appears dark because it reflects radar energy away from the satellite, while land and vegetation return more of that energy.

Our historical explorer pairs NISAR browse imagery with Taiwan's Water Resources Agency records for Baoshan II, Liyutan, Shimen and Feitsui. Baoshan II's sampled official storage record moves from 100.0% on 6 November 2025 to 28.2% on 18 March 2026, returning to 100.0% on 22 June. Feitsui follows a different official pattern, inviting further investigation without claiming a cause.

A long gap in the listed radar products is displayed explicitly. Official observations during that period remain distinct from radar observations. HH/HV selection changes the displayed measured channel rather than creating an observation.

This initial release uses browse images for visual inspection. It does not measure radar water area, estimate volume, calculate validation correlations or present display PNG values as calibrated backscatter. Authenticated numerical reads succeeded, but two frozen threshold classifiers failed the held-out validation target. We keep the failed-method evidence and withhold quantitative product results rather than suggest validation succeeded. Cached, traceable assets support a stable demonstration without live data-service calls.

## NASA data

NISAR mission (NASA/JPL and ISRO), ASF DAAC distribution, collection `NISAR_L2_GCOV_PROVISIONAL_V1`. Selected products share Track 111 ascending, Frame 014, mode 4005, HH/HV and CRID P05023. The explorer uses catalog metadata and browse PNGs. Authenticated GCOV windows were additionally used for an offline numerical investigation whose held-out validation failed; candidate counts are retained as diagnostics, not displayed as measured areas. Products are Provisional and use near-real-time orbit precision. Full granule names and exact source links are available in the application provenance.

## Space Agency Partner and other data

- ISRO co-develops the NISAR mission.
- 經濟部水利署 防災資訊服務網 supplies official storage percentages and water levels; the published cache contains 88 sampled dates per station and was retrieved on 14 November 2026. The separate 25-date seed is retained as a fallback.
- © OpenStreetMap contributors provide map context under ODbL. Mapped water boundaries are not validation ground truth.

## Use of AI

Codex assisted with application code, pipeline utilities, tests, documentation and this draft. No AI-generated observation imagery or fabricated measurements are included. Automated checks do not replace independent scientific review. Details are in `docs/ai-usage.md`.

## Links and publication checklist

- Source: https://github.com/Mephisto-000/taiwan-water-pulse
- Project: confirm the actual successful GitHub Pages URL after deployment.
- Demo: capture the sequence in `demo-script.md`, then add a public video or slide link.
- Screenshots: three genuine local captures are linked and captioned in `screenshots.md`; review them against the final deployed version before submission.

Confirm the 2026 submission requirements and local-event deadline directly; the supplied brief's submission format and deadline were assumptions based on prior guidance.

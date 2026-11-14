# Project-page draft

Status: draft for the reviewed calibrated release (`relative_power_v3`). Confirm the final deployment, current competition rules and any required recording before submission.

## Summary

Taiwan's Water Pulse explores the changing rhythm of four Taiwanese reservoirs through NISAR's first year. Visitors move through 21 radar acquisition dates, switch the HH and HV channels actually measured by the satellite, and compare the imagery with official reservoir records. The application makes an observation gap visible and explains what the available data can and cannot support.

## Project description

Reservoirs can change while optical views are obscured by clouds. L-band radar provides another way to inspect the landscape. Calm water often appears dark because it reflects radar energy away from the satellite, while land and vegetation return more of that energy.

Our historical explorer pairs calibrated NISAR GCOV reservoir imagery with Taiwan's Water Resources Agency records for Baoshan II, Liyutan, Shimen and Feitsui. Baoshan II's sampled official storage record moves from 100.0% on 6 November 2025 to 28.2% on 18 March 2026, returning to 100.0% on 22 June. Feitsui follows a different official pattern, inviting further investigation without claiming a cause.

A long gap in the listed radar products is displayed explicitly. Official observations during that period remain distinct from radar observations. HH/HV selection changes the displayed measured channel rather than creating an observation.

The reviewed release covers all 84 reservoir/date AOIs: 168 calibrated HH/HV display frames and 84 separate HH analysis frames. Display grids use 10 m spacing, or 20 m for Feitsui; a common 30 m native UTM grid is used for quantitative analysis. Linear power is averaged before conversion to dB. The fixed classifier uses HH power below 60% of the same-date surrounding-land median inside the exact OSM polygon, with a 0 m buffer. The 50%–70% range describes threshold sensitivity, not a confidence interval.

Candidate-water area and official storage appear in separate charts sharing a time axis. Per-reservoir grades use Pearson correlation with official water level, bootstrap intervals and physical checks: Baoshan II A (r=0.936, n=21), Liyutan A (r=0.915, n=21), Shimen B (r=0.505, n=21), and Feitsui A (r=0.821, n=20). Shimen is explicitly LOW_CONFIDENCE: its 95% Pearson interval crosses zero (−0.357 to 0.828), so this result does not establish reliable tracking there. Methods, complete intervals, lower-storage subsets, sensitivity and QA are publicly inspectable.

The analysis scale was selected after examining declared alternatives, so these are exploratory results, not fresh held-out validation or segmentation-accuracy measurements. The earlier two failed held-out classifiers remain in the historical report. Surface area is not storage volume; OSM geometry is a reference boundary rather than surveyed ground truth. Cached, traceable assets support the demonstration without live data-service calls.

## NASA data

NISAR mission (NASA/JPL and ISRO), ASF DAAC distribution, collection `NISAR_L2_GCOV_PROVISIONAL_V1`. Selected products share Track 111 ascending, Frame 014, mode 4005, HH/HV and CRID P05023. The explorer uses catalog metadata and authenticated GCOV AOI windows; small browse overviews supply full-scene location context only. Calibrated source arrays, not display PNG brightness, supply the experimental analysis. Products are Provisional and use near-real-time orbit precision. Full granule names and exact source links are available in the application provenance.

## Space Agency Partner and other data

- ISRO co-develops the NISAR mission.
- 經濟部水利署 防災資訊服務網 supplies official storage percentages and water levels; the published cache contains 88 sampled dates per station and was retrieved on 14 November 2026. The separate 25-date seed is retained as a fallback.
- © OpenStreetMap contributors provide reference reservoir polygons under ODbL. Mapped water boundaries are not validation ground truth.

## Use of Super Intelligence (SI)

**SI-generated / SI-assisted:** OpenAI Codex assisted with application code, pipeline utilities, tests, UI text, documentation, translations and this draft. Data preparation and visualization run through SI-assisted code; NASA/ASF radar and WRA observations remain source records, not SI-generated measurements. The app displays an SI disclosure; HTML and exported JSON provide SI metadata, with a machine-readable declaration in `si-usage.json`. Custom SVG icons and the coordinate locator are visibly identified as SI-generated. There is no generative radar imagery, audio or video in the current repository. Automated checks do not replace independent scientific review. Details: [SI usage](../ai-usage.md).

## Links and publication checklist

- Project: [English explorer](https://taiwan-water-pulse.vercel.app/?lang=en) and [Traditional Chinese explorer](https://taiwan-water-pulse.vercel.app/?lang=zh-TW). Verify the final deployed release before submitting.
- Public evidence: [methods](https://taiwan-water-pulse.vercel.app/data/methods.md), [current validation](https://taiwan-water-pulse.vercel.app/data/validation.json), [historical held-out results](https://taiwan-water-pulse.vercel.app/data/historical-validation.json), and [provenance](https://taiwan-water-pulse.vercel.app/data/provenance.json).
- Source repository: [GitHub](https://github.com/Mephisto-000/taiwan-water-pulse) remains **private** and is not an anonymously accessible submission artifact. Public evidence above requires no repository access.
- Demo: [English 30-second tour](https://taiwan-water-pulse.vercel.app/?demo=1) preloads the required data before starting. Follow [the storyboard](demo-script.md) for a recording, then add a public video or slide link if required.
- Screenshots: four genuine captures remain as historical Browse-edition evidence in [screenshots.md](screenshots.md). They do not verify the reviewed calibrated release; capture updated screenshots before using them as current submission evidence.

Confirm the 2026 submission requirements and local-event deadline directly; the supplied brief's submission format and deadline were assumptions based on prior guidance.

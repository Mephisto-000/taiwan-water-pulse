# Methods and limitations

## Current release: separate display and analysis grids

The current method is `relative_power_v3`. Four reservoirs each have 21 real NISAR GCOV HH/HV observations. The image viewer uses a fixed, north-up 10 m display grid for Baoshan II, Liyutan and Shimen, and 20 m for Feitsui to respect the per-channel data budget. Classification uses a separate **30 m native UTM grid for all four reservoirs**. Drawing this mask over the finer image does not create a 10 m classification. Grid spacing is not effective spatial resolution.

Products are restricted to `NISAR_L2_GCOV_PROVISIONAL_V1`, ascending Track 111, Frame 014, mode 4005 and CRID P05023. Frequency-A `HHHH`/`HVHV` are calibrated gamma-0 linear power. Actual source coordinates are EPSG:32651, 10 m centre spacing and descending y. Mask codes 0 and 255, nonpositive power and nonfinite values are invalid. Source granules, cache hashes and source URLs are retained. Four early caches identify their granule through the UTC filename and original manifest rather than an embedded identity field; provenance explicitly labels that legacy basis.

The display pipeline averages valid source power in 3×3 windows, bilinearly reprojects to EPSG:3857, converts with `10 log10(power)`, and quantizes −35 through +5 dB to Uint8 1–255; 0 means no data. This is the archive encoding, not the viewer contrast. The viewer uses fixed HH −18 to −2 dB and HV −21 to −6 dB for every date and both comparison panels. No stored pixel or classification changes when the display contrast changes. HV was checked against the pooled valid display-pixel histogram for all four reservoirs and 21 dates: the 2nd/98th percentiles are −20.3543/−6.8110 dB (19,936,055 pixels); outward integer rounding gives −21/−6 dB. The release report recomputes and records that histogram check. OSM outlines are geographic references, not surveyed full-storage shorelines. Full-frame browse images are reduced to 384-pixel context overviews; they never enter quantitative processing. Original source PNGs remain outside deployed output with their original checksums.

## Fixed relative-power classification

The analysis pipeline starts separately from the original GCOV linear power. It performs area-weighted averaging onto complete 30 m cells aligned to the actual full-product UTM origin. It does **not** average dB, does not reuse the display pipeline's 3×3-filtered values, and does not apply a second smoothing/reprojection step. Invalid source pixels are excluded from averaging. Every date uses the same analysis grid and exact rasterized OSM polygon with **0 m buffer**.

The predeclared primary channel is HH for every reservoir. For each date, the reference is the median linear HH power of valid complete coarse cells outside the projected geographic reservoir bbox but within the actual cached AOI. The cache extends approximately 600 m around the bbox. This local reference differs from the review screenshot's approximately 5.1 km reference window. It is not verified ground-truth land; another waterbody, urban structure or topography can contaminate it.

A candidate water pixel must be inside the OSM polygon and have power below **0.6 × the same-date reference median power**. The relative ratio is fixed; the corresponding dB cutoff changes with that date's reference. The 0.6 ratio originated in an exploratory check of uncalibrated browse display values, not calibrated power. Applying it to linear GCOV power is a selected operational definition, equivalent to 2.2185 dB below the reference median; it is not a physically measured land/water boundary. Neither official records nor correlations select the channel, ratio or mask buffer. Analysis power is converted to the same Uint8 dB encoding as the display archive, and classification uses those exported bytes so the frontend and Python results reproduce exactly.

Area is the classified count times the UTM pixel-square area, 900 m². This is projected-grid area rather than surveyed ground truth. Sensitivity repeats classification at relative ratios **0.5 and 0.7**; a user-adjusted ratio uses ±0.1. This replaces the intermediate Otsu experiment's ±1.5 dB sensitivity. The range is parameter sensitivity, not a statistical confidence interval or a complete error budget. The unbuffered polygon constrains maximum area and can omit inundation beyond the mapped shoreline.

`meta.analysis` records the grid, reference medians by UTC date, fixed ratio, sensitivity ratios, mask and affine mapping to display pixels. Its fourth-corner projection residual is retained. Each time-series record stores the actual dB cutoff, reference median, ratio, valid fraction and QA flags. Each channel is flagged independently if its valid fraction is below 0.98, its land-reference median differs from that channel/reservoir’s all-date median by more than 2 dB, or a ≥99.5%-storage observation has candidate area below the full-storage median minus three unscaled median absolute deviations. A zero MAD retains the strict “below” comparison. Every date remains published. All-date statistics determine the grade; channel-specific exclusion statistics are sensitivity checks, not replacements. Brightness flags do not identify rain or wind causes.

## Scale audit and descriptive validation

The sequential audit first changed only the historical Baoshan II channel; that did not rescue the old clipped-threshold method. It then reproduced the expected coarse-scale signal from original linear power: 170 m HH bbox dark counts gave r=0.969767 for Baoshan II and r=0.922357 for Liyutan (n=21 each). Only after this passed the predeclared r>0.85 check were the fixed 170, 100, 50, 30 and 10 m HH/HV comparisons examined. All results, including weak/negative ones, remain in the diagnostic report.

With the final exact OSM mask and unchanged HH/0.6/0 m rule, 30 m is the finest listed scale satisfying grade A's r and interval requirements for both core reservoirs. At 10 m, both still have r>0.85, but Baoshan II's interval lower bound is 0.517994, below 0.6. Thus 10 m is not devoid of signal. Scale was selected after exploratory comparison and is **not** an independently held-out result. The 30 m choice also implements a 3×3 native linear multilook while preserving finer display imagery.

The retained `diagnostics.json` scale-exploration report predates the second review's effect-size and positive-interval grade requirements. Its historical grade labels are not the current publication decision; use `validation.json` and each reservoir's `meta.validation` for the updated A/A/C/B grades.

Evaluation reports full-series Pearson r and Spearman rho against official water level, paired n, and 95% percentile intervals from 2,000 paired bootstrap samples with fixed seed 20261114. Null official values are excluded from pairing, never replaced with zero. Degenerate constant resamples are excluded and the valid count is reported. The bootstrap assumes exchangeable dates; temporal dependence can make its intervals optimistic. The below-95% storage subset is reported separately. Leave-one-out correlation ranges describe single-date influence, not forecasts or new independent validation.

- A: r≥0.8, the 95% interval lower bound≥0.6, and the all-date area range at least twice the mean 0.5–0.7 sensitivity width, with physical checks passing.
- B: r≥0.5, the 95% interval lower bound strictly greater than zero, and physical checks passing, but A criteria not met. These values are experimental.
- C: an interval including zero, weaker/undefined association, or a failed physical check; calibrated imagery remains available while quantitative UI and CSV area values are suppressed.

The updated grades are **Baoshan II A, Liyutan A, Shimen C and Feitsui B**. Their area-range/sensitivity-width ratios are 2.7598, 2.3755, 0.7814 and 0.7860. Even A denotes descriptive review criteria, not independently measured segmentation accuracy. Shimen has r=0.504781, interval [−0.357065, 0.828193] and rho=0.083523, so its quantitative UI is suppressed. Feitsui has a positive association, but its small area change does not satisfy the effect-size rule.

Physical checks require lower candidate area at the lowest observed storage date than at the maximum-storage reference and high-storage area≤1.1× supplied OSM area. The polygon itself constrains area, so the latter is a consistency check, not independent water truth. All four pass these checks under the final rule. Pre/post-gap observations within a fixed 0.5 m water-level tolerance have every matched area difference listed; no match is fabricated if none exists.

## Polarization and the exposed-bed hypothesis

The candidate-water frequency map counts below-threshold HH pixels on the **analysis grid**, divided by valid observations at that pixel. It describes the 21 listed acquisitions, not long-term climate frequency. The retained HH/HV spatial-contrast diagnostic separately compares display-grid OSM interiors with a 150–300 m exterior ring: `(median ring dB − median inside dB) / sqrt((variance ring + variance inside) / 2)`. This is spatial brightness contrast, not classification accuracy; neither group is verified water/land truth.

A separate hypothesis check selects pixels classified as HH water in November but not in March, within the final 30 m OSM mask. Baoshan II has 203 such pixels: March medians are HH −5.55 dB and HV −15.79 dB, changes of +6.61 and +2.20 dB from November. Liyutan has 393: March HH −6.65 dB and HV −14.69 dB, changes of +5.83 and +4.25 dB. HV remains darker than the exterior reference in these candidate transition areas. This is consistent with channel-dependent contrast, but **does not establish exposed dry bed or prove HV misclassification**: HH defines the groups (selection bias), and independent land-cover truth is absent. The report also includes stable-HH-water and exterior-reference comparisons.

## Official data, missingness and history

Acquisitions near 21:16 UTC occur near 05:16 Taiwan time the following day. Comparison uses that local date's 07:00 official observation, roughly 1.7 hours later, not a simultaneous measurement. The WRA cache completed at 2026-11-14T03:02:42.315314Z and contains 88 sampled dates per main reservoir, not a complete daily series. The UTC product gap is 2026-03-18 through 2026-06-20; the official local-date gap shading shifts one day. No radar value is interpolated through the gap. Official nulls remain null. Storage percentage is gauge-derived; surface area is not volume. The original historical response also contains `Capacity`, exported as `storage_volume_m3` after multiplying by 10,000. Unit evidence is the official WRA reservoir table’s JavaScript, which labels `Capacity` as effective storage in ten-thousand cubic metres and displays it without a conversion. The newer UI maps its `EffectiveStorage` field to that same display key; historical observations still come from the original `GetComparision` cache. `CAPACITY_E` is null throughout the four-reservoir historical cache, so `effective_capacity_m3` remains null; no capacity is inferred from percentages or news reports. A future nonnull `CAPACITY_E` requires explicit schema verification before publication.

The original four-date calibration / 17-date held-out experiment remains failed. Its validation set was not merely the post-gap full-storage period. The subsequent pooled-Otsu v2 experiment is retained as an **intermediate diagnostic**, not the final method. Neither is rewritten or relabelled a passed independent validation. Original WRA records and source browse bytes remain unchanged; one previously documented 0.01 m seed/live rounding difference follows the fetched response.

## Reproduction and public evidence

With all source AOI caches, run these commands from the repository root:

```bash
uv run --project pipeline python -m water_pulse.diagnostics
uv run --project pipeline water-pulse release --offline
uv run --project pipeline pytest pipeline/tests
uv run --project pipeline ruff check pipeline
```

Export captures the source revision and dirty state before writing generated files. It retains hashes for source caches and published rasters. Raw credentials, temporary signed download locations and local account paths are never exported. The ordinary offline `all` command validates and preserves an existing release rather than reverting it to browse-only output.

[Final validation](https://taiwan-water-pulse.vercel.app/data/validation.json) · [Sequential scale/polarization diagnostics](https://taiwan-water-pulse.vercel.app/data/diagnostics.json) · [Intermediate Otsu diagnostic](https://taiwan-water-pulse.vercel.app/data/otsu-review-validation.json) · [Original failed held-out experiment](https://taiwan-water-pulse.vercel.app/data/historical-validation.json) · [Provenance](https://taiwan-water-pulse.vercel.app/data/provenance.json) · [GCOV documentation](https://nisar-docs.asf.alaska.edu/gcov/)

Calm water can be dark through specular reflection, while shadow and smooth land can also be dark and rough water can brighten. Provisional calibration, orbit uncertainty, speckle, layover, shore mixing, filtering and quantization remain limitations. Rainfall, operations, demand and exposed-bed effects remain hypotheses unless independently supported.


## Updated review diagnostics (2026-11-14)

Full-pool repeatability uses observations with official storage ≥99.5%. We report population standard deviation (`ddof=0`) and range; with fewer than two observations both remain null. It describes variation among observed full-pool scenes, not isolated instrument error. Baoshan II has n=8, SD=0.014957 km² and range=0.0486 km²; Liyutan n=7, SD=0.027717 km² and range=0.0846 km²; Shimen n=7, SD=0.016310 km² and range=0.0531 km². Feitsui has no such observation.

The polarization comparison uses the lowest-storage radar observation and the highest-storage observation on or before that date (ties choose the earliest). Baoshan II, Liyutan and Shimen use 2025-11-05→2026-03-17 UTC; Feitsui uses 2025-12-23→2026-08-20 UTC. HH/HV changes are respectively −11.52%/−2.91%, −7.71%/−2.54%, −0.79%/−0.13%, and −1.39%/−0.57%. Shimen’s numbers remain diagnostic data only, because grade C suppresses quantitative UI.

The full QA rules flag Baoshan II HH on 2025-11-05 and 2026-07-03, HV on 2025-11-17 and 2026-07-03, and Shimen HV on 2025-11-17. Baoshan II HV r is 0.0320 with all 21 pairs and 0.8978 with 19 unflagged pairs. This differs from excluding only 2025-11-17; exclusions are not silently narrowed to a preferred result. Full channel-specific r, rho, n and bootstrap intervals are in each reservoir’s `stats.polarization_comparison`.

### Storage-volume closure

For each reservoir, take the first chronological observation block (end the block at a gap greater than 36 days), then stop at its lowest observed water level. This admits the isolated 24-day missing pass but never interpolates across the 96-day acquisition gap. Compute signed storage loss as `Σ (h_i − h_(i+1)) × (A_i + A_(i+1))/2`; km² × m gives million m³. Do not reorder by water level or remove intermediate rises. Display closure only when this block spans at least 10 m of water level and the effect-size check passes. Missing endpoint storage volumes make closure unavailable, never zero. Closure is descriptive and never changes the grade.

Baoshan II’s first 11 observations yield 25.738531 million m³ (ratio 0.5/0.7: 24.870113–26.351465), compared with the actual official volume decrease of 24.277200 million m³, a ratio of 1.06019. Liyutan yields 76.138740 million m³ (73.821438–77.778472), versus 66.795100 million m³, ratio 1.13989. This uses official water levels, so it is not independent validation. The range depends on the threshold definition, and area is linearly interpolated between adjacent observations.

Official historical data: [WRA GetComparision API](https://fhy.wra.gov.tw/Disaster/api/ReservoirHistoryApi/GetComparision), retrieved 2026-11-14T03:02:42.315314Z. Unit evidence: [official WRA reservoir JavaScript](https://fhy.wra.gov.tw/fhyv2/js/205.29609f4b.js), verified 2026-11-14, SHA256 `84dfb83868757543f2dc42cd379f1adbb40354be200ad07214c2888000a5f928`; [official labeled reservoir table](https://www.wra.gov.tw/ReservoirWarningTable.aspx?n=46046). The historical endpoint’s standalone schema is unavailable; the unit attribution is explicitly the official frontend label, not a fabricated schema citation.

### Wider threshold sensitivity

The table below reports fixed alternate definitions on the same 30 m HH analysis grid and unchanged unbuffered OSM mask. “Land −N dB” means the same-date land-reference median minus N. Otsu is fitted independently to each date’s valid quantized dB histogram inside the OSM polygon; it is a 30 m diagnostic, not the reviewer’s exploratory 10 m threshold. Definitions are not ranked to tune the published 0.6 ratio. Area is a candidate-water definition; absolute area depends on the definition, and cross-date relative changes are better supported than a surveyed shoreline interpretation. These wider differences are not covered by the narrower 0.5–0.7 display band.

<!-- threshold-sensitivity-table:start -->

| Reservoir | Definition | Reference area km² | Low-storage area km² | Pearson r | n |
| --- | --- | ---: | ---: | ---: | ---: |
| baoshan2 | land_minus_2_db | 1.323 | 1.176 | 0.9311 | 21 |
| baoshan2 | land_minus_3_db | 1.280 | 1.110 | 0.9247 | 21 |
| baoshan2 | land_minus_4_db | 1.232 | 1.020 | 0.9155 | 21 |
| baoshan2 | land_minus_5_db | 1.130 | 0.908 | 0.8011 | 21 |
| baoshan2 | land_minus_6_db | 0.939 | 0.717 | 0.5025 | 21 |
| baoshan2 | per_date_polygon_otsu | 1.183 | 1.124 | 0.6600 | 21 |
| liyutan | land_minus_2_db | 3.786 | 3.501 | 0.9192 | 21 |
| liyutan | land_minus_3_db | 3.685 | 3.319 | 0.9373 | 21 |
| liyutan | land_minus_4_db | 3.586 | 3.109 | 0.9432 | 21 |
| liyutan | land_minus_5_db | 3.413 | 2.785 | 0.9406 | 21 |
| liyutan | land_minus_6_db | 3.195 | 2.374 | 0.8637 | 21 |
| liyutan | per_date_polygon_otsu | 3.472 | 3.155 | 0.9405 | 21 |
| shimen | land_minus_2_db | 5.623 | 5.600 | 0.3710 | 21 |
| shimen | land_minus_3_db | 5.527 | 5.479 | 0.3785 | 21 |
| shimen | land_minus_4_db | 5.330 | 5.272 | 0.2891 | 21 |
| shimen | land_minus_5_db | 4.928 | 4.887 | 0.0502 | 21 |
| shimen | land_minus_6_db | 3.966 | 3.950 | -0.0266 | 21 |
| shimen | per_date_polygon_otsu | 5.289 | 4.887 | 0.1820 | 21 |
| feitsui | land_minus_2_db | 9.255 | 9.130 | 0.8605 | 20 |
| feitsui | land_minus_3_db | 9.072 | 8.899 | 0.8415 | 20 |
| feitsui | land_minus_4_db | 8.863 | 8.632 | 0.8847 | 20 |
| feitsui | land_minus_5_db | 8.588 | 8.271 | 0.6751 | 20 |
| feitsui | land_minus_6_db | 8.139 | 7.680 | 0.5315 | 20 |
| feitsui | per_date_polygon_otsu | 8.456 | 8.271 | 0.7584 | 20 |

Comparison dates: baoshan2: 2025-11-05 → 2026-03-17 UTC; liyutan: 2025-11-05 → 2026-03-17 UTC; shimen: 2025-11-05 → 2026-03-17 UTC; feitsui: 2025-12-23 → 2026-08-20 UTC.

<!-- threshold-sensitivity-table:end -->

# Methods and limitations

## Current release: separate display and analysis grids

The current method is `relative_power_v3`. Four reservoirs each have 21 real NISAR GCOV HH/HV observations. The image viewer uses a fixed, north-up 10 m display grid for Baoshan II, Liyutan and Shimen, and 20 m for Feitsui to respect the per-channel data budget. Classification uses a separate **30 m native UTM grid for all four reservoirs**. Drawing this mask over the finer image does not create a 10 m classification. Grid spacing is not effective spatial resolution.

Products are restricted to `NISAR_L2_GCOV_PROVISIONAL_V1`, ascending Track 111, Frame 014, mode 4005 and CRID P05023. Frequency-A `HHHH`/`HVHV` are calibrated gamma-0 linear power. Actual source coordinates are EPSG:32651, 10 m centre spacing and descending y. Mask codes 0 and 255, nonpositive power and nonfinite values are invalid. Source granules, cache hashes and source URLs are retained. Four early caches identify their granule through the UTC filename and original manifest rather than an embedded identity field; provenance explicitly labels that legacy basis.

The display pipeline averages valid source power in 3×3 windows, bilinearly reprojects to EPSG:3857, converts with `10 log10(power)`, and quantizes −35 through +5 dB to Uint8 1–255; 0 means no data. The same scale applies to HH and HV and all dates. OSM outlines are geographic references, not surveyed full-storage shorelines. Full-frame browse images are reduced to 384-pixel context overviews; they never enter quantitative processing. Original source PNGs remain outside deployed output with their original checksums.

## Fixed relative-power classification

The analysis pipeline starts separately from the original GCOV linear power. It performs area-weighted averaging onto complete 30 m cells aligned to the actual full-product UTM origin. It does **not** average dB, does not reuse the display pipeline's 3×3-filtered values, and does not apply a second smoothing/reprojection step. Invalid source pixels are excluded from averaging. Every date uses the same analysis grid and exact rasterized OSM polygon with **0 m buffer**.

The predeclared primary channel is HH for every reservoir. For each date, the reference is the median linear HH power of valid complete coarse cells outside the projected geographic reservoir bbox but within the actual cached AOI. The cache extends approximately 600 m around the bbox. This local reference differs from the review screenshot's approximately 5.1 km reference window. It is not verified ground-truth land; another waterbody, urban structure or topography can contaminate it.

A candidate water pixel must be inside the OSM polygon and have power below **0.6 × the same-date reference median power**. The relative ratio is fixed; the corresponding dB cutoff changes with that date's reference. Neither official records nor correlations select the channel, ratio or mask buffer. Analysis power is converted to the same Uint8 dB encoding as the display archive, and classification uses those exported bytes so the frontend and Python results reproduce exactly.

Area is the classified count times the UTM pixel-square area, 900 m². This is projected-grid area rather than surveyed ground truth. Sensitivity repeats classification at relative ratios **0.5 and 0.7**; a user-adjusted ratio uses ±0.1. This replaces the intermediate Otsu experiment's ±1.5 dB sensitivity. The range is parameter sensitivity, not a statistical confidence interval or a complete error budget. The unbuffered polygon constrains maximum area and can omit inundation beyond the mapped shoreline.

`meta.analysis` records the grid, reference medians by UTC date, fixed ratio, sensitivity ratios, mask and affine mapping to display pixels. Its fourth-corner projection residual is retained. Each time-series record stores the actual dB cutoff, reference median, ratio, valid fraction and QA flags. QA retains low-valid-fraction dates rather than deleting observations; no rain/wind flag is inferred merely from brightness.

## Scale audit and descriptive validation

The sequential audit first changed only the historical Baoshan II channel; that did not rescue the old clipped-threshold method. It then reproduced the expected coarse-scale signal from original linear power: 170 m HH bbox dark counts gave r=0.969767 for Baoshan II and r=0.922357 for Liyutan (n=21 each). Only after this passed the predeclared r>0.85 check were the fixed 170, 100, 50, 30 and 10 m HH/HV comparisons examined. All results, including weak/negative ones, remain in the diagnostic report.

With the final exact OSM mask and unchanged HH/0.6/0 m rule, 30 m is the finest listed scale satisfying grade A's r and interval requirements for both core reservoirs. At 10 m, both still have r>0.85, but Baoshan II's interval lower bound is 0.517994, below 0.6. Thus 10 m is not devoid of signal. Scale was selected after exploratory comparison and is **not** an independently held-out result. The 30 m choice also implements a 3×3 native linear multilook while preserving finer display imagery.

Evaluation reports full-series Pearson r and Spearman rho against official water level, paired n, and 95% percentile intervals from 2,000 paired bootstrap samples with fixed seed 20261114. Null official values are excluded from pairing, never replaced with zero. Degenerate constant resamples are excluded and the valid count is reported. The bootstrap assumes exchangeable dates; temporal dependence can make its intervals optimistic. The below-95% storage subset is reported separately. Leave-one-out correlation ranges describe single-date influence, not forecasts or new independent validation.

- A: r≥0.8 and the 95% interval lower bound≥0.6, with physical checks passing.
- B: r≥0.5 with physical checks passing, but A criteria not met. These values are experimental.
- C: weaker/undefined association or a failed physical check; calibrated imagery remains available while quantitative UI is suppressed.

Current grades are Baoshan II A, Liyutan A, Shimen B and Feitsui A. Even A denotes descriptive review criteria, not independently measured segmentation accuracy. **Shimen is low confidence:** r=0.504781, interval [−0.357065, 0.828193] and rho=0.083523. Its interval crosses zero; it must not be presented as a reliable relationship or effective monitoring result.

Physical checks require lower candidate area at the lowest observed storage date than at the maximum-storage reference and high-storage area≤1.1× supplied OSM area. The polygon itself constrains area, so the latter is a consistency check, not independent water truth. All four pass these checks under the final rule. Pre/post-gap observations within a fixed 0.5 m water-level tolerance have every matched area difference listed; no match is fabricated if none exists.

## Polarization and the exposed-bed hypothesis

The candidate-water frequency map counts below-threshold HH pixels on the **analysis grid**, divided by valid observations at that pixel. It describes the 21 listed acquisitions, not long-term climate frequency. The HH/HV spatial-contrast chart separately compares display-grid OSM interiors with a 150–300 m exterior ring: `(median ring dB − median inside dB) / sqrt((variance ring + variance inside) / 2)`. This is spatial brightness contrast, not classification accuracy; neither group is verified water/land truth.

A separate hypothesis check selects pixels classified as HH water in November but not in March, within the final 30 m OSM mask. Baoshan II has 203 such pixels: March medians are HH −5.55 dB and HV −15.79 dB, changes of +6.61 and +2.20 dB from November. Liyutan has 393: March HH −6.65 dB and HV −14.69 dB, changes of +5.83 and +4.25 dB. HV remains darker than the exterior reference in these candidate transition areas. This is consistent with channel-dependent contrast, but **does not establish exposed dry bed or prove HV misclassification**: HH defines the groups (selection bias), and independent land-cover truth is absent. The report also includes stable-HH-water and exterior-reference comparisons.

## Official data, missingness and history

Acquisitions near 21:16 UTC occur near 05:16 Taiwan time the following day. Comparison uses that local date's 07:00 official observation, roughly 1.7 hours later, not a simultaneous measurement. The WRA cache completed at 2026-11-14T03:02:42.315314Z and contains 88 sampled dates per main reservoir, not a complete daily series. The UTC product gap is 2026-03-18 through 2026-06-20; the official local-date gap shading shifts one day. No radar value is interpolated through the gap. Official nulls remain null. Storage percentage is gauge-derived; surface area is not volume.

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

# Methods and limitations

## Scope of this release

The application is a historical browse-image explorer. It presents the supplied 21 NISAR observation dates alongside official reservoir storage and water-level records for Baoshan II, Liyutan, Shimen and Feitsui. This is fallback level 2 in the brief. Calibrated numerical water mapping was tested, failed the held-out validation requirement, and is not presented as a product result.

## Inputs and alignment

The catalog restricts products to `NISAR_L2_GCOV_PROVISIONAL_V1`, relative Track 111 ascending, Frame 014, mode 4005, source A, full-frame coverage and CRID P05023. The mixed-mode duplicate is excluded. Each record preserves the full granule name, UTC acquisition time, Taiwan acquisition time and upstream URLs.

NISAR observations near 21:16 UTC occur near 05:16 in Taiwan on the following date. The matching WRA gauge record is the local 07:00 observation, about 1.7 hours later. Alignment is by the Taiwan calendar date, including month and year boundaries. It is not a comparison of simultaneous measurements.

Published official curves use a fresh WRA cache completed at `2026-11-14T03:02:42.315314Z` (11:02 Taiwan time). There are 88 sampled dates per station, including acquisition-aligned dates, the supplied supplementary dates and approximately five-day samples. They are not a complete daily series. The refresh used 45 requests; together with the separate two-date probe this is 46 requests, below the 60-request budget. Official seed records from Appendix B remain a 25-date fallback and checksum fixture for all eight stations. Exported `source_kind` distinguishes a fresh source response from seed data. A blank water level paired with a zero capacity rate is missing, not an empty reservoir. The four main exported series preserve one missing observation each for Baoshan II, Liyutan and Feitsui, and none for Shimen. All seed percentages agree with fresh records at the supplied 0.1% precision. One water-level rounding difference occurs for Baoshan II on 8 October 2026: the seed has 151.13 m while the fresh response rounds to 151.14 m. The export follows the actual response rather than silently changing it to match the seed.

## Browse imagery

The offline pipeline copies public ASF browse PNGs and records their availability and provenance. The browser reads the site's own assets. HH and HV refer to channels actually measured on the acquisition; changing the channel selects existing data. The application does not derive VV or VH.

Browse PNGs are display products. Their brightness and display stretch must not be interpreted as calibrated γ⁰ (dB), and their pixel counts must not be converted into water area. Full-frame images are shown separately from the geographic locator. They are not overlaid as a georeferenced numerical raster. Enlargement reveals display pixels, not new spatial detail.

Calm water often looks dark because it reflects the radar pulse away from the satellite. Land and vegetation scatter some energy back. Wind, rain, floating debris and exposed smooth banks can change that contrast. A dark feature alone is insufficient evidence of water.

## Time series and missingness

Date controls use actual acquisitions; the UTC product-date interval from 18 March through 20 June 2026 has no listed product for this frame. The interface labels those UTC dates. On the Taiwan gauge-date axis, the corresponding shaded dates are shifted one day (19 March through 21 June), consistent with the acquisition-to-gauge alignment. It does not interpolate or manufacture radar images. Official observations within the gap remain useful and distinct from radar observations.

Official curves represent sampled gauge records. Connecting available samples guides the eye and does not claim dense daily measurements. A missing official value breaks the curve. Missing values are not replaced by zero or a prior observation.

Surface area and stored volume are different physical quantities. Storage percentage comes from official gauges. The project does not infer storage volume from imagery.

## Calibrated numerical investigation

Authenticated HDF5 window reads and file-structure inspection passed G-A and G-B. Source frequency-A HH/HV arrays were float32 power in EPSG:32651 with 10 m centre spacing and descending y. Dataset attributes identified NaN fill, mask 0 as invalid/partial focus, mask 255 as outside imagery, and positive subswath codes as valid. Actual measured read timing, bytes, source structure and mask attributes are retained in [numeric-gates.json](../pipeline/assets/numeric-gates.json) and [gates](gates.md).

The offline path filters 3×3 windows using invalid-aware arithmetic means in linear power, bilinearly reprojects onto a fixed EPSG:3857 reservoir grid and then converts with `10 log10(power)`. Valid dB values over −35 to +5 map to Uint8 1–255; 0 remains invalid. Ground pixel area is latitude-corrected. A sensitivity interval uses threshold ±1.5 dB; it is not a statistical confidence interval.

The initial fixed HH method failed the prescribed temporal-direction gate for Baoshan II. Independent replay directly on the native UTM grid reproduced the failure without Web Mercator reprojection or quantization. That evidence did not support a coordinate-order or pixel-area implementation bug as the explanation. The observed HH water-polygon median was brighter than the specified −14 dB upper threshold bound, so that rule selected a dark tail rather than most mapped water extent. The investigation did not establish a physical cause for the remaining variation.

Under the brief's R-01 fallback, two candidate rules were frozen using only these four calibration dates: 2025-11-05, 2026-01-16, 2026-03-17 and 2026-06-21. The remaining 17 listed acquisition dates were held out; no threshold or mask fitting used those dates.

| Reservoir | Frozen classification rule | Held-out Spearman ρ | Held-out Pearson r | Paired n |
| --- | --- | ---: | ---: | ---: |
| Baoshan II | HV; 0 m OSM buffer; −15.8587598425 dB | 0.421569 | −0.074494 | 17 |
| Liyutan | HH; 150 m OSM buffer; −14 dB | 0.436810 | 0.387975 | 17 |

The requirement was held-out Spearman **≥0.8 for each reservoir**. Both failed, even though their four calibration dates had the expected direction. Including calibration dates yields Spearman 0.537662 for Baoshan II's HV candidate and 0.482131 for Liyutan's HH candidate (n=21 each); those are descriptive in-sample-inclusive figures, not an independent validation pass. Baoshan II's HH all-date Spearman was −0.4 (n=21).

The safe reports [numeric-calibration.json](../pipeline/assets/numeric-calibration.json) and [numeric-validation.json](../pipeline/assets/numeric-validation.json) preserve the frozen settings, date partitions, candidate counts and statistics. Candidate areas are diagnostic outputs; they are not published as validated water areas. Shimen and Feitsui did not receive a validated numerical product either. The release remains fallback level 2 across all four reservoirs.

The code contains numerical processing and UI capabilities, but the released manifest does not enable them and no numerical raster assets are published. A future method needs new, independent validation; retuning against these 17 already-inspected dates must not be presented as a fresh held-out test. Synthetic unit tests establish software behavior, not real-world water-detection accuracy.

A target 10 m pixel spacing does not imply 10 m effective resolution. Provisional calibration and near-real-time orbit precision may change with reprocessing. Speckle, steep-bank layover, radar shadow, wind, debris, resampling and quantization belong in any eventual uncertainty discussion.

## Interpretation

Differences between Feitsui and western reservoirs are observations in the supplied gauge record. Rainfall patterns, operations and demand may be hypotheses for those differences; they are not established causes in this release. No industry-supply or typhoon attribution is asserted without a supporting source.

See [gate evidence](gates.md), [sources](data-sources.md) and [decisions](decisions.md).

# Data sources and attribution

## NASA and space-agency data

- **Mission:** NASA/JPL and ISRO's NISAR mission.
- **Distributor:** Alaska Satellite Facility Distributed Active Archive Center (ASF DAAC).
- **Collection:** `NISAR_L2_GCOV_PROVISIONAL_V1`; CMR concept ID supplied in the brief: `C2854338529-ASF`.
- **Subset:** Track 111 ascending, Frame 014, mode 4005 (40+5 MHz), DHDH (HH/HV), source A, CRID P05023, full coverage, near-real-time orbit precision.
- **Maturity:** Provisional. Reprocessing may change values.
- **Products used in this release:** Browse PNGs for visual inspection; catalog metadata. Authenticated calibrated HDF5 windows were examined offline to test threshold candidates. Both held-out validation tests failed; no numerical raster assets or measured-area results are exposed in the public explorer. The safe research reports remain in `pipeline/assets/`.

Primary documentation: [GCOV product guide](https://nisar-docs.asf.alaska.edu/gcov/), [Earthaccess guide](https://nisar-docs.asf.alaska.edu/earthaccess/), [product maturity overview](https://nisar-docs.asf.alaska.edu/products-overview/).

[CMR catalog query](https://cmr.earthdata.nasa.gov/search/granules.json?short_name=NISAR_L2_GCOV_PROVISIONAL_V1&bounding_box=121.20,24.75,121.30,24.85&page_size=1000&sort_key=start_date). Exact granule URLs and download status are stored in `web/public/data/provenance.json` and the source catalog. No DOI is invented when one has not been verified.

## Other data

### Official reservoirs

**Attribution:** 經濟部水利署 防災資訊服務網 (Water Resources Agency, Ministry of Economic Affairs, Taiwan).

[Reservoir information page](https://fhy.wra.gov.tw/fhyv2/monitor/reservoir); [government open-data listing and display guidance](https://data.gov.tw/dataset/45501).

The brief's Appendix B contains the fallback seed snapshot, recorded as retrieved on 2026-11-14. Its dates are local 07:00 observations, not NASA UTC dates. Exact acquisition instants of the seed download were not supplied and are not fabricated. The published curves use the fresh cache completed at `2026-11-14T03:02:42.315314Z`, with 88 sampled dates per station. Seed and live response metadata remain distinct; this is a cached historical series, not a live browser service.

The public page uses `POST https://fhy.wra.gov.tw/Disaster/api/ReservoirHistoryApi/GetComparision`. `StartDate` and `EndDate` select two dates, not a continuous interval. This is an undocumented website endpoint and may change. Requests are cached, limited to eight stations, spaced at least one second apart, and bounded by the pipeline. The application does not use protected API-key endpoints.

Storage is shown with numbers and blue tones. Green, yellow, orange and red are not used as storage-status colors, following the provider's guidance.

### Reservoir geometry and map

**Attribution:** © OpenStreetMap contributors. Data is available under the [Open Database License (ODbL)](https://www.openstreetmap.org/copyright).

The intended lookup uses the OSM identifiers recorded per reservoir. A geographic locator or bounding box is context; it is not a validated water mask. OSM water polygons are approximate mapped water extent, not authoritative full-storage areas and not ground truth for radar accuracy. Download and area-check outcomes are recorded in [gates](gates.md).

Basemap tiles, where enabled, display their provider attribution in the map. No institutional logo is used.

## Traceability and licensing

The exported index and provenance distinguish supplied metadata, seed records and freshly fetched responses. Retrieval failures do not authorize substituting synthetic imagery. Missing browse images are marked unavailable. Successful authentication is distinguished from scientific validation: the latter failed, so source access is not presented as proof of classification accuracy. Credentials never belong in provenance.

[MIT](../LICENSE) covers this project's code, not a relicense of third-party datasets. Refer to each provider's terms and credit the sources when reusing the exported assets.

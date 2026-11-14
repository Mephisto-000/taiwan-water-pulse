# Taiwan's Water Pulse

A historical, interactive exploration of Taiwan's reservoirs through NISAR L-band radar and official water gauges.

## Project direction

- Explore four reservoirs: Baoshan II, Liyutan, Shimen and Feitsui.
- Follow 21 NISAR acquisition dates from November 2025 to October 2026.
- Compare measured HH/HV channels and official reservoir storage records.
- Show missing observations, source provenance and scientific limitations explicitly.

Surface area is not storage volume. Browse previews support visual inspection; quantitative area estimates require calibrated GCOV data and validated processing.

## Implementation status

The initial application, reproducible Python pipeline, local data assets, tests and documentation are in development. This first commit introduces the project; the implementation will follow after verification.

Planned stack: Vite, React, TypeScript and MapLibre for the static frontend; Python and uv for the offline pipeline. GitHub Pages is the default publication target.

## Data sources

- [NASA/JPL and ISRO NISAR, distributed by ASF DAAC](https://nisar-docs.asf.alaska.edu/gcov/)
- [Taiwan Water Resources Agency reservoir information](https://fhy.wra.gov.tw/fhyv2/monitor/reservoir)
- [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)

NISAR selection: `NISAR_L2_GCOV_PROVISIONAL_V1`, Track 111 ascending, Frame 014, mode 4005, HH/HV, CRID P05023. Products have Provisional maturity.

No credentials are included in this repository.

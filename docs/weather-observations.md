# Real Weather: historical CWA observations

In Charts, select **Real weather** to show a daily rainfall bar chart on the same date range and horizontal scale as the SAR/official-storage timeline. Icons mark the Taiwan-local acquisition dates. Select a calendar date to inspect values between SAR observations, including the long radar gap. Context events are opt-in through **Between observations**. Station provenance and detailed interpretation remain available in the weather disclosure.

## Sources and coverage

Real observations are downloaded from the Central Weather Administration (CWA) [CODiS StationData service](https://codis.cwa.gov.tw/StationData), using the public station/month request issued by that site (`POST /api/station`, `type=report_month`). The frontend loads the exported JSON, not the upstream service at runtime. No credentials are needed for these public requests. This is a website endpoint, not a promised stable versioned API; failures stop the download rather than generating substitute values.

The initial export covers **2025-11-06 through 2026-10-20**, all 349 Taiwan calendar days in the current acquisition window. Daily totals can include rainfall after the early-morning SAR overpass. They are contextual observations, not prior features fed into the storage model.

| Reservoir | Nearby CWA station | ID | Missing days |
| --- | --- | --- | --- |
| Baoshan II | Baoshan | C0D580 | 0 |
| Liyutan | Xinkai | C1E511 | 0 |
| Shimen | Fuxing | C0C460 | 3 |
| Feitsui | Sishifen | C1A9N0 | 5 |

Stations were selected near the reservoir map centres and checked against the active station metadata for the full interval. Coordinates and distance to each map centre are exported and shown. These are point measurements, **not catchment-average rainfall**; upstream mountain rainfall and interbasin transfers can differ substantially. This release does not establish that these stations represent each full contributing basin.

## Interpretation

- Rain bars use `Precipitation.Accumulation` (mm). Zero is a valid dry measurement, not missing.
- CODiS `-9.8` means trace precipitation. It remains `rainfall_mm: null`, `rainfall_trace: true`, with a separate trace status; it is never converted to zero.
- Other negative values, absent records and null observations remain missing. The public CODiS [special-value formatter](https://codis.cwa.gov.tw/Common/global.js) documents these codes.
- `Accumulationf` quality flags are retained. Nonzero flags appear in tooltips and the selected-date detail. Their presence is not silently treated as a clean observation or used to invent a correction.
- Automatic stations do not supply an official daily narrative such as "sunny" or "overcast" in this response. Icons therefore encode rain observed / no measurable rain / trace / missing. A sun icon is allowed only when positive measured sunshine duration accompanies zero rainfall; it does not claim that the entire day was sunny. The current stations generally do not report sunshine duration. An official daily narrative remains unavailable, rather than being manufactured from zero rain.
- Weather and storage co-occurrence alone does not prove a cause of water-level change.

## Reproduce

From the repository root, with Python 3.10+ (standard library only):

```sh
python3 pipeline/scripts/fetch_weather.py
python3 pipeline/scripts/fetch_weather.py --refresh
python3 pipeline/scripts/fetch_weather.py --start 2025-11-06 --end 2026-10-20
python3 pipeline/scripts/test_fetch_weather.py
```

Without `--refresh`, saved requests are reused. The default period follows the minimum/maximum local dates in `web/public/data/index.json`. Only completed historical days are accepted. Raw responses, retrieval timestamps and hashes stay under ignored `data/cache/weather/`. Each published `web/public/data/weather/*.json` contains normalized daily values, source URLs, month parameters, retrieval timestamps, station metadata and response SHA-256 hashes. The four published files total approximately 419 kB; the raw cache is approximately 4.5 MiB and is not committed. No imagery is added.

After downloading, run the web tests and production build. Changing the acquisition window also requires refreshing weather data. Missing files or invalid payloads produce an explicit retry state; they are never displayed as zero rainfall.

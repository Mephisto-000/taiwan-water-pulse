"""Fetch CWA CODiS daily observations for the app's acquisition date range.

Uses the same public station/month requests as CODiS StationData. No API key.
Raw responses stay in ignored data/cache/weather; published JSON has provenance.
"""
from __future__ import annotations

import argparse
import calendar
import hashlib
import json
import math
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
BASE = "https://codis.cwa.gov.tw/"
STATIONS = {
    "baoshan2": ("C0D580", "auto_C0", "Baoshan"),
    "liyutan": ("C1E511", "auto_C1", "Xinkai"),
    "shimen": ("C0C460", "auto_C0", "Fuxing"),
    "feitsui": ("C1A9N0", "auto_C1", "Sishifen"),
}


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def cached_request(cache, filename, endpoint, params=None, refresh=False):
    path = cache / filename
    if not refresh and path.exists():
        saved = read_json(path)
    else:
        body = urlencode(params).encode() if params else None
        request = Request(BASE + endpoint, data=body, headers={
            "User-Agent": "TaiwanWaterPulse/0.1", "Referer": BASE + "StationData",
        })
        for attempt in range(3):
            try:
                with urlopen(request, timeout=45) as response:
                    raw = response.read()
                payload = json.loads(raw)
                if payload.get("code") != 200 or not isinstance(payload.get("data"), list):
                    raise ValueError("Unexpected CODiS response")
                break
            except (OSError, ValueError):
                if attempt == 2:
                    raise
                time.sleep(attempt + 1)
        saved = {"url": BASE + endpoint, "parameters": params,
                 "retrieved_at": datetime.now(timezone.utc).isoformat(),
                 "sha256": hashlib.sha256(raw).hexdigest(), "payload": payload}
        cache.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(saved, ensure_ascii=False), encoding="utf-8")
        time.sleep(0.2)
    return saved


def nonnegative(value):
    if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0:
        return float(value)
    return None


def normalize(row, local_date):
    precipitation = row.get("Precipitation") or {}
    raw = precipitation.get("Accumulation")
    trace = raw == -9.8
    rain = nonnegative(raw)
    condition = "trace" if trace else "missing" if rain is None else "rain" if rain > 0 else "no_measurable_rain"
    return {"local_date": local_date, "rainfall_mm": rain, "rainfall_trace": trace,
            "condition": condition, "rainfall_source_value": raw,
            "rainfall_quality_flag": precipitation.get("Accumulationf"),
            "sunshine_hours": nonnegative((row.get("SunshineDuration") or {}).get("Total")),
            "official_weather_description": None}


def distance_km(lat1, lon1, lat2, lon2):
    a, b = math.radians(lat1), math.radians(lat2)
    h = math.sin((b-a)/2)**2 + math.cos(a)*math.cos(b)*math.sin(math.radians(lon2-lon1)/2)**2
    return 6371 * 2 * math.asin(min(1, math.sqrt(h)))


def monthly_params(station, kind, day):
    last = calendar.monthrange(day.year, day.month)[1]
    return {"date": day.strftime("%Y-%m"), "type": "report_month", "stn_ID": station,
            "stn_type": kind, "start": day.strftime("%Y-%m-01T00:00:00"),
            "end": day.strftime(f"%Y-%m-{last:02d}T00:00:00")}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--start", type=date.fromisoformat)
    parser.add_argument("--end", type=date.fromisoformat)
    args = parser.parse_args()
    public = ROOT / "web/public/data"
    index = read_json(public / "index.json")
    start = args.start or date.fromisoformat(min(r["local"][:10] for r in index["dates"]))
    end = args.end or date.fromisoformat(max(r["local"][:10] for r in index["dates"]))
    today = datetime.now(timezone(timedelta(hours=8))).date()
    if start > end or end >= today:
        parser.error("Choose an ordered interval ending before today (completed local days only).")
    cache = ROOT / "data/cache/weather"
    station_response = cached_request(cache, "stations.json", "api/station_list", refresh=args.refresh)
    station_list = [s for group in station_response["payload"]["data"] for s in group["item"]]
    output = public / "weather"
    output.mkdir(exist_ok=True)
    for reservoir in index["reservoirs"]:
        key = reservoir["key"]
        if key not in STATIONS:
            continue
        station_id, kind, english_name = STATIONS[key]
        station = next(s for s in station_list if s["stationID"] == station_id and s.get("stationStartDate", "") <= start.isoformat() and (not s.get("stationEndDate") or s["stationEndDate"] >= end.isoformat()))
        rows, sources = {}, []
        month = start.replace(day=1)
        while month <= end:
            params = monthly_params(station_id, kind, month)
            saved = cached_request(cache, f"{station_id}-{month:%Y-%m}.json", "api/station", params, args.refresh)
            payload = saved["payload"]
            if payload.get("metadata", {}).get("timezone") != "+08:00":
                raise ValueError("Unexpected source timezone")
            for series in payload["data"]:
                if series.get("StationID") != station_id:
                    raise ValueError("Response station does not match request")
                for row in series.get("dts", []):
                    day = row["DataDate"][:10]
                    if start.isoformat() <= day <= end.isoformat():
                        if day in rows:
                            raise ValueError("Duplicate daily observation")
                        rows[day] = row
            sources.append({k: saved[k] for k in ("url", "parameters", "retrieved_at", "sha256")})
            month = (month.replace(day=28) + timedelta(days=4)).replace(day=1)
        records = [normalize(rows.get((start + timedelta(days=i)).isoformat(), {}), (start + timedelta(days=i)).isoformat()) for i in range((end-start).days+1)]
        south, north, west, east = reservoir["bbox"]
        data = {
            "schema_version": 1, "reservoir": key, "source": BASE + "StationData",
            "source_provider": "Central Weather Administration (CWA), CODiS",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "timezone": "Asia/Taipei", "period": {"start": start.isoformat(), "end": end.isoformat()},
            "station": {"id": station_id, "name": english_name, "name_zh": station["stationName"],
                        "latitude": station["latitude"], "longitude": station["longitude"],
                        "distance_to_reservoir_center_km": round(distance_km((south+north)/2, (west+east)/2, station["latitude"], station["longitude"]), 2)},
            "interpretation": "Nearby point-station observations, not catchment-average rainfall. Daily precipitation status is derived from observed accumulation, not an official sky-condition summary. Zero rain does not establish sunny weather. Same-date totals include hours after the SAR overpass; do not use them as prior predictors.",
            "special_values": {"-9.8": "Trace precipitation: amount unknown, not zero", "other_negative_or_null": "Unavailable; not zero", "quality_flags": "Original Accumulationf retained; nonzero flags are marked, not reinterpreted or silently excluded."},
            "special_value_reference": BASE + "Common/global.js",
            "station_metadata_provenance": {k: station_response[k] for k in ("url", "retrieved_at", "sha256")},
            "requests": sources, "records": records,
        }
        target = output / f"{key}.json"
        temporary = target.with_suffix(".tmp")
        temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
        temporary.replace(target)
        print(f"{key}: {len(records)} days; {sum(r['condition'] == 'missing' for r in records)} missing; station {station_id}", flush=True)


if __name__ == "__main__":
    main()

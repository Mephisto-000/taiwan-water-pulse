"""Source identities supplied by the project brief; never treated as measured areas."""

from datetime import UTC, datetime, timedelta, timezone
from typing import TypedDict

COLLECTION = "NISAR_L2_GCOV_PROVISIONAL_V1"
WRA_URL = "https://fhy.wra.gov.tw/Disaster/api/ReservoirHistoryApi/GetComparision"
TAIPEI = timezone(timedelta(hours=8))


class Reservoir(TypedDict):
    key: str
    name: str
    name_zh: str
    station: str
    osm: str
    bbox: list[float]
    osm_area_km2: float


RESERVOIRS: list[Reservoir] = [
    {
        "key": "baoshan2",
        "name": "Baoshan II",
        "name_zh": "寶山第二水庫",
        "station": "10405",
        "osm": "relation/4749861",
        "bbox": [24.7170, 24.7390, 121.0425, 121.0686],
        "osm_area_km2": 1.404,
    },
    {
        "key": "liyutan",
        "name": "Liyutan",
        "name_zh": "鯉魚潭水庫",
        "station": "20101",
        "osm": "relation/16850337",
        "bbox": [24.3373, 24.3585, 120.7815, 120.8421],
        "osm_area_km2": 4.121,
    },
    {
        "key": "shimen",
        "name": "Shimen",
        "name_zh": "石門水庫",
        "station": "10201",
        "osm": "relation/3304018",
        "bbox": [24.7990, 24.8235, 121.2381, 121.3254],
        "osm_area_km2": 5.883,
    },
    {
        "key": "feitsui",
        "name": "Feitsui",
        "name_zh": "翡翠水庫",
        "station": "10205",
        "osm": "relation/5460776",
        "bbox": [24.8867, 24.9409, 121.5782, 121.6888],
        "osm_area_km2": 9.722,
    },
    {
        "key": "yongheshan",
        "name": "Yongheshan",
        "name_zh": "永和山水庫",
        "station": "10501",
        "osm": "way/154546569",
        "bbox": [24.6447, 24.6613, 120.9127, 120.9363],
        "osm_area_km2": 1.117,
    },
    {
        "key": "mingde",
        "name": "Mingde",
        "name_zh": "明德水庫",
        "station": "10601",
        "osm": "relation/2766172",
        "bbox": [24.5799, 24.5946, 120.8838, 120.9237],
        "osm_area_km2": 1.269,
    },
    {
        "key": "deji",
        "name": "Deji",
        "name_zh": "德基水庫",
        "station": "20201",
        "osm": "way/202162584",
        "bbox": [24.2497, 24.2762, 121.1629, 121.2559],
        "osm_area_km2": 3.806,
    },
    {
        "key": "sunmoonlake",
        "name": "Sun Moon Lake",
        "name_zh": "日月潭",
        "station": "20502",
        "osm": "relation/3858334",
        "bbox": [23.8322, 23.8724, 120.8998, 120.9426],
        "osm_area_km2": 8.055,
    },
]


def observation_times(granule: str) -> tuple[str, str]:
    """Read acquisition time from the source identity, not an approximate date."""
    start = granule.split("_")[11]
    utc = datetime.strptime(start, "%Y%m%dT%H%M%S").replace(tzinfo=UTC)
    return utc.isoformat().replace("+00:00", "Z"), utc.astimezone(TAIPEI).isoformat()


def official_date(utc: str) -> str:
    """Map a timestamp to the calendar date of the Taipei 07:00 gauge reading."""
    value = datetime.fromisoformat(utc.replace("Z", "+00:00"))
    if value.tzinfo is None:
        raise ValueError("An acquisition timestamp must include its UTC offset.")
    return value.astimezone(TAIPEI).date().isoformat()


def browse_url(granule: str, polarization: str) -> str:
    if polarization not in {"HH", "HV"}:
        raise ValueError("Only measured HH and HV channels are available.")
    return (
        f"https://nisar.asf.earthdatacloud.nasa.gov/BROWSE/{COLLECTION}/"
        f"{granule}/{granule}_NATIVE_A_{polarization * 2}.png"
    )


def data_url(granule: str) -> str:
    return f"https://nisar.asf.earthdatacloud.nasa.gov/NISAR/{COLLECTION}/{granule}/{granule}.h5"

export type RainCondition = "rain" | "no_measurable_rain" | "trace" | "missing";
export interface WeatherDay {
  local_date: string;
  rainfall_mm: number | null;
  rainfall_trace: boolean;
  condition: RainCondition;
  rainfall_quality_flag: number | null;
  sunshine_hours: number | null;
}
export interface WeatherSeries {
  schema_version: 1;
  reservoir: string;
  source: string;
  generated_at: string;
  timezone: "Asia/Taipei";
  period: { start: string; end: string };
  station: {
    id: string;
    name: string;
    name_zh: string;
    latitude: number;
    longitude: number;
    distance_to_reservoir_center_km: number;
  };
  records: WeatherDay[];
}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object";
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const nonnegativeOrNull = (v: unknown) => v === null || (finite(v) && v >= 0);
const localDate = (v: unknown): v is string =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v;
export function parseWeather(value: unknown, reservoir: string): WeatherSeries {
  if (
    !object(value) ||
    value.schema_version !== 1 ||
    value.reservoir !== reservoir ||
    value.timezone !== "Asia/Taipei" ||
    value.source !== "https://codis.cwa.gov.tw/StationData" ||
    typeof value.generated_at !== "string" ||
    !Number.isFinite(Date.parse(value.generated_at)) ||
    !object(value.period) ||
    !localDate(value.period.start) ||
    !localDate(value.period.end) ||
    value.period.start > value.period.end ||
    !object(value.station) ||
    !Array.isArray(value.records)
  )
    throw new Error("Invalid weather archive");
  const station = value.station;
  if (
    ![station.id, station.name, station.name_zh].every(
      (v) => typeof v === "string" && v.length > 0,
    ) ||
    ![
      station.latitude,
      station.longitude,
      station.distance_to_reservoir_center_km,
    ].every(finite)
  )
    throw new Error("Invalid weather station");
  let previous = "";
  for (const row of value.records) {
    if (
      !object(row) ||
      !localDate(row.local_date) ||
      row.local_date <= previous ||
      row.local_date < value.period.start ||
      row.local_date > value.period.end ||
      !nonnegativeOrNull(row.rainfall_mm) ||
      !nonnegativeOrNull(row.sunshine_hours) ||
      !(
        row.rainfall_quality_flag === null || finite(row.rainfall_quality_flag)
      ) ||
      typeof row.rainfall_trace !== "boolean"
    )
      throw new Error("Invalid daily weather observation");
    const expected = row.rainfall_trace
      ? "trace"
      : row.rainfall_mm === null
        ? "missing"
        : (row.rainfall_mm as number) > 0
          ? "rain"
          : "no_measurable_rain";
    if (
      row.condition !== expected ||
      (row.rainfall_trace && row.rainfall_mm !== null)
    )
      throw new Error("Inconsistent rain status");
    if (
      previous &&
      Date.parse(row.local_date) - Date.parse(previous) !== 86400000
    )
      throw new Error("Missing calendar day; encode it explicitly as null");
    previous = row.local_date;
  }
  if (
    !value.records.length ||
    value.records[0].local_date !== value.period.start ||
    previous !== value.period.end
  )
    throw new Error("Incomplete weather period");
  return value as unknown as WeatherSeries;
}
export function rainLabel(row: WeatherDay | undefined, en: boolean): string {
  const condition = row?.condition ?? "missing";
  return {
    rain: en ? "Rain observed" : "有雨",
    no_measurable_rain: en
      ? "No measurable rain (sky unknown)"
      : "未測得雨（晴陰未知）",
    trace: en ? "Trace precipitation" : "雨跡",
    missing: en ? "Missing observation" : "缺值",
  }[condition];
}
export function rainIcon(row: WeatherDay | undefined): string {
  if (!row || row.condition === "missing") return "?";
  if (row.condition === "rain" || row.condition === "trace") return "☂";
  return row.sunshine_hours != null && row.sunshine_hours > 0 ? "☀" : "○";
}

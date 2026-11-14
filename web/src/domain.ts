import type { Language } from "./i18n";

export type Polarization = "HH" | "HV";
export interface Reservoir {
  key: string;
  name: string;
  name_zh: string;
  station: string;
  osm: string;
  bbox: [number, number, number, number];
  osm_area_km2: number;
}
export interface Acquisition {
  utc_date: string;
  utc: string;
  local: string;
  granule: string;
  browse: Record<Polarization, string>;
  available: Record<Polarization, boolean>;
}
export interface DataIndex {
  mode: "browse" | "numeric" | "mixed";
  numeric_reservoirs?: string[];
  image_reservoirs?: string[];
  collection: string;
  generated_at: string;
  reservoirs: Reservoir[];
  dates: Acquisition[];
  gap: { start: string; end: string };
  official_source: string;
  seed_retrieved_at: string;
}
export interface OfficialRecord {
  local_date: string;
  nisar_utc_date: string | null;
  pct: number | null;
  level_m: number | null;
}
export interface OfficialSeries {
  source: string;
  source_kind: "seed" | "live";
  retrieved_at: string;
  records: OfficialRecord[];
}
export const dataUrl = (path: string) =>
  `${import.meta.env.BASE_URL}data/${path}`;
export function formatDate(
  value: string,
  short = false,
  lang: Language = "zh-TW",
): string {
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "zh-TW", {
    day: "2-digit",
    month: short ? "short" : "long",
    ...(short ? {} : { year: "numeric" }),
    timeZone: "UTC",
  }).format(new Date(value.slice(0, 10) + "T12:00:00Z"));
}
/** Acquisition timestamps retain their instant and are displayed in Taiwan time. */
export function formatAcquisitionDate(
  value: Acquisition | string,
  short = false,
  lang: Language = "zh-TW",
): string {
  const timestamp = typeof value === "string" ? value : value.utc;
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime()))
    throw new Error("Invalid acquisition timestamp.");
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "zh-TW", {
    day: "2-digit",
    month: short ? "short" : "long",
    ...(short ? {} : { year: "numeric" }),
    timeZone: "Asia/Taipei",
  }).format(date);
}
export function formatAcquisitionTime(
  value: Acquisition | string,
  lang: Language = "zh-TW",
): string {
  const timestamp = typeof value === "string" ? value : value.utc;
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime()))
    throw new Error("Invalid acquisition timestamp.");
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Taipei",
  }).format(date);
}
export function datePosition(date: string, start: string, end: string): number {
  const min = Date.parse(start),
    max = Date.parse(end),
    current = Date.parse(date);
  if (![min, max, current].every(Number.isFinite) || max <= min) return 0;
  return Math.max(0, Math.min(100, ((current - min) / (max - min)) * 100));
}
export function nearestAcquisition(
  dates: Acquisition[],
  target: string,
): number {
  if (!dates.length) return -1;
  const timestamp = Date.parse(target);
  if (!Number.isFinite(timestamp)) return 0;
  return dates.reduce(
    (best, date, index) =>
      Math.abs(Date.parse(date.utc_date) - timestamp) <
      Math.abs(Date.parse(dates[best].utc_date) - timestamp)
        ? index
        : best,
    0,
  );
}
export function localGaugeDate(utc: string): string {
  const date = new Date(utc);
  if (!Number.isFinite(date.getTime()))
    throw new Error("Invalid acquisition time");
  return new Date(date.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
}
export function decodeDb(value: number): number | null {
  if (!Number.isInteger(value) || value < 0 || value > 255)
    throw new Error("Expected Uint8");
  return value === 0 ? null : -35 + ((value - 1) * 40) / 254;
}
export function waterAreaKm2(
  pixels: Uint8Array,
  mask: Uint8Array,
  thresholdDb: number,
  pixelSideMercator: number,
  latitude: number,
): number {
  if (
    pixels.length !== mask.length ||
    !Number.isFinite(thresholdDb) ||
    !Number.isFinite(pixelSideMercator) ||
    pixelSideMercator <= 0 ||
    !Number.isFinite(latitude) ||
    Math.abs(latitude) >= 90
  )
    throw new Error("Invalid area parameters");
  let count = 0;
  pixels.forEach((value, i) => {
    const db = decodeDb(value);
    if (mask[i] && db !== null && db < thresholdDb) count++;
  });
  return (
    (count * (pixelSideMercator * Math.cos((latitude * Math.PI) / 180)) ** 2) /
    1_000_000
  );
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
const text = (v: unknown): v is string => typeof v === "string";
const validDate = (value: unknown): value is string =>
  text(value) && Number.isFinite(Date.parse(value));
const assetPath = (value: unknown): value is string =>
  text(value) &&
  /^[a-zA-Z0-9_./-]+$/.test(value) &&
  !value.startsWith("/") &&
  !value
    .split("/")
    .some((part) => part === ".." || part === "." || part === "");
export function parseIndex(value: unknown): DataIndex {
  if (
    !object(value) ||
    !["browse", "numeric", "mixed"].includes(String(value.mode)) ||
    !text(value.collection) ||
    !validDate(value.generated_at) ||
    !Array.isArray(value.reservoirs) ||
    value.reservoirs.length === 0 ||
    !Array.isArray(value.dates) ||
    value.dates.length === 0 ||
    !object(value.gap) ||
    !text(value.gap.start) ||
    !text(value.gap.end) ||
    !Number.isFinite(Date.parse(String(value.gap.start))) ||
    !Number.isFinite(Date.parse(String(value.gap.end)))
  )
    throw new Error("資料清單格式有誤，請重新執行 pipeline 匯出。");
  for (const r of value.reservoirs)
    if (
      !object(r) ||
      !text(r.key) ||
      !/^[a-z0-9]+$/.test(r.key) ||
      !text(r.name) ||
      !text(r.name_zh) ||
      !text(r.station) ||
      !text(r.osm) ||
      typeof r.osm_area_km2 !== "number" ||
      !Number.isFinite(r.osm_area_km2) ||
      r.osm_area_km2 <= 0 ||
      !Array.isArray(r.bbox) ||
      r.bbox.length !== 4 ||
      !r.bbox.every(Number.isFinite)
    )
      throw new Error("水庫中繼資料格式有誤");
  const reservoirKeys = new Set(
    value.reservoirs.map((reservoir) => reservoir.key),
  );
  if (reservoirKeys.size !== value.reservoirs.length)
    throw new Error("Duplicate reservoir keys.");
  for (const field of ["numeric_reservoirs", "image_reservoirs"]) {
    const keys = value[field];
    if (
      keys !== undefined &&
      (!Array.isArray(keys) ||
        new Set(keys).size !== keys.length ||
        !keys.every((key) => text(key) && reservoirKeys.has(key)))
    )
      throw new Error("Invalid numerical reservoir selection.");
  }
  if (value.mode === "mixed" && !Array.isArray(value.numeric_reservoirs))
    throw new Error(
      "Mixed archives must declare which reservoirs publish area.",
    );
  if (
    Array.isArray(value.image_reservoirs) &&
    Array.isArray(value.numeric_reservoirs) &&
    !value.numeric_reservoirs.every((key) =>
      (value.image_reservoirs as unknown[]).includes(key),
    )
  )
    throw new Error("Area publication requires a calibrated image archive.");
  for (const d of value.dates)
    if (
      !object(d) ||
      !text(d.utc_date) ||
      !Number.isFinite(Date.parse(d.utc_date)) ||
      !validDate(d.utc) ||
      !validDate(d.local) ||
      d.utc.slice(0, 10) !== d.utc_date ||
      localGaugeDate(d.utc) !== d.local.slice(0, 10) ||
      Date.parse(d.utc) !== Date.parse(d.local) ||
      !text(d.granule) ||
      !object(d.browse) ||
      !object(d.available) ||
      !["HH", "HV"].every(
        (p) =>
          assetPath((d.browse as Record<string, unknown>)[p]) &&
          typeof (d.available as Record<string, unknown>)[p] === "boolean",
      )
    )
      throw new Error("取像中繼資料格式有誤");
  const timestamps = value.dates.map((date) => Date.parse(date.utc));
  if (
    timestamps.some((timestamp, i) => i > 0 && timestamp <= timestamps[i - 1])
  )
    throw new Error("Acquisitions must be unique and chronological.");
  return value as unknown as DataIndex;
}
export function parseOfficial(value: unknown): OfficialSeries {
  if (
    !object(value) ||
    !text(value.source) ||
    !["seed", "live"].includes(String(value.source_kind)) ||
    !text(value.retrieved_at) ||
    !Array.isArray(value.records) ||
    !value.records.length
  )
    throw new Error("官方觀測時間序列格式有誤");
  for (const record of value.records)
    if (
      !object(record) ||
      !text(record.local_date) ||
      !Number.isFinite(Date.parse(record.local_date)) ||
      !(record.nisar_utc_date === null || text(record.nisar_utc_date)) ||
      !["pct", "level_m"].every(
        (k) =>
          record[k] === null ||
          (typeof record[k] === "number" && Number.isFinite(record[k])),
      )
    )
      throw new Error("官方觀測值格式有誤");
  return value as unknown as OfficialSeries;
}
export async function loadJson<T>(
  path: string,
  parse: (input: unknown) => T,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(dataUrl(path), { signal });
  if (!response.ok)
    throw new Error(`無法載入 ${path}（${response.status}），請重試。`);
  return parse(await response.json());
}

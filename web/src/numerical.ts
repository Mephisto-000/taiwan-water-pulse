import { useEffect, useState } from "react";
import {
  dataUrl,
  decodeDb,
  type Acquisition,
  type Polarization,
} from "./domain";

export interface NumericMeta {
  grid: {
    width: number;
    height: number;
    bounds: [number, number, number, number];
    bounds_wgs84: [number, number, number, number];
    pixel_side_m: number;
    epsg: number;
  };
  pixel_area_m2: number;
  classification_channel: Polarization;
  thresholds: Record<Polarization, number>;
  processing?: Record<string, unknown>;
}
export interface AreaObservation {
  utc: string;
  local: string;
  granule: string;
  area_km2: {
    hh: number;
    hh_lo: number;
    hh_hi: number;
    hv: number;
    hv_lo: number;
    hv_hi: number;
    primary: number;
    primary_lo: number;
    primary_hi: number;
  };
  valid_fraction: number;
  qa: string[];
  official: { local: string; pct: number | null; level_m: number | null };
}
export interface AreaSeries {
  records: AreaObservation[];
  stats: {
    classification_channel: Polarization;
    spearman_area_vs_level: number | null;
    pearson_area_vs_level: number | null;
    spearman_area_hh_vs_level: number | null;
    pearson_area_hh_vs_level: number | null;
    n: number;
  };
}
export interface NumericalArchive {
  meta: NumericMeta;
  mask: Uint8Array;
  series: AreaSeries;
  frames: Record<string, Record<Polarization, Uint8Array>>;
}
export interface AreaEstimate {
  area: number;
  low: number;
  high: number;
}
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const coordinates = (value: unknown) =>
  Array.isArray(value) && value.length === 4 && value.every(finite);
const dateTime = (value: unknown) =>
  typeof value === "string" && Number.isFinite(Date.parse(value));
export function parseNumericMeta(value: unknown): NumericMeta {
  if (!isObject(value) || !isObject(value.grid) || !isObject(value.thresholds))
    throw new Error(
      "Invalid numerical metadata. Re-run the validated pipeline.",
    );
  const { grid, thresholds } = value;
  if (
    !finite(grid.width) ||
    !finite(grid.height) ||
    !Number.isInteger(grid.width) ||
    !Number.isInteger(grid.height) ||
    grid.width <= 0 ||
    grid.height <= 0 ||
    grid.width * grid.height > 10_000_000 ||
    grid.epsg !== 3857 ||
    !coordinates(grid.bounds) ||
    !coordinates(grid.bounds_wgs84) ||
    !finite(grid.pixel_side_m) ||
    grid.pixel_side_m <= 0 ||
    !finite(value.pixel_area_m2) ||
    value.pixel_area_m2 <= 0 ||
    !["HH", "HV"].includes(String(value.classification_channel)) ||
    !finite(thresholds.HH) ||
    !finite(thresholds.HV)
  )
    throw new Error(
      "Invalid numerical grid or calibration. Re-run the validated pipeline.",
    );
  return value as unknown as NumericMeta;
}
export function parseAreaSeries(
  value: unknown,
  dates: Acquisition[],
): AreaSeries {
  if (
    !isObject(value) ||
    !Array.isArray(value.records) ||
    value.records.length !== dates.length ||
    !isObject(value.stats)
  )
    throw new Error("Invalid numerical time series.");
  const seen = new Set<string>();
  for (const record of value.records) {
    if (
      !isObject(record) ||
      !dateTime(record.utc) ||
      !dateTime(record.local) ||
      typeof record.granule !== "string" ||
      !isObject(record.area_km2) ||
      !finite(record.valid_fraction) ||
      record.valid_fraction < 0 ||
      record.valid_fraction > 1 ||
      !Array.isArray(record.qa) ||
      !record.qa.every((item) => typeof item === "string")
    )
      throw new Error("Invalid numerical observation.");
    const area = record.area_km2;
    if (
      ![
        area.hh,
        area.hh_lo,
        area.hh_hi,
        area.hv,
        area.hv_lo,
        area.hv_hi,
        area.primary,
        area.primary_lo,
        area.primary_hi,
      ].every((value) => finite(value) && value >= 0) ||
      Number(area.hh_lo) > Number(area.hh) ||
      Number(area.hh_hi) < Number(area.hh) ||
      Number(area.primary_lo) > Number(area.primary) ||
      Number(area.primary_hi) < Number(area.primary)
    )
      throw new Error("Invalid area or sensitivity range.");
    const acquisition = dates.find(
      (date) => date.utc === record.utc && date.granule === record.granule,
    );
    if (!acquisition || seen.has(acquisition.utc_date))
      throw new Error(
        "Area observations do not match the acquisition manifest.",
      );
    seen.add(acquisition.utc_date);
  }
  const stats = value.stats;
  if (
    !["HH", "HV"].includes(String(stats.classification_channel)) ||
    !finite(stats.n) ||
    !Number.isInteger(stats.n) ||
    stats.n < 0 ||
    stats.n > dates.length ||
    ![
      stats.spearman_area_hh_vs_level,
      stats.pearson_area_hh_vs_level,
      stats.spearman_area_vs_level,
      stats.pearson_area_vs_level,
    ].every(
      (value) =>
        value === null || (finite(value) && Math.abs(value) <= 1.0000001),
    )
  )
    throw new Error("Invalid correlation statistics.");
  return value as unknown as AreaSeries;
}
export function estimateArea(
  pixels: Uint8Array,
  mask: Uint8Array,
  threshold: number,
  pixelArea: number,
): AreaEstimate {
  if (
    pixels.length !== mask.length ||
    !Number.isFinite(threshold) ||
    !Number.isFinite(pixelArea) ||
    pixelArea <= 0
  )
    throw new Error("Invalid numerical area inputs");
  let count = 0,
    low = 0,
    high = 0;
  for (let i = 0; i < pixels.length; i++) {
    if (!mask[i] || !pixels[i]) continue;
    const db = decodeDb(pixels[i])!;
    if (db < threshold) count++;
    if (db < threshold - 1.5) low++;
    if (db < threshold + 1.5) high++;
  }
  return {
    area: (count * pixelArea) / 1e6,
    low: (low * pixelArea) / 1e6,
    high: (high * pixelArea) / 1e6,
  };
}
async function request(path: string, signal: AbortSignal): Promise<Response> {
  const response = await fetch(dataUrl(path), { signal });
  if (!response.ok)
    throw new Error(
      `Unable to load numerical asset ${path} (${response.status}).`,
    );
  return response;
}
export function useNumericalArchive(
  enabled: boolean,
  key: string,
  dates: Acquisition[],
) {
  const [archive, setArchive] = useState<NumericalArchive | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setArchive(null);
    setError("");
    if (!enabled) return () => controller.abort();
    async function load() {
      const base = `reservoirs/${key}/`;
      const [metaResponse, seriesResponse] = await Promise.all([
        request(base + "meta.json", controller.signal),
        request(base + "timeseries.json", controller.signal),
      ]);
      const meta = parseNumericMeta(await metaResponse.json());
      const series = parseAreaSeries(await seriesResponse.json(), dates);
      if (meta.classification_channel !== series.stats.classification_channel)
        throw new Error(
          "Classification channel differs between metadata and statistics.",
        );
      const size = meta.grid.width * meta.grid.height;
      const bytes = async (path: string) => {
        const array = new Uint8Array(
          await (await request(base + path, controller.signal)).arrayBuffer(),
        );
        if (array.length !== size)
          throw new Error(`Numerical asset has the wrong grid size: ${path}`);
        return array;
      };
      const mask = await bytes("mask.bin");
      if (mask.some((value) => value !== 0 && value !== 1))
        throw new Error("The analysis mask contains values other than 0 or 1.");
      const frames: NumericalArchive["frames"] = {};
      // A reservoir is small enough to preload; playback never waits on an unseen frame.
      await Promise.all(
        dates.map(async (date) => {
          const name = date.utc_date.replaceAll("-", "");
          const [HH, HV] = await Promise.all([
            bytes(name + "_HH.bin"),
            bytes(name + "_HV.bin"),
          ]);
          frames[date.utc_date] = { HH, HV };
        }),
      );
      if (!controller.signal.aborted)
        setArchive({ meta, mask, series, frames });
    }
    void load().catch((cause: unknown) => {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "Numerical data could not be loaded.",
        );
    });
    return () => controller.abort();
  }, [enabled, key, dates, retry]);
  return { archive, error, retry: () => setRetry((value) => value + 1) };
}

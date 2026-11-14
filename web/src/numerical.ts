import { useEffect, useState } from "react";
import type { ScientificStats } from "./science";
import {
  dataUrl,
  decodeDb,
  type Acquisition,
  type Polarization,
} from "./domain";

export type ValidationGrade = "A" | "B" | "C";
export interface CorrelationSummary {
  n: number;
  pearson_area_vs_level: number | null;
  spearman_area_vs_level: number | null;
  pearson_ci95: [number, number] | null;
  spearman_ci95: [number, number] | null;
}
export interface PhysicalChecks {
  passed: boolean;
  osm_area_km2: number;
  full_storage_max_area_km2: number | null;
  full_storage_within_1_1_osm: boolean;
  lowest_observed_utc: string;
  full_reference_utc: string;
  lowest_area_smaller_than_full: boolean;
  matched_level_tolerance_m: number;
  matched_level_pairs: {
    before_utc: string;
    after_utc: string;
    level_difference_m: number;
    area_difference_km2: number;
  }[];
}
export interface NumericalValidation
  extends CorrelationSummary, ScientificStats {
  grade: ValidationGrade;
  publish_area: boolean;
  reason: string;
  method: string;
  bootstrap_repetitions?: number;
  below_95: CorrelationSummary;
  physical_checks: PhysicalChecks;
}
export interface AnalysisMeta {
  grid: {
    width: number;
    height: number;
    bounds: [number, number, number, number];
    bounds_wgs84: [number, number, number, number];
    pixel_side_m: number;
    epsg: 32651;
  };
  pixel_area_m2: number;
  threshold_ratio: number;
  sensitivity_ratios: [number, number];
  land_median_db_by_date: Record<string, number>;
  mask: "analysis/mask.bin";
  outline_pixel_rings: number[][][];
  display_transform: [number, number, number, number, number, number];
}
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
  display_ranges_db?: Record<Polarization, [number, number]>;
  validation: NumericalValidation;
  outline_pixel_rings: number[][][];
  overview: {
    source_width: number;
    source_height: number;
    crop_pixels: [number, number, number, number];
  };
  analysis?: AnalysisMeta;
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
  qa_by_channel?: Record<Polarization, string[]>;
  land_median_db_by_channel?: Record<Polarization, number>;
  valid_fraction_by_channel?: Record<Polarization, number>;
  separation?: Record<Polarization, number | null>;
  separation_samples?: Record<Polarization, { inside: number; ring: number }>;
  threshold_db?: number;
  land_median_db?: number;
  threshold_ratio?: number;
  official: {
    local: string;
    pct: number | null;
    level_m: number | null;
    storage_volume_m3?: number | null;
    effective_capacity_m3?: number | null;
  };
}
export interface AreaSeries {
  records: AreaObservation[];
  stats: ScientificStats & {
    classification_channel: Polarization;
    spearman_area_vs_level: number | null;
    pearson_area_vs_level: number | null;
    spearman_area_hh_vs_level: number | null;
    pearson_area_hh_vs_level: number | null;
    n: number;
    grade?: ValidationGrade;
    publish_area?: boolean;
    reason?: string;
    method?: string;
    pearson_ci95?: [number, number] | null;
    spearman_ci95?: [number, number] | null;
    bootstrap_repetitions?: number;
    below_95?: CorrelationSummary;
    physical_checks?: PhysicalChecks;
  };
}
export interface NumericalArchive {
  meta: NumericMeta;
  mask: Uint8Array;
  series: AreaSeries;
  frames: Record<string, Partial<Record<Polarization, Uint8Array>>>;
  analysis?: {
    mask: Uint8Array;
    frames: Record<string, Uint8Array>;
  };
}
export interface RelativeNumericalArchive extends NumericalArchive {
  meta: NumericMeta & { analysis: AnalysisMeta };
  analysis: { mask: Uint8Array; frames: Record<string, Uint8Array> };
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
const correlation = (value: unknown) =>
  value === null || (finite(value) && Math.abs(value) <= 1.0000001);
const confidenceInterval = (value: unknown) =>
  value === null ||
  (Array.isArray(value) &&
    value.length === 2 &&
    value.every((number) => finite(number) && Math.abs(number) <= 1.0000001) &&
    value[0] <= value[1]);
const dateTime = (value: unknown) =>
  typeof value === "string" && Number.isFinite(Date.parse(value));
const pixelRings = (value: unknown) =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every(
    (ring) =>
      Array.isArray(ring) &&
      ring.length >= 4 &&
      ring.every(
        (point) =>
          Array.isArray(point) && point.length === 2 && point.every(finite),
      ) &&
      ring[0][0] === ring[ring.length - 1][0] &&
      ring[0][1] === ring[ring.length - 1][1],
  );

function validateAnalysis(value: unknown): void {
  if (!isObject(value) || !isObject(value.grid))
    throw new Error("Relative-power classification requires an analysis grid.");
  const grid = value.grid;
  if (
    !finite(grid.width) ||
    !finite(grid.height) ||
    !Number.isInteger(grid.width) ||
    !Number.isInteger(grid.height) ||
    grid.width <= 0 ||
    grid.height <= 0 ||
    grid.width * grid.height > 10_000_000 ||
    grid.epsg !== 32651 ||
    !finite(grid.pixel_side_m) ||
    grid.pixel_side_m <= 0 ||
    !coordinates(grid.bounds) ||
    !coordinates(grid.bounds_wgs84) ||
    !finite(value.pixel_area_m2) ||
    value.pixel_area_m2 <= 0
  )
    throw new Error("Invalid native UTM analysis grid.");
  const bounds = grid.bounds as number[];
  const geographic = grid.bounds_wgs84 as number[];
  if (
    bounds[0] >= bounds[2] ||
    bounds[1] >= bounds[3] ||
    geographic[0] >= geographic[2] ||
    geographic[1] >= geographic[3] ||
    geographic[0] < -180 ||
    geographic[2] > 180 ||
    geographic[1] < -85 ||
    geographic[3] > 85
  )
    throw new Error("Invalid analysis grid bounds.");
  if (
    !finite(value.threshold_ratio) ||
    value.threshold_ratio <= 0 ||
    value.threshold_ratio > 1 ||
    !Array.isArray(value.sensitivity_ratios) ||
    value.sensitivity_ratios.length !== 2 ||
    !value.sensitivity_ratios.every(finite) ||
    Math.abs(
      value.sensitivity_ratios[0] - Math.max(0, value.threshold_ratio - 0.1),
    ) > 1e-9 ||
    Math.abs(
      value.sensitivity_ratios[1] - Math.min(1, value.threshold_ratio + 0.1),
    ) > 1e-9 ||
    !isObject(value.land_median_db_by_date) ||
    !Object.entries(value.land_median_db_by_date).every(
      ([date, median]) =>
        /^\d{4}-\d{2}-\d{2}$/.test(date) && dateTime(date) && finite(median),
    ) ||
    value.mask !== "analysis/mask.bin" ||
    !pixelRings(value.outline_pixel_rings) ||
    !Array.isArray(value.display_transform) ||
    value.display_transform.length !== 6 ||
    !value.display_transform.every(finite)
  )
    throw new Error("Invalid relative-power threshold or analysis mapping.");
}
function validateCorrelations(value: unknown, maxN: number): void {
  if (
    !isObject(value) ||
    !finite(value.n) ||
    !Number.isInteger(value.n) ||
    value.n < 0 ||
    value.n > maxN ||
    !correlation(value.pearson_area_vs_level) ||
    !correlation(value.spearman_area_vs_level) ||
    !confidenceInterval(value.pearson_ci95) ||
    !confidenceInterval(value.spearman_ci95)
  )
    throw new Error("Invalid correlation or bootstrap interval.");
}
function validateAssessment(value: unknown, maxN: number): void {
  validateCorrelations(value, maxN);
  if (
    !isObject(value) ||
    !["A", "B", "C"].includes(String(value.grade)) ||
    typeof value.publish_area !== "boolean" ||
    (value.grade === "C" && value.publish_area) ||
    typeof value.reason !== "string" ||
    typeof value.method !== "string" ||
    !isObject(value.physical_checks) ||
    (value.bootstrap_repetitions !== undefined &&
      (!finite(value.bootstrap_repetitions) ||
        !Number.isInteger(value.bootstrap_repetitions) ||
        value.bootstrap_repetitions < 1))
  )
    throw new Error("Invalid numerical publication assessment.");
  validateCorrelations(value.below_95, Number(value.n));
  const checks = value.physical_checks;
  if (
    !isObject(checks) ||
    typeof checks.passed !== "boolean" ||
    !finite(checks.osm_area_km2) ||
    checks.osm_area_km2 <= 0 ||
    !(
      checks.full_storage_max_area_km2 === null ||
      (finite(checks.full_storage_max_area_km2) &&
        checks.full_storage_max_area_km2 >= 0)
    ) ||
    typeof checks.full_storage_within_1_1_osm !== "boolean" ||
    typeof checks.lowest_area_smaller_than_full !== "boolean" ||
    checks.passed !==
      (checks.full_storage_within_1_1_osm &&
        checks.lowest_area_smaller_than_full) ||
    !dateTime(checks.lowest_observed_utc) ||
    !dateTime(checks.full_reference_utc) ||
    !finite(checks.matched_level_tolerance_m) ||
    checks.matched_level_tolerance_m < 0 ||
    !Array.isArray(checks.matched_level_pairs) ||
    !checks.matched_level_pairs.every(
      (pair) =>
        isObject(pair) &&
        dateTime(pair.before_utc) &&
        dateTime(pair.after_utc) &&
        finite(pair.level_difference_m) &&
        pair.level_difference_m >= 0 &&
        pair.level_difference_m <= Number(checks.matched_level_tolerance_m) &&
        finite(pair.area_difference_km2),
    )
  )
    throw new Error("Invalid physical consistency assessment.");
  if (value.publish_area && !checks.passed)
    throw new Error("Area publication requires physical consistency checks.");
  if (
    value.publish_area &&
    (Number(value.n) < 3 ||
      !finite(value.pearson_area_vs_level) ||
      value.pearson_area_vs_level < 0.5)
  )
    throw new Error("Area publication lacks sufficient paired evidence.");
  if (
    value.grade === "A" &&
    (!finite(value.pearson_area_vs_level) ||
      value.pearson_area_vs_level < 0.8 ||
      !Array.isArray(value.pearson_ci95) ||
      Number(value.pearson_ci95[0]) < 0.6)
  )
    throw new Error(
      "Grade A requires the stated correlation and confidence bound.",
    );
  if (value.review_version !== undefined) {
    const effect = value.effect_size;
    if (
      typeof value.review_version !== "string" ||
      !isObject(effect) ||
      !finite(effect.n) ||
      !Number.isInteger(effect.n) ||
      effect.n < 0 ||
      effect.n > maxN ||
      !finite(effect.area_range_km2) ||
      effect.area_range_km2 < 0 ||
      !finite(effect.mean_sensitivity_width_km2) ||
      effect.mean_sensitivity_width_km2 < 0 ||
      !(
        effect.range_to_sensitivity_ratio === null ||
        (finite(effect.range_to_sensitivity_ratio) &&
          effect.range_to_sensitivity_ratio >= 0)
      ) ||
      effect.minimum_ratio !== 2 ||
      typeof effect.passes !== "boolean" ||
      effect.passes !==
        (effect.area_range_km2 > 0 &&
          effect.area_range_km2 >= 2 * effect.mean_sensitivity_width_km2) ||
      !(
        effect.level_range_m === null ||
        (finite(effect.level_range_m) && effect.level_range_m >= 0)
      )
    )
      throw new Error("Invalid review effect-size evidence.");
    if (value.grade === "A" && !effect.passes)
      throw new Error(
        "Grade A requires sufficient area change beyond sensitivity.",
      );
    if (
      value.grade === "B" &&
      (!Array.isArray(value.pearson_ci95) || Number(value.pearson_ci95[0]) <= 0)
    )
      throw new Error("Grade B requires a positive lower confidence bound.");
  }
}
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
  const bounds = grid.bounds as number[];
  const geographic = grid.bounds_wgs84 as number[];
  if (
    bounds[0] >= bounds[2] ||
    bounds[1] >= bounds[3] ||
    geographic[0] >= geographic[2] ||
    geographic[1] >= geographic[3] ||
    geographic[0] < -180 ||
    geographic[2] > 180 ||
    geographic[1] < -85 ||
    geographic[3] > 85
  )
    throw new Error("Invalid numerical grid bounds.");
  if (value.display_ranges_db !== undefined) {
    const ranges = value.display_ranges_db;
    if (
      !isObject(ranges) ||
      !["HH", "HV"].every((pol) => {
        const range = ranges[pol];
        return (
          Array.isArray(range) &&
          range.length === 2 &&
          range.every(finite) &&
          range[0] >= -35 &&
          range[1] <= 5 &&
          range[0] < range[1]
        );
      })
    )
      throw new Error("Invalid display-only dB ranges.");
  }
  validateAssessment(value.validation, 100_000);
  if (!pixelRings(value.outline_pixel_rings))
    throw new Error("Invalid OSM outline coordinates.");
  if (
    value.analysis !== undefined ||
    (isObject(value.validation) &&
      String(value.validation.method).startsWith("relative_power"))
  )
    validateAnalysis(value.analysis);
  {
    const overview = value.overview;
    if (
      !isObject(overview) ||
      !finite(overview.source_width) ||
      !finite(overview.source_height) ||
      overview.source_width <= 0 ||
      overview.source_height <= 0 ||
      !coordinates(overview.crop_pixels)
    )
      throw new Error("Invalid browse overview mapping.");
    const crop = overview.crop_pixels as number[];
    if (
      crop[0] < 0 ||
      crop[1] < 0 ||
      crop[2] <= 0 ||
      crop[3] <= 0 ||
      crop[0] + crop[2] > overview.source_width ||
      crop[1] + crop[3] > overview.source_height
    )
      throw new Error("Browse overview crop falls outside the source image.");
  }
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
      Number(area.hv_lo) > Number(area.hv) ||
      Number(area.hv_hi) < Number(area.hv) ||
      Number(area.primary_lo) > Number(area.primary) ||
      Number(area.primary_hi) < Number(area.primary)
    )
      throw new Error("Invalid area or sensitivity range.");
    if (
      !isObject(record.official) ||
      !dateTime(record.official.local) ||
      ![record.official.pct, record.official.level_m].every(
        (value) => value === null || finite(value),
      )
    )
      throw new Error("Invalid official comparison observation.");
    if (
      String(value.stats.method).startsWith("relative_power") ||
      record.threshold_ratio !== undefined
    ) {
      if (
        !finite(record.threshold_ratio) ||
        record.threshold_ratio <= 0 ||
        record.threshold_ratio > 1 ||
        !finite(record.land_median_db) ||
        !finite(record.threshold_db) ||
        Math.abs(
          record.threshold_db -
            relativeThresholdDb(record.threshold_ratio, record.land_median_db),
        ) > 1e-8
      )
        throw new Error("Invalid per-date relative-power threshold.");
    }
    if (
      record.separation !== undefined &&
      (!isObject(record.separation) ||
        ![record.separation.HH, record.separation.HV].every(
          (value) => value === null || finite(value),
        ))
    )
      throw new Error("Invalid shoreline contrast.");
    if (
      record.separation_samples !== undefined &&
      (!isObject(record.separation_samples) ||
        ![record.separation_samples.HH, record.separation_samples.HV].every(
          (sample) =>
            isObject(sample) &&
            [sample.inside, sample.ring].every(
              (n) => finite(n) && Number.isInteger(n) && n >= 0,
            ),
        ))
    )
      throw new Error("Invalid shoreline contrast sample counts.");
    const acquisition = dates.find(
      (date) => date.utc === record.utc && date.granule === record.granule,
    );
    if (
      !acquisition ||
      record.local !== acquisition.local ||
      seen.has(acquisition.utc_date)
    )
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
  if (stats.grade !== undefined) validateAssessment(stats, dates.length);
  return value as unknown as AreaSeries;
}

/** Classification and area widgets must not publish a C-grade or inconsistent result. */
export function canPublishArea(archive: NumericalArchive | null): boolean {
  return (
    archive !== null &&
    archive.meta.validation?.publish_area === true &&
    archive.meta.validation.grade !== "C" &&
    archive.meta.validation.grade === archive.series.stats.grade &&
    archive.series.stats.publish_area === true &&
    (!archive.meta.validation.method.startsWith("relative_power") ||
      hasRelativeAnalysis(archive))
  );
}

export function hasRelativeAnalysis(
  archive: NumericalArchive | null,
): archive is RelativeNumericalArchive {
  return archive?.meta.analysis !== undefined && archive.analysis !== undefined;
}

/** A power ratio becomes an additive dB offset; its reference is image-only land. */
export function relativeThresholdDb(
  ratio: number,
  landMedianDb: number,
): number {
  if (
    !Number.isFinite(ratio) ||
    ratio <= 0 ||
    ratio > 1 ||
    !Number.isFinite(landMedianDb)
  )
    throw new Error("Invalid relative-power reference or ratio.");
  return landMedianDb + 10 * Math.log10(ratio);
}

/** Quantitative area always uses the native analysis grid, never the display raster. */
export function estimateRelativeArea(
  pixels: Uint8Array,
  mask: Uint8Array,
  ratio: number,
  landMedianDb: number,
  pixelArea: number,
): AreaEstimate {
  const threshold = relativeThresholdDb(ratio, landMedianDb);
  if (
    pixels.length !== mask.length ||
    !Number.isFinite(pixelArea) ||
    pixelArea <= 0 ||
    mask.some((value) => value !== 0 && value !== 1)
  )
    throw new Error("Invalid relative-power analysis inputs.");
  const lowRatio = Math.max(0, ratio - 0.1);
  const lowThreshold =
    lowRatio === 0 ? -Infinity : relativeThresholdDb(lowRatio, landMedianDb);
  const highThreshold = relativeThresholdDb(
    Math.min(1, ratio + 0.1),
    landMedianDb,
  );
  let count = 0,
    low = 0,
    high = 0;
  for (let i = 0; i < pixels.length; i++) {
    if (mask[i] !== 1 || pixels[i] === 0) continue;
    const db = decodeDb(pixels[i])!;
    if (db < threshold) count++;
    if (db < lowThreshold) low++;
    if (db < highThreshold) high++;
  }
  return {
    area: (count * pixelArea) / 1e6,
    low: (low * pixelArea) / 1e6,
    high: (high * pixelArea) / 1e6,
  };
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
  if (mask.some((value) => value !== 0 && value !== 1))
    throw new Error("The analysis mask must contain only 0 or 1.");
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
const archiveCache = new Map<string, NumericalArchive>();
const archiveIdentity = (key: string, dates: Acquisition[]) =>
  `${key}:${dates.map((date) => `${date.utc}:${date.granule}`).join("|")}`;

/** Validate metadata and masks before requesting any image pixels. */
export async function loadNumericalMetadata(
  key: string,
  dates: Acquisition[],
  signal: AbortSignal,
): Promise<NumericalArchive> {
  if (!/^[a-z0-9]+$/.test(key) || !dates.length)
    throw new Error("Invalid numerical archive selection.");
  const base = `reservoirs/${key}/`;
  const [metaResponse, seriesResponse] = await Promise.all([
    request(base + "meta.json", signal),
    request(base + "timeseries.json", signal),
  ]);
  const meta = parseNumericMeta(await metaResponse.json());
  const series = parseAreaSeries(await seriesResponse.json(), dates);
  if (
    meta.classification_channel !== series.stats.classification_channel ||
    meta.validation?.grade !== series.stats.grade ||
    meta.validation?.publish_area !== series.stats.publish_area ||
    meta.validation.method !== series.stats.method ||
    meta.validation.review_version !== series.stats.review_version
  )
    throw new Error(
      "Classification or assessment differs between metadata and statistics.",
    );
  const size = meta.grid.width * meta.grid.height;
  const bytes = async (path: string, expectedSize = size) => {
    const array = new Uint8Array(
      await (await request(base + path, signal)).arrayBuffer(),
    );
    if (array.length !== expectedSize)
      throw new Error(`Numerical asset has the wrong grid size: ${path}`);
    return array;
  };
  const mask = await bytes("mask.bin");
  if (mask.some((value) => value !== 0 && value !== 1))
    throw new Error("The analysis mask contains values other than 0 or 1.");
  const analysisMeta = meta.analysis;
  const analysisSize = analysisMeta
    ? analysisMeta.grid.width * analysisMeta.grid.height
    : 0;
  let analysis: NumericalArchive["analysis"];
  if (analysisMeta) {
    const medians = analysisMeta.land_median_db_by_date;
    if (
      Object.keys(medians).length !== dates.length ||
      !dates.every((date) => finite(medians[date.utc_date])) ||
      series.records.some(
        (record) =>
          record.threshold_ratio !== analysisMeta.threshold_ratio ||
          record.land_median_db !== medians[record.utc.slice(0, 10)],
      )
    )
      throw new Error(
        "Analysis references do not match the acquisition series.",
      );
    const analysisMask = await bytes(analysisMeta.mask, analysisSize);
    if (analysisMask.some((value) => value !== 0 && value !== 1))
      throw new Error(
        "The native analysis mask contains values other than 0 or 1.",
      );
    analysis = { mask: analysisMask, frames: {} };
  }
  return { meta, mask, series, frames: {}, ...(analysis ? { analysis } : {}) };
}

/** Load one requested display channel and its independent HH analysis grid. */
export async function loadNumericalFrame(
  key: string,
  archive: NumericalArchive,
  date: string,
  polarization: Polarization,
  signal: AbortSignal,
): Promise<NumericalArchive> {
  if (
    !/^[a-z0-9]+$/.test(key) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !archive.series.records.some(
      (record) => record.utc.slice(0, 10) === date,
    ) ||
    !["HH", "HV"].includes(polarization)
  )
    throw new Error("Invalid numerical frame selection.");
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  const base = `reservoirs/${key}/`;
  const name = date.replaceAll("-", "");
  const bytes = async (path: string, expectedSize: number) => {
    const array = new Uint8Array(
      await (await request(base + path, signal)).arrayBuffer(),
    );
    if (array.length !== expectedSize)
      throw new Error(`Numerical asset has the wrong grid size: ${path}`);
    return array;
  };
  const display = archive.frames[date]?.[polarization];
  const analysis = archive.analysis?.frames[date];
  const [displayPixels, analysisPixels] = await Promise.all([
    display
      ? Promise.resolve(display)
      : bytes(
          `${name}_${polarization}.bin`,
          archive.meta.grid.width * archive.meta.grid.height,
        ),
    archive.meta.analysis && archive.analysis && !analysis
      ? bytes(
          `analysis/${name}_HH.bin`,
          archive.meta.analysis.grid.width * archive.meta.analysis.grid.height,
        )
      : Promise.resolve(analysis),
  ]);
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  archive.frames[date] = {
    ...archive.frames[date],
    [polarization]: displayPixels,
  };
  if (archive.analysis && analysisPixels)
    archive.analysis.frames[date] = analysisPixels;
  return archive;
}

/** Complete loading is retained for offline parity checks and explicit full exports. */
export async function loadNumericalArchive(
  key: string,
  dates: Acquisition[],
  signal: AbortSignal,
): Promise<NumericalArchive> {
  const archive = await loadNumericalMetadata(key, dates, signal);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(2, dates.length) }, async () => {
      while (cursor < dates.length) {
        const date = dates[cursor++].utc_date;
        // Sequence channels so their shared analysis file is requested only once.
        await loadNumericalFrame(key, archive, date, "HH", signal);
        await loadNumericalFrame(key, archive, date, "HV", signal);
      }
    }),
  );
  return archive;
}

/** Prepare a tour stop before its clock starts; only completed valid archives are cached. */
export async function preloadNumericalArchive(
  key: string,
  dates: Acquisition[],
  signal: AbortSignal,
): Promise<NumericalArchive> {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  const identity = archiveIdentity(key, dates);
  const cached = archiveCache.get(identity);
  if (cached) return cached;
  const archive = await loadNumericalArchive(key, dates, signal);
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  archiveCache.set(identity, archive);
  return archive;
}
export interface ArchiveLoadOptions {
  selectedDate: string;
  referenceDate: string;
  polarization: Polarization;
}
const progressiveCache = new Map<string, NumericalArchive>();
const snapshotArchive = (archive: NumericalArchive): NumericalArchive => ({
  ...archive,
  frames: { ...archive.frames },
  ...(archive.analysis
    ? {
        analysis: {
          ...archive.analysis,
          frames: { ...archive.analysis.frames },
        },
      }
    : {}),
});
/** Yield optional image work to browser idle time and cancel cleanly on navigation. */
export function waitForBackgroundIdle(
  signal: AbortSignal,
  minimumDelayMs = 0,
): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    let timer: number | null = null;
    let idle: number | null = null;
    const finish = (ready: boolean) => {
      if (timer !== null) window.clearTimeout(timer);
      if (idle !== null && typeof window.cancelIdleCallback === "function")
        window.cancelIdleCallback(idle);
      signal.removeEventListener("abort", abort);
      resolve(ready);
    };
    const abort = () => finish(false);
    const schedule = () => {
      timer = null;
      if (signal.aborted) {
        finish(false);
        return;
      }
      if (typeof window.requestIdleCallback === "function")
        idle = window.requestIdleCallback(() => finish(true), {
          timeout: 2000,
        });
      else timer = window.setTimeout(() => finish(!signal.aborted), 50);
    };
    signal.addEventListener("abort", abort, { once: true });
    if (minimumDelayMs > 0) timer = window.setTimeout(schedule, minimumDelayMs);
    else schedule();
  });
}
export function useNumericalArchive(
  enabled: boolean,
  key: string,
  dates: Acquisition[],
  options?: ArchiveLoadOptions,
) {
  const identity = archiveIdentity(key, dates);
  const selectedDate = options?.selectedDate ?? dates[0]?.utc_date;
  const referenceDate = options?.referenceDate ?? dates[0]?.utc_date;
  const polarization = options?.polarization ?? "HH";
  const [result, setResult] = useState<{
    identity: string;
    archive: NumericalArchive;
  } | null>(null);
  const [failure, setFailure] = useState<{
    identity: string;
    message: string;
  } | null>(null);
  const [frameFailures, setFrameFailures] = useState<{
    identity: string;
    values: Record<string, string>;
  }>({ identity: "", values: {} });
  const [retry, setRetry] = useState(0);
  const [frameRetry, setFrameRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setFailure(null);
    if (!enabled) return () => controller.abort();
    const cached = progressiveCache.get(identity) ?? archiveCache.get(identity);
    if (cached) {
      progressiveCache.set(identity, cached);
      setResult({ identity, archive: snapshotArchive(cached) });
      return () => controller.abort();
    }
    void loadNumericalMetadata(key, dates, controller.signal)
      .then((archive) => {
        if (controller.signal.aborted) return;
        progressiveCache.set(identity, archive);
        setResult({ identity, archive: snapshotArchive(archive) });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setFailure({
            identity,
            message:
              cause instanceof Error
                ? cause.message
                : "Numerical metadata could not be loaded.",
          });
      });
    return () => controller.abort();
  }, [enabled, identity, key, dates, retry]);
  const readyIdentity = result?.identity;
  useEffect(() => {
    if (!enabled || readyIdentity !== identity) return;
    const cachedBase = progressiveCache.get(identity);
    if (!cachedBase) return;
    const base: NumericalArchive = cachedBase;
    const controller = new AbortController();
    const publish = () => {
      if (!controller.signal.aborted)
        setResult({ identity, archive: snapshotArchive(base) });
    };
    const load = async (date: string, pol: Polarization) => {
      if (controller.signal.aborted) return;
      const errorKey = `${date}:${pol}`;
      if (
        base.frames[date]?.[pol] &&
        (!base.analysis || base.analysis.frames[date])
      )
        return;
      try {
        await loadNumericalFrame(key, base, date, pol, controller.signal);
        if (controller.signal.aborted) return;
        setFrameFailures((previous) => {
          const values =
            previous.identity === identity ? { ...previous.values } : {};
          delete values[errorKey];
          return { identity, values };
        });
        publish();
      } catch (cause) {
        if (!controller.signal.aborted)
          setFrameFailures((previous) => ({
            identity,
            values: {
              ...(previous.identity === identity ? previous.values : {}),
              [errorKey]:
                cause instanceof Error
                  ? cause.message
                  : "Image could not be loaded.",
            },
          }));
      }
    };
    async function prepare() {
      const priority = [...new Set([selectedDate, referenceDate])];
      await Promise.all(priority.map((date) => load(date, polarization)));
      if (controller.signal.aborted) return;
      // Allow the first pair to paint before neighboring images use the connection.
      if (!(await waitForBackgroundIdle(controller.signal, 350))) return;
      const selectedIndex = dates.findIndex(
        (date) => date.utc_date === selectedDate,
      );
      const neighbors = [
        dates[selectedIndex - 1],
        dates[selectedIndex + 1],
      ].filter((date) => date !== undefined);
      await Promise.all(neighbors.map((date) => load(date.utc_date, "HH")));
      if (!(await waitForBackgroundIdle(controller.signal, 1500))) return;
      // Background work is bounded and cancellable; HV is never prefetched.
      for (const date of dates) {
        if (controller.signal.aborted) return;
        if (
          base.frames[date.utc_date]?.HH &&
          (!base.analysis || base.analysis.frames[date.utc_date])
        )
          continue;
        if (!(await waitForBackgroundIdle(controller.signal))) return;
        await load(date.utc_date, "HH");
      }
    }
    void prepare();
    return () => controller.abort();
  }, [
    enabled,
    identity,
    readyIdentity,
    key,
    dates,
    selectedDate,
    referenceDate,
    polarization,
    frameRetry,
  ]);
  const archive =
    enabled && result?.identity === identity ? result.archive : null;
  return {
    archive,
    error: enabled && failure?.identity === identity ? failure.message : "",
    loading:
      enabled &&
      (!archive ||
        !archive.frames[selectedDate]?.[polarization] ||
        !archive.frames[referenceDate]?.[polarization]),
    frameErrors:
      frameFailures.identity === identity ? frameFailures.values : {},
    analysisComplete:
      !!archive?.analysis &&
      dates.every((date) => !!archive.analysis?.frames[date.utc_date]),
    retryFrame: (_date: string, _pol: Polarization) =>
      setFrameRetry((value) => value + 1),
    retry: () => {
      progressiveCache.delete(identity);
      archiveCache.delete(identity);
      setResult(null);
      setFrameFailures({ identity, values: {} });
      setRetry((value) => value + 1);
    },
  };
}

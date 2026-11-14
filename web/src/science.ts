import type { CorrelationSummary } from "./numerical";

export interface EffectSize {
  n: number;
  area_range_km2: number;
  mean_sensitivity_width_km2: number;
  range_to_sensitivity_ratio: number | null;
  minimum_ratio: number;
  passes: boolean;
  level_range_m: number | null;
}
export interface FullStorageRepeatability {
  n: number;
  threshold_pct: number;
  mean_km2: number | null;
  std_km2: number | null;
  range_km2: number | null;
  std_ddof: number;
}
export interface PolarizationComparison {
  reference_utc: string;
  selected_utc: string;
  channels: Record<
    "HH" | "HV",
    {
      change_pct: number | null;
      all: CorrelationSummary;
      without_flagged: CorrelationSummary;
      flagged_dates: string[];
    }
  >;
}
export interface VolumeClosure {
  eligible: boolean;
  available: boolean;
  reason: string;
  start_utc: string | null;
  end_utc: string | null;
  n: number;
  level_span_m: number | null;
  radar_million_m3: number | null;
  radar_low_million_m3: number | null;
  radar_high_million_m3: number | null;
  official_million_m3: number | null;
  ratio: number | null;
  source: string | null;
  retrieved_at: string | null;
  notes: string[];
}
export interface ThresholdSensitivity {
  analysis_grid_m: number;
  channel: string;
  definitions: {
    id: string;
    offset_db: number | null;
    statistics: Pick<
      CorrelationSummary,
      "n" | "pearson_area_vs_level" | "spearman_area_vs_level"
    >;
    records: {
      utc: string;
      area_km2: number | null;
      threshold_db: number | null;
    }[];
  }[];
}
export interface ScientificStats {
  review_version?: string;
  effect_size?: EffectSize;
  full_storage_repeatability?: FullStorageRepeatability;
  polarization_comparison?: PolarizationComparison;
  volume_closure?: VolumeClosure;
  threshold_sensitivity?: ThresholdSensitivity;
}

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const number = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const optionalNumber = (value: unknown) => value === null || number(value);
const interval = (value: unknown) =>
  value === null ||
  (Array.isArray(value) && value.length === 2 && value.every(number));
function isCorrelation(value: unknown): value is CorrelationSummary {
  return (
    object(value) &&
    number(value.n) &&
    optionalNumber(value.pearson_area_vs_level) &&
    optionalNumber(value.spearman_area_vs_level) &&
    interval(value.pearson_ci95) &&
    interval(value.spearman_ci95)
  );
}

/** Optional review evidence never makes the base observation archive unusable. */
export function readScientificStats(value: unknown): ScientificStats {
  if (!object(value)) return {};
  const result: ScientificStats = {};
  if (typeof value.review_version === "string")
    result.review_version = value.review_version;
  const effect = value.effect_size;
  if (
    object(effect) &&
    number(effect.area_range_km2) &&
    number(effect.mean_sensitivity_width_km2) &&
    optionalNumber(effect.range_to_sensitivity_ratio) &&
    typeof effect.passes === "boolean" &&
    optionalNumber(effect.level_range_m)
  )
    result.effect_size = effect as unknown as EffectSize;
  const repeatability = value.full_storage_repeatability;
  if (
    object(repeatability) &&
    number(repeatability.n) &&
    optionalNumber(repeatability.std_km2) &&
    optionalNumber(repeatability.range_km2)
  )
    result.full_storage_repeatability =
      repeatability as unknown as FullStorageRepeatability;
  const polarization = value.polarization_comparison;
  if (
    object(polarization) &&
    typeof polarization.reference_utc === "string" &&
    typeof polarization.selected_utc === "string" &&
    object(polarization.channels) &&
    ["HH", "HV"].every((key) => {
      const channel = (polarization.channels as Record<string, unknown>)[key];
      return (
        object(channel) &&
        optionalNumber(channel.change_pct) &&
        isCorrelation(channel.all) &&
        isCorrelation(channel.without_flagged) &&
        Array.isArray(channel.flagged_dates) &&
        channel.flagged_dates.every((date) => typeof date === "string")
      );
    })
  )
    result.polarization_comparison =
      polarization as unknown as PolarizationComparison;
  const volume = value.volume_closure;
  if (
    object(volume) &&
    typeof volume.eligible === "boolean" &&
    typeof volume.available === "boolean" &&
    number(volume.n) &&
    optionalNumber(volume.radar_million_m3) &&
    optionalNumber(volume.radar_low_million_m3) &&
    optionalNumber(volume.radar_high_million_m3) &&
    optionalNumber(volume.official_million_m3) &&
    optionalNumber(volume.ratio)
  )
    result.volume_closure = volume as unknown as VolumeClosure;
  const thresholds = value.threshold_sensitivity;
  if (
    object(thresholds) &&
    number(thresholds.analysis_grid_m) &&
    Array.isArray(thresholds.definitions) &&
    thresholds.definitions.every(
      (definition) =>
        object(definition) &&
        typeof definition.id === "string" &&
        object(definition.statistics) &&
        number(definition.statistics.n) &&
        optionalNumber(definition.statistics.pearson_area_vs_level) &&
        optionalNumber(definition.statistics.spearman_area_vs_level) &&
        Array.isArray(definition.records) &&
        definition.records.every(
          (record) =>
            object(record) &&
            typeof record.utc === "string" &&
            optionalNumber(record.area_km2) &&
            optionalNumber(record.threshold_db),
        ),
    )
  )
    result.threshold_sensitivity =
      thresholds as unknown as ThresholdSensitivity;
  return result;
}

export interface NumericAxis {
  minimum: number;
  maximum: number;
  ticks: number[];
  decimals: number;
}
/** A padded data domain with at most three readable horizontal grid lines. */
export function niceAxis(values: number[], padding = 0.08): NumericAxis {
  const finite = values.filter(Number.isFinite);
  if (!finite.length)
    return { minimum: 0, maximum: 1, ticks: [0, 0.5, 1], decimals: 1 };
  const min = Math.min(...finite),
    max = Math.max(...finite);
  const span = max - min || Math.max(Math.abs(min) * 0.05, 0.1);
  const minimum = min - span * padding,
    maximum = max + span * padding;
  const rough = (maximum - minimum) / 2;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const candidates = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10].map((factor) => {
    const step = factor * magnitude;
    const count =
      Math.floor((maximum + step * 1e-9) / step) -
      Math.ceil(minimum / step) +
      1;
    return { step, count };
  });
  const step =
    candidates
      .filter((candidate) => candidate.count >= 2 && candidate.count <= 3)
      .sort((a, b) => Math.abs(a.step - rough) - Math.abs(b.step - rough))[0]
      ?.step ?? rough;
  let decimals = 0;
  while (
    decimals < 6 &&
    Math.abs(step * 10 ** decimals - Math.round(step * 10 ** decimals)) > 1e-8
  )
    decimals++;
  const ticks: number[] = [];
  for (
    let tick = Math.ceil(minimum / step) * step;
    tick <= maximum + step * 1e-9 && ticks.length < 3;
    tick += step
  )
    ticks.push(Number(tick.toFixed(decimals)));
  return { minimum, maximum, ticks, decimals };
}

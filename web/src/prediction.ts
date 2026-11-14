import type { AreaObservation } from "./numerical";

export interface StoragePrediction {
  training: AreaObservation[];
  slope: number;
  intercept: number;
  areaRange: [number, number];
  storageSpan: number;
  points: {
    utc: string;
    local: string;
    predicted: number;
    actual: number | null;
    training: boolean;
    extrapolated: boolean;
  }[];
  evaluation: { n: number; mae: number | null; rmse: number | null };
}

/** Fit only the earliest N pairs. Later official observations never enter the fit. */
export function fitStoragePrediction(
  records: AreaObservation[],
  count: number,
): StoragePrediction | null {
  const ordered = [...records]
    .filter((r) => Number.isFinite(r.area_km2.primary))
    .sort((a, b) => a.utc.localeCompare(b.utc));
  const pairs = ordered.filter(
    (r) => r.official.pct != null && Number.isFinite(r.official.pct),
  );
  if (!Number.isInteger(count) || count < 3 || count > pairs.length - 3)
    return null;
  const training = pairs.slice(0, count);
  const meanX = training.reduce((s, r) => s + r.area_km2.primary, 0) / count;
  const meanY = training.reduce((s, r) => s + r.official.pct!, 0) / count;
  const variance = training.reduce(
    (s, r) => s + (r.area_km2.primary - meanX) ** 2,
    0,
  );
  if (variance < 1e-12) return null;
  const slope =
    training.reduce(
      (s, r) => s + (r.area_km2.primary - meanX) * (r.official.pct! - meanY),
      0,
    ) / variance;
  const intercept = meanY - slope * meanX;
  const areaRange: [number, number] = [
    Math.min(...training.map((r) => r.area_km2.primary)),
    Math.max(...training.map((r) => r.area_km2.primary)),
  ];
  const cutoff = training.at(-1)!.utc;
  const points = ordered.map((r) => ({
    utc: r.utc,
    local: r.local,
    predicted: intercept + slope * r.area_km2.primary,
    actual:
      r.official.pct != null && Number.isFinite(r.official.pct)
        ? r.official.pct
        : null,
    training: r.utc <= cutoff,
    extrapolated:
      r.area_km2.primary < areaRange[0] || r.area_km2.primary > areaRange[1],
  }));
  const errors = points
    .filter((p) => !p.training && p.actual != null)
    .map((p) => p.predicted - p.actual!);
  return {
    training,
    slope,
    intercept,
    areaRange,
    storageSpan:
      Math.max(...training.map((r) => r.official.pct!)) -
      Math.min(...training.map((r) => r.official.pct!)),
    points,
    evaluation: {
      n: errors.length,
      mae: errors.length
        ? errors.reduce((s, e) => s + Math.abs(e), 0) / errors.length
        : null,
      rmse: errors.length
        ? Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length)
        : null,
    },
  };
}

/** Connect only nearby acquisitions, never bridge the long radar-product gap. */
export function predictionSegments(
  points: StoragePrediction["points"],
): StoragePrediction["points"][] {
  const segments: StoragePrediction["points"][] = [];
  for (const point of points) {
    const last = segments.at(-1)?.at(-1);
    if (!last || Date.parse(point.utc) - Date.parse(last.utc) > 36 * 86400000)
      segments.push([]);
    segments.at(-1)!.push(point);
  }
  return segments;
}

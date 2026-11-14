import type { Language } from "../i18n";
import type { ReservoirEstimation } from "../storageEstimationTypes";

export interface TwoStageLayerProps {
  report: ReservoirEstimation;
  x: (date: string) => number;
  y: (percentage: number) => number;
  left: number;
  right: number;
  lang: Language;
}

/** Refuse incomplete evaluation or numeric values for an unresolved class. */
export function canRenderTwoStage(report: ReservoirEstimation): boolean {
  const evaluation = report.evaluation;
  if (
    report.grade !== "A" ||
    !report.eligible ||
    !report.full_pool ||
    report.full_pool.n < 3 ||
    !evaluation ||
    evaluation.high.n < 1 ||
    evaluation.numeric.n < 1 ||
    evaluation.numeric.folds.length !== evaluation.numeric.n ||
    !Number.isFinite(evaluation.numeric.mae_pp) ||
    !Number.isFinite(evaluation.numeric.max_abs_error_pp) ||
    !report.points.length
  )
    return false;
  return report.points.every((point) => {
    if (
      !Number.isFinite(Date.parse(point.utc)) ||
      !Number.isFinite(Date.parse(point.local))
    )
      return false;
    if (point.kind === "high")
      return (
        point.estimate_pct === null &&
        point.raw_estimate_pct === null &&
        point.high_lower_pct !== null &&
        Number.isFinite(point.high_lower_pct) &&
        point.high_lower_pct >= 0 &&
        point.high_lower_pct <= 100
      );
    return (
      point.kind === "numeric" &&
      point.estimate_pct !== null &&
      Number.isFinite(point.estimate_pct) &&
      point.estimate_pct >= 0 &&
      point.estimate_pct <= 100 &&
      point.range_pct !== null &&
      point.range_pct.every(Number.isFinite) &&
      point.range_pct[0] >= 0 &&
      point.range_pct[0] <= point.estimate_pct &&
      point.range_pct[1] >= point.estimate_pct &&
      point.range_pct[1] <= 100
    );
  });
}

export default function TwoStagePredictionLayer({
  report,
  x,
  y,
  left,
  right,
  lang,
}: TwoStageLayerProps) {
  if (!canRenderTwoStage(report)) return null;
  const en = lang === "en";
  const color = "var(--prediction, #bf5814)";
  return (
    <g
      className="two-stage-prediction"
      aria-label={
        en ? "Two-stage SAR storage estimates" : "兩段式 SAR 蓄水率估計"
      }
    >
      {report.points.map((point) => {
        const px = x(point.local.slice(0, 10));
        if (!Number.isFinite(px) || px < left || px > right) return null;
        const day = point.local.slice(0, 10);
        const quality = point.qa.length
          ? ` · † ${en ? "Quality flag" : "品質旗標"}: ${point.qa.join(", ")}`
          : "";
        if (point.kind === "high") {
          const lower = point.high_lower_pct!;
          const label = `${day}: ${en ? "High; finer levels unresolved" : "偏高，分不出更細"} · ${en ? "Observed class range" : "此類觀測範圍"} ${lower.toFixed(1)}–100.0%${quality}`;
          // Each glyph refers only to its acquisition, never to intervening days.
          const bandLeft = Math.max(left, px - 4);
          return (
            <rect
              key={point.utc}
              className="storage-high-band"
              x={bandLeft}
              y={y(100)}
              width={Math.min(right, px + 4) - bandLeft}
              height={Math.max(0, y(lower) - y(100))}
              fill={color}
              fillOpacity="0.18"
              stroke={color}
              strokeOpacity="0.4"
              role="img"
              aria-label={label}
            >
              <title>{label}</title>
            </rect>
          );
        }
        const estimate = point.estimate_pct!;
        const [minimum, maximum] = point.range_pct!;
        const label = `${day}: ${en ? "SAR estimate" : "SAR 估計"} ${estimate.toFixed(1)}% · ${point.calibration ? (en ? "Calibration point" : "校正點") : en ? "Historical application" : "歷史套用估計"}${point.extrapolated ? (en ? " · Extrapolation" : " · 外插") : ""} · ${en ? "Descriptive range" : "描述性範圍"} ${minimum.toFixed(1)}–${maximum.toFixed(1)}% (${en ? "± largest leave-one-out absolute error; not a confidence interval" : "±逐一留出最大絕對誤差；非信賴區間"})${point.clamped ? (en ? " · Limited to 0–100%" : " · 限制於 0–100%") : ""}${quality}`;
        return (
          <g key={point.utc} role="img" aria-label={label}>
            <title>{label}</title>
            <line
              className="storage-estimate-range"
              x1={px}
              x2={px}
              y1={y(minimum)}
              y2={y(maximum)}
              stroke={color}
              strokeWidth="2"
              strokeDasharray={point.extrapolated ? "3 2" : undefined}
            />
            {[minimum, maximum].map((edge, i) => (
              <line
                key={i}
                x1={px - 3}
                x2={px + 3}
                y1={y(edge)}
                y2={y(edge)}
                stroke={color}
              />
            ))}
            <rect
              className="storage-estimate-point"
              x={px - 3.5}
              y={y(estimate) - 3.5}
              width="7"
              height="7"
              fill={point.calibration ? "var(--bg, #fff)" : color}
              stroke={color}
              strokeWidth="2"
            />
            {point.extrapolated && (
              <text x={px + 6} y={y(estimate) + 4} fill={color} fontSize="12">
                {en ? "E" : "外"}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

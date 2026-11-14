import type { Language } from "./i18n";
import type {
  AreaObservation,
  AreaSeries,
  NumericMeta,
  ValidationGrade,
} from "./numerical";

export interface ReservoirSummary {
  key: string;
  meta: NumericMeta;
  series: AreaSeries;
}

export function gradeDescription(
  grade: ValidationGrade | undefined,
  lang: Language,
): string {
  const en = lang === "en";
  if (grade === "A")
    return en ? "Radar area follows water level" : "雷達面積跟得上水位";
  if (grade === "B")
    return en
      ? "Consistent direction; change below method sensitivity"
      : "方向一致，變化量小於方法敏感度";
  if (grade === "C")
    return en ? "The change is unresolved here" : "這裡的變化雷達分辨不出來";
  return en ? "Loading observations" : "正在載入觀測";
}

export function relativeChange(
  current: number | null | undefined,
  reference: number | null | undefined,
): number | null {
  return current != null &&
    reference != null &&
    Number.isFinite(current) &&
    Number.isFinite(reference) &&
    reference !== 0
    ? (current / reference - 1) * 100
    : null;
}

export function signed(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value < 0 ? "−" : value > 0 ? "+" : ""}${Math.abs(value).toFixed(digits)}`;
}

export function observationAt(
  series: AreaSeries | undefined,
  date: string,
): AreaObservation | undefined {
  return series?.records.find((record) => record.utc.slice(0, 10) === date);
}

export function lowestObservation(
  series: AreaSeries,
): AreaObservation | undefined {
  return series.records
    .filter((record) => record.official.pct != null)
    .reduce<
      AreaObservation | undefined
    >((best, record) => (!best || record.official.pct! < best.official.pct! ? record : best), undefined);
}

/** Separate tracks at missing acquisitions rather than drawing an invented observation. */
export function sparklinePath(
  records: AreaObservation[],
  width = 56,
  height = 20,
): string {
  const valid = records.filter((record) => record.official.pct != null);
  if (valid.length < 2) return "";
  const first = Date.parse(records[0].utc),
    last = Date.parse(records.at(-1)!.utc);
  if (last <= first) return "";
  let previous: number | null = null;
  return records
    .map((record) => {
      if (record.official.pct == null) {
        previous = null;
        return "";
      }
      const instant = Date.parse(record.utc);
      const start = previous == null || instant - previous > 18 * 86400000;
      previous = instant;
      return `${start ? "M" : "L"}${(((instant - first) / (last - first)) * width).toFixed(1)},${(2 + (1 - record.official.pct / 100) * (height - 4)).toFixed(1)}`;
    })
    .join(" ");
}

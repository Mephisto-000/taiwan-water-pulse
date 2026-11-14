import { useRef, type KeyboardEvent } from "react";
import { datePosition, type Acquisition, type OfficialRecord } from "../domain";
import type { Language } from "../i18n";
import { canPublishArea, type NumericalArchive } from "../numerical";

export interface AnalysisChartProps {
  archive?: NumericalArchive | null;
  records: OfficialRecord[];
  dates: Acquisition[];
  selected: Acquisition;
  onSelect: (index: number) => void;
  gap: { start: string; end: string };
  lang: Language;
  showArea?: boolean;
}

const chartText = { fontSize: 14, fill: "#374c4d" };
const chartTitle = { fontSize: 16, fontWeight: 600, fill: "#1f3f42" };
const localDate = (utc: string) =>
  new Date(Date.parse(utc) + 86400000).toISOString().slice(0, 10);
const dateLabel = (value: string, lang: Language) =>
  new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "zh-TW", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value.slice(0, 10) + "T12:00:00Z"));

function nextIndex(
  event: KeyboardEvent<SVGGElement>,
  index: number,
  count: number,
): number | null {
  if (event.key === "ArrowRight" || event.key === "ArrowDown")
    return Math.min(count - 1, index + 1);
  if (event.key === "ArrowLeft" || event.key === "ArrowUp")
    return Math.max(0, index - 1);
  if (event.key === "Home") return 0;
  if (event.key === "End") return count - 1;
  return null;
}

export default function AnalysisCharts({
  archive,
  records,
  dates,
  selected,
  onSelect,
  gap,
  lang,
  showArea = false,
}: AnalysisChartProps) {
  const pointRefs = useRef<(SVGGElement | null)[]>([]);
  const en = lang === "en";
  const publishArea = Boolean(showArea && archive && canPublishArea(archive));
  const width = 820;
  const height = publishArea ? 540 : 300;
  const left = 64;
  const right = 26;
  const plotWidth = width - left - right;
  const areaTop = 55;
  const plotHeight = 170;
  const gaugeTop = publishArea ? 315 : 55;
  const first = records[0]?.local_date ?? dates[0].local.slice(0, 10);
  const last = records.at(-1)?.local_date ?? dates.at(-1)!.local.slice(0, 10);
  const x = (date: string) =>
    left + (datePosition(date, first, last) / 100) * plotWidth;
  const maxArea =
    Math.max(
      0.1,
      ...(archive?.series.records.map((r) => r.area_km2.primary_hi) ?? []),
    ) * 1.1;
  const areaY = (area: number) => areaTop + (1 - area / maxArea) * plotHeight;
  const gaugeY = (pct: number) => gaugeTop + (1 - pct / 100) * plotHeight;
  const selectedIndex = Math.max(
    0,
    dates.findIndex((date) => date.utc_date === selected.utc_date),
  );
  const observations = new Map(
    archive?.series.records.map((r) => [r.utc.slice(0, 10), r]),
  );
  const gauges = new Map(
    records.filter((r) => r.nisar_utc_date).map((r) => [r.nisar_utc_date, r]),
  );
  const gaugePaths: string[] = [];
  let segment = "";
  for (const record of records) {
    if (record.pct === null) {
      if (segment) gaugePaths.push(segment);
      segment = "";
    } else {
      segment += `${segment ? "L" : "M"}${x(record.local_date)},${gaugeY(record.pct)} `;
    }
  }
  if (segment) gaugePaths.push(segment);
  const gapX = x(localDate(gap.start));
  const gapWidth = Math.max(0, x(localDate(gap.end)) - gapX);
  const selectedRecord = observations.get(selected.utc_date);
  const selectedGauge = gauges.get(selected.utc_date);
  const ticks = [
    first,
    "2026-01-01",
    "2026-03-01",
    "2026-05-01",
    "2026-07-01",
    "2026-09-01",
    last,
  ].filter(
    (date, index, values) =>
      date >= first && date <= last && values.indexOf(date) === index,
  );
  return (
    <div className="analysis-charts">
      {publishArea && archive && (
        <StatisticsSummary archive={archive} lang={lang} />
      )}
      <div className="chart-scroll" style={{ overflowX: "auto" }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ display: "block", width: "100%", minWidth: 720 }}
          role="group"
          aria-label={
            en
              ? "Radar area and official storage on a shared time axis. Arrow keys select observations."
              : "雷達面積與官方蓄水率，共用時間軸。方向鍵可選擇觀測。"
          }
        >
          <text x={left} y={gaugeTop - 20} style={chartTitle}>
            {en ? "Official storage (%)" : "官方蓄水率（%）"}
          </text>
          {publishArea && (
            <text x={left} y={areaTop - 20} style={chartTitle}>
              {en
                ? "Experimental radar water area (km²)"
                : "實驗性雷達水面積（km²）"}
            </text>
          )}
          {[...(publishArea ? [areaTop] : []), gaugeTop].map((top) => (
            <g key={top}>
              <rect
                x={gapX}
                y={top}
                width={gapWidth}
                height={plotHeight}
                fill="#e7ece9"
              />
              <line
                x1={gapX}
                x2={gapX + gapWidth}
                y1={top + 1}
                y2={top + 1}
                stroke="#829692"
                strokeDasharray="4 4"
              />
              <text
                x={gapX + gapWidth / 2}
                y={top + 20}
                textAnchor="middle"
                style={chartText}
              >
                {en ? "No radar observations" : "無雷達觀測"}
              </text>
              <line
                x1={x(selected.local.slice(0, 10))}
                x2={x(selected.local.slice(0, 10))}
                y1={top}
                y2={top + plotHeight}
                stroke="#1b6067"
                strokeDasharray="4 5"
              />
            </g>
          ))}
          {[0, 25, 50, 75, 100].map((tick) => (
            <g key={`gauge-${tick}`}>
              <line
                x1={left}
                x2={width - right}
                y1={gaugeY(tick)}
                y2={gaugeY(tick)}
                stroke="#cdd8d4"
                strokeDasharray="3 5"
              />
              <text
                x={left - 12}
                y={gaugeY(tick) + 5}
                textAnchor="end"
                style={chartText}
              >
                {tick}
              </text>
            </g>
          ))}
          {publishArea &&
            [0, 0.25, 0.5, 0.75, 1].map((fraction) => (
              <g key={`area-${fraction}`}>
                <line
                  x1={left}
                  x2={width - right}
                  y1={areaY(maxArea * fraction)}
                  y2={areaY(maxArea * fraction)}
                  stroke="#cdd8d4"
                  strokeDasharray="3 5"
                />
                <text
                  x={left - 12}
                  y={areaY(maxArea * fraction) + 5}
                  textAnchor="end"
                  style={chartText}
                >
                  {(maxArea * fraction).toFixed(1)}
                </text>
              </g>
            ))}
          {gaugePaths.map((path, index) => (
            <path
              key={index}
              d={path}
              fill="none"
              stroke="#286c72"
              strokeWidth="2.5"
            />
          ))}
          {dates.map((date, index) => {
            const record = observations.get(date.utc_date);
            const gauge = gauges.get(date.utc_date);
            const position = x(date.local.slice(0, 10));
            const active = index === selectedIndex;
            const areaLabel =
              publishArea && record
                ? ` · ${record.area_km2.primary.toFixed(3)} km² (${record.area_km2.primary_lo.toFixed(3)}–${record.area_km2.primary_hi.toFixed(3)})`
                : "";
            const label = `${date.utc_date} UTC${areaLabel} · ${en ? "storage" : "蓄水率"} ${gauge?.pct?.toFixed(1) ?? "—"}%${record?.qa.length ? ` · QA: ${record.qa.join(", ")}` : ""}`;
            return (
              <g
                key={date.utc_date}
                ref={(element) => {
                  pointRefs.current[index] = element;
                }}
                role="button"
                tabIndex={active ? 0 : -1}
                aria-label={label}
                aria-pressed={active}
                className="analysis-point"
                onClick={() => onSelect(index)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(index);
                    return;
                  }
                  const next = nextIndex(event, index, dates.length);
                  if (next === null) return;
                  event.preventDefault();
                  onSelect(next);
                  pointRefs.current[next]?.focus({ preventScroll: true });
                }}
              >
                <title>{label}</title>
                {publishArea && record && (
                  <>
                    <line
                      x1={position}
                      x2={position}
                      y1={areaY(record.area_km2.primary_lo)}
                      y2={areaY(record.area_km2.primary_hi)}
                      stroke="#2b6e98"
                      strokeWidth="2"
                    />
                    {[
                      record.area_km2.primary_lo,
                      record.area_km2.primary_hi,
                    ].map((area, i) => (
                      <line
                        key={i}
                        x1={position - 4}
                        x2={position + 4}
                        y1={areaY(area)}
                        y2={areaY(area)}
                        stroke="#2b6e98"
                        strokeWidth="2"
                      />
                    ))}
                    <circle
                      cx={position}
                      cy={areaY(record.area_km2.primary)}
                      r={14}
                      fill="transparent"
                    />
                    <circle
                      cx={position}
                      cy={areaY(record.area_km2.primary)}
                      r={active ? 6 : 4}
                      fill="#326f94"
                      stroke="#fff"
                      strokeWidth="1.5"
                    />
                    {record.qa.length > 0 && (
                      <text
                        x={position}
                        y={areaY(record.area_km2.primary_hi) - 8}
                        textAnchor="middle"
                        style={chartText}
                      >
                        †
                      </text>
                    )}
                  </>
                )}
                {gauge?.pct !== null && gauge?.pct !== undefined && (
                  <>
                    <circle
                      cx={position}
                      cy={gaugeY(gauge.pct)}
                      r={14}
                      fill="transparent"
                    />
                    <circle
                      cx={position}
                      cy={gaugeY(gauge.pct)}
                      r={active ? 6 : 4}
                      fill={active ? "#194f56" : "#fff"}
                      stroke="#286c72"
                      strokeWidth="2"
                    />
                  </>
                )}
              </g>
            );
          })}
          {ticks.map((date, i) => (
            <text
              key={date}
              x={x(date)}
              y={height - 24}
              textAnchor={
                i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"
              }
              style={chartText}
            >
              {dateLabel(date, lang)}
            </text>
          ))}
        </svg>
      </div>
      <p className="chart-selection" aria-live="polite">
        <strong>{selected.utc_date} UTC</strong> ·{" "}
        {en ? "Official storage" : "官方蓄水率"}{" "}
        {selectedGauge?.pct?.toFixed(1) ?? "—"}%
        {publishArea && selectedRecord && (
          <>
            {" "}
            · {en ? "Area" : "面積"}{" "}
            {selectedRecord.area_km2.primary.toFixed(3)} km² (
            {selectedRecord.area_km2.primary_lo.toFixed(3)}–
            {selectedRecord.area_km2.primary_hi.toFixed(3)}) · T ={" "}
            {selectedRecord.threshold_db?.toFixed(2) ?? "—"} dB
          </>
        )}
      </p>
      <p className="chart-note">
        {en
          ? "Dates on the axis are Taiwan local dates (UTC+8). Shading marks the radar observation gap; official observations continue. Missing official records are not interpolated."
          : "橫軸為台灣日期（UTC+8）。陰影標示雷達觀測缺口，官方觀測仍持續；官方缺值不內插。"}
      </p>
      {publishArea && (
        <p className="chart-note">
          {en
            ? `Points use a fixed image-only ratio to each date's land-ring median. Bars show the ${Math.round((archive?.meta.analysis?.sensitivity_ratios[0] ?? 0.5) * 100)}–${Math.round((archive?.meta.analysis?.sensitivity_ratios[1] ?? 0.7) * 100)}% ratio sensitivity range, not confidence intervals. † denotes a QA flag.`
            : `點使用當日陸地環帶中位數的固定比值門檻。垂直線為比值 ${Math.round((archive?.meta.analysis?.sensitivity_ratios[0] ?? 0.5) * 100)}–${Math.round((archive?.meta.analysis?.sensitivity_ratios[1] ?? 0.7) * 100)}% 的敏感度範圍，並非信賴區間。† 表示品質旗標。`}
        </p>
      )}
    </div>
  );
}

export function StatisticsSummary({
  archive,
  lang,
}: {
  archive: NumericalArchive;
  lang: Language;
}) {
  const validation = archive.meta.validation;
  const analysis = archive.meta.analysis;
  if (!validation || !analysis) return null;
  const en = lang === "en";
  const number = (value: number | null) =>
    value === null ? "—" : value.toFixed(2);
  const interval = (value: [number, number] | null) =>
    value ? `${number(value[0])}–${number(value[1])}` : "—";
  return (
    <div className="statistics-summary">
      <strong>
        {en ? "Grade" : "等級"} {validation.grade} ·{" "}
        {en ? "experimental" : "實驗性"}
      </strong>
      <span>
        Pearson r = {number(validation.pearson_area_vs_level)} (95% CI{" "}
        {interval(validation.pearson_ci95)})
      </span>
      <span>
        Spearman ρ = {number(validation.spearman_area_vs_level)} (95% CI{" "}
        {interval(validation.spearman_ci95)})
      </span>
      <span>
        n = {validation.n} · {analysis.grid.pixel_side_m} m{" "}
        {en ? "analysis grid" : "分析格網"} · HH &lt;{" "}
        {Math.round(analysis.threshold_ratio * 100)}%{" "}
        {en ? "of the date's land-ring median power" : "當日陸地環帶功率中位數"}{" "}
        · {en ? "sensitivity" : "敏感度"}{" "}
        {Math.round(analysis.sensitivity_ratios[0] * 100)}–
        {Math.round(analysis.sensitivity_ratios[1] * 100)}%
      </span>
    </div>
  );
}

export function ScatterPlot({
  archive,
  dates,
  selected,
  onSelect,
  gap,
  lang,
  showArea = false,
}: Omit<AnalysisChartProps, "records" | "archive"> & {
  archive: NumericalArchive;
}) {
  const refs = useRef<(SVGGElement | null)[]>([]);
  const en = lang === "en";
  const eligible = archive.series.records.filter(
    (record) => record.official.level_m !== null,
  );
  if (!showArea || !canPublishArea(archive) || !eligible.length) return null;
  const width = 720,
    height = 380,
    left = 80,
    right = 28,
    top = 42,
    bottom = 70;
  const minimum = Math.min(...eligible.map((r) => r.official.level_m!));
  const maximum = Math.max(...eligible.map((r) => r.official.level_m!));
  const margin = Math.max((maximum - minimum) * 0.06, 0.1);
  const low = minimum - margin,
    high = maximum + margin;
  const maxArea =
    Math.max(...eligible.map((r) => r.area_km2.primary_hi), 0.1) * 1.1;
  const x = (level: number) =>
    left + ((level - low) / (high - low)) * (width - left - right);
  const y = (area: number) =>
    top + (1 - area / maxArea) * (height - top - bottom);
  const selectedPoint = Math.max(
    0,
    eligible.findIndex((r) => r.utc.slice(0, 10) === selected.utc_date),
  );
  return (
    <div className="scatter-plot">
      <StatisticsSummary archive={archive} lang={lang} />
      <div className="chart-scroll" style={{ overflowX: "auto" }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ display: "block", width: "100%", minWidth: 640 }}
          role="group"
          aria-label={
            en
              ? "Radar area versus official water level. Circles precede the gap; squares follow it."
              : "雷達面積對官方水位散布圖。圓形為缺口前，方形為缺口後。"
          }
        >
          <text x={left} y={24} style={chartTitle}>
            {en ? "Experimental radar area (km²)" : "實驗性雷達面積（km²）"}
          </text>
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
            <g key={fraction}>
              <line
                x1={left}
                x2={width - right}
                y1={y(maxArea * fraction)}
                y2={y(maxArea * fraction)}
                stroke="#cdd8d4"
                strokeDasharray="3 5"
              />
              <text
                x={left - 12}
                y={y(maxArea * fraction) + 5}
                textAnchor="end"
                style={chartText}
              >
                {(maxArea * fraction).toFixed(1)}
              </text>
              <text
                x={x(low + (high - low) * fraction)}
                y={height - bottom + 25}
                textAnchor="middle"
                style={chartText}
              >
                {(low + (high - low) * fraction).toFixed(1)}
              </text>
            </g>
          ))}
          {eligible.map((record, index) => {
            const after = record.utc.slice(0, 10) > gap.end;
            const cx = x(record.official.level_m!),
              cy = y(record.area_km2.primary);
            const active = record.utc.slice(0, 10) === selected.utc_date;
            const label = `${record.utc.slice(0, 10)} UTC · ${record.official.level_m?.toFixed(2)} m · ${record.area_km2.primary.toFixed(3)} km²`;
            return (
              <g
                key={record.utc}
                ref={(element) => {
                  refs.current[index] = element;
                }}
                role="button"
                tabIndex={index === selectedPoint ? 0 : -1}
                aria-label={label}
                aria-pressed={active}
                className="analysis-point"
                onClick={() =>
                  onSelect(dates.findIndex((d) => d.utc === record.utc))
                }
                onKeyDown={(event) => {
                  const next =
                    event.key === "Enter" || event.key === " "
                      ? index
                      : nextIndex(event, index, eligible.length);
                  if (next === null) return;
                  event.preventDefault();
                  onSelect(
                    dates.findIndex((d) => d.utc === eligible[next].utc),
                  );
                  refs.current[next]?.focus({ preventScroll: true });
                }}
              >
                <title>{label}</title>
                <line
                  x1={cx}
                  x2={cx}
                  y1={y(record.area_km2.primary_lo)}
                  y2={y(record.area_km2.primary_hi)}
                  stroke="#799cab"
                  strokeWidth="1.5"
                />
                <circle cx={cx} cy={cy} r={14} fill="transparent" />
                {after ? (
                  <rect
                    x={cx - 5}
                    y={cy - 5}
                    width={10}
                    height={10}
                    fill={active ? "#174a51" : "#fff"}
                    stroke="#275e7b"
                    strokeWidth={active ? 3 : 2}
                  />
                ) : (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={active ? 6 : 5}
                    fill="#326e94"
                    stroke={active ? "#152f3a" : "#fff"}
                    strokeWidth={active ? 2 : 1}
                  />
                )}
              </g>
            );
          })}
          <text
            x={(left + width - right) / 2}
            y={height - 16}
            textAnchor="middle"
            style={chartTitle}
          >
            {en ? "Official water level (m)" : "官方水位（m）"}
          </text>
        </svg>
      </div>
      <p className="chart-note">
        ● {en ? "Before the observation gap" : "觀測缺口前"} · □{" "}
        {en ? "After the gap" : "觀測缺口後"} ·{" "}
        {en
          ? "Hover or focus a point for its date; select to inspect the radar."
          : "滑過或聚焦資料點可查看日期，選擇後切換雷達影像。"}
      </p>
    </div>
  );
}

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { datePosition, type Acquisition, type OfficialRecord } from "../domain";
import type { Language } from "../i18n";
import { canPublishArea, type NumericalArchive } from "../numerical";
import { niceAxis } from "../science";
import { relativeChange, signed } from "../workspace";

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
const ink = "var(--ink, #18181a)",
  muted = "var(--muted, #6b6b70)",
  data = "var(--data, #2f6fed)",
  line = "var(--line, #e5e5e5)",
  bg = "var(--bg, #ffffff)";
const chartText = { fontSize: 12, fill: muted };
const chartTitle = { fontSize: 13, fontWeight: 600, fill: ink };
const dateLabel = (value: string, lang: Language) =>
  new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "zh-TW", {
    month: "short",
    day: "numeric",
    timeZone: "Asia/Taipei",
  }).format(new Date(value.length === 10 ? `${value}T12:00:00+08:00` : value));
function useChartWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const resize = () => {
      if (element.clientWidth > 0) setWidth(Math.max(280, element.clientWidth));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}
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
function tickDates(first: string, last: string, count: number): string[] {
  const start = Date.parse(first),
    end = Date.parse(last);
  return Array.from({ length: count }, (_, i) =>
    new Date(start + ((end - start) * i) / (count - 1))
      .toISOString()
      .slice(0, 10),
  );
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
  const { ref, width } = useChartWidth();
  const en = lang === "en",
    publishArea = Boolean(showArea && archive && canPublishArea(archive));
  const left = 54,
    right = 18,
    areaTop = 46,
    plotHeight = 150,
    gaugeTop = publishArea ? 268 : 46,
    height = gaugeTop + plotHeight + 48;
  const first = records[0]?.local_date ?? dates[0].local.slice(0, 10),
    last = records.at(-1)?.local_date ?? dates.at(-1)!.local.slice(0, 10);
  const x = (date: string) =>
    left + (datePosition(date, first, last) / 100) * (width - left - right);
  const axis = niceAxis(
    archive?.series.records.flatMap((record) => [
      record.area_km2.primary_lo,
      record.area_km2.primary_hi,
    ]) ?? [],
  );
  const areaY = (area: number) =>
    areaTop +
    (1 - (area - axis.minimum) / (axis.maximum - axis.minimum)) * plotHeight;
  const gaugeY = (pct: number) => gaugeTop + (1 - pct / 100) * plotHeight;
  const selectedIndex = Math.max(
    0,
    dates.findIndex((date) => date.utc_date === selected.utc_date),
  );
  const observations = new Map(
    archive?.series.records.map((record) => [record.utc.slice(0, 10), record]),
  );
  const gauges = new Map(
    records
      .filter((record) => record.nisar_utc_date)
      .map((record) => [record.nisar_utc_date, record]),
  );
  const paths: string[] = [];
  let segment = "";
  for (const record of records) {
    if (record.pct == null) {
      if (segment) paths.push(segment);
      segment = "";
    } else
      segment += `${segment ? "L" : "M"}${x(record.local_date)},${gaugeY(record.pct)} `;
  }
  if (segment) paths.push(segment);
  // The gap describes missing acquisition days; its local interval follows adjacent real products.
  const before = dates.filter((date) => date.utc_date < gap.start).at(-1),
    after = dates.find((date) => date.utc_date > gap.end);
  const gapX = x(before?.local.slice(0, 10) ?? gap.start),
    gapWidth = Math.max(0, x(after?.local.slice(0, 10) ?? gap.end) - gapX);
  const selectedRecord = observations.get(selected.utc_date),
    selectedGauge = gauges.get(selected.utc_date);
  const minimumRecord = archive?.series.records.reduce(
    (best, record) =>
      record.area_km2.primary < best.area_km2.primary ? record : best,
    archive.series.records[0],
  );
  const reference = archive?.series.records[0];
  const ticks = tickDates(first, last, width < 500 ? 3 : 5);
  return (
    <div className="analysis-charts" ref={ref}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: "block", width: "100%" }}
        role="group"
        aria-label={
          en
            ? "Radar area and official storage share a time axis. Arrow keys select an observation."
            : "雷達面積與官方蓄水率共用時間軸，方向鍵可選擇觀測。"
        }
      >
        <text x={left} y={gaugeTop - 18} style={chartTitle}>
          {en ? "Official storage (%)" : "官方蓄水率（%）"}
        </text>
        {publishArea && (
          <>
            <text x={left} y={areaTop - 25} style={chartTitle}>
              {en ? "Radar water area (km²)" : "雷達水面積（km²）"}
            </text>
            <text x={left} y={areaTop - 10} style={chartText}>
              {en ? "Axis does not start at zero" : "座標軸不從 0 開始"}
            </text>
          </>
        )}
        {[...(publishArea ? [areaTop] : []), gaugeTop].map((top) => (
          <g key={top}>
            <rect
              x={gapX}
              y={top}
              width={gapWidth}
              height={plotHeight}
              fill="var(--panel, #fafafa)"
            />
            <line
              x1={gapX}
              x2={gapX + gapWidth}
              y1={top + 1}
              y2={top + 1}
              stroke={muted}
              strokeDasharray="3 4"
            />
            <text
              x={gapX + gapWidth / 2}
              y={top + 18}
              textAnchor="middle"
              style={chartText}
            >
              {en ? "Radar gap" : "雷達缺口"}
            </text>
            <line
              x1={x(selected.local.slice(0, 10))}
              x2={x(selected.local.slice(0, 10))}
              y1={top}
              y2={top + plotHeight}
              stroke={data}
              strokeDasharray="3 4"
            />
          </g>
        ))}
        {[0, 50, 100].map((tick) => (
          <g key={tick}>
            <line
              x1={left}
              x2={width - right}
              y1={gaugeY(tick)}
              y2={gaugeY(tick)}
              stroke={line}
            />
            <text
              x={left - 10}
              y={gaugeY(tick) + 4}
              textAnchor="end"
              style={chartText}
            >
              {tick}
            </text>
          </g>
        ))}
        {publishArea &&
          axis.ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={left}
                x2={width - right}
                y1={areaY(tick)}
                y2={areaY(tick)}
                stroke={line}
              />
              <text
                x={left - 10}
                y={areaY(tick) + 4}
                textAnchor="end"
                style={chartText}
              >
                {tick.toFixed(axis.decimals)}
              </text>
            </g>
          ))}
        {paths.map((path, i) => (
          <path key={i} d={path} fill="none" stroke={ink} strokeWidth="1.8" />
        ))}
        {dates.map((date, i) => {
          const observation = observations.get(date.utc_date),
            gauge = gauges.get(date.utc_date),
            position = x(date.local.slice(0, 10)),
            active = i === selectedIndex;
          const label = `${dateLabel(date.utc, lang)}, ${en ? "storage" : "蓄水率"} ${gauge?.pct?.toFixed(1) ?? "—"}%${publishArea && observation ? `, ${observation.area_km2.primary.toFixed(2)} km²` : ""}${observation?.qa.length ? " †" : ""}`;
          return (
            <g
              key={date.utc_date}
              ref={(element) => {
                pointRefs.current[i] = element;
              }}
              role="button"
              tabIndex={active ? 0 : -1}
              aria-label={label}
              aria-pressed={active}
              className="analysis-point"
              onClick={() => onSelect(i)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(i);
                  return;
                }
                const next = nextIndex(event, i, dates.length);
                if (next === null) return;
                event.preventDefault();
                onSelect(next);
                pointRefs.current[next]?.focus({ preventScroll: true });
              }}
            >
              <title>{label}</title>
              {publishArea && observation && (
                <>
                  <line
                    x1={position}
                    x2={position}
                    y1={areaY(observation.area_km2.primary_lo)}
                    y2={areaY(observation.area_km2.primary_hi)}
                    stroke={data}
                    strokeOpacity="0.45"
                    strokeWidth="2"
                  />
                  <circle
                    cx={position}
                    cy={areaY(observation.area_km2.primary)}
                    r="22"
                    fill="transparent"
                  />
                  <circle
                    cx={position}
                    cy={areaY(observation.area_km2.primary)}
                    r={active ? 6 : 3.5}
                    fill={data}
                    stroke={bg}
                    strokeWidth="1.5"
                  />
                  {observation.qa.length > 0 && (
                    <text
                      x={position}
                      y={areaY(observation.area_km2.primary_hi) - 5}
                      textAnchor="middle"
                      style={chartText}
                    >
                      †
                    </text>
                  )}
                </>
              )}
              {gauge?.pct != null && (
                <>
                  <circle
                    cx={position}
                    cy={gaugeY(gauge.pct)}
                    r="22"
                    fill="transparent"
                  />
                  <circle
                    cx={position}
                    cy={gaugeY(gauge.pct)}
                    r={active ? 5 : 3}
                    fill={active ? data : bg}
                    stroke={active ? data : ink}
                    strokeWidth="1.5"
                  />
                </>
              )}
            </g>
          );
        })}
        {publishArea && minimumRecord && reference && (
          <text
            x={Math.min(
              width - right - 8,
              Math.max(left + 8, x(minimumRecord.local.slice(0, 10))),
            )}
            y={areaTop + plotHeight + 20}
            textAnchor="middle"
            style={{ ...chartText, fill: data }}
          >
            {minimumRecord.area_km2.primary.toFixed(3)} km² (
            {signed(
              relativeChange(
                minimumRecord.area_km2.primary,
                reference.area_km2.primary,
              ),
            )}
            %)
          </text>
        )}
        {ticks.map((date, i) => (
          <text
            key={date}
            x={x(date)}
            y={height - 16}
            textAnchor={
              i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"
            }
            style={chartText}
          >
            {dateLabel(date, lang)}
          </text>
        ))}
      </svg>
      <p className="chart-selection" aria-live="polite">
        <strong>{dateLabel(selected.utc, lang)}</strong>
        <span>
          {en ? "Storage" : "蓄水率"} {selectedGauge?.pct?.toFixed(1) ?? "—"}%
        </span>
        {publishArea && selectedRecord && (
          <span>{selectedRecord.area_km2.primary.toFixed(2)} km²</span>
        )}
      </p>
      <p className="chart-note">
        {en
          ? "Taiwan local dates. Shading marks the radar gap; official observations continue. Missing gauge values stay empty."
          : "橫軸為台灣日期。陰影標示雷達缺口，官方觀測仍持續；水位站缺值保留空白。"}
      </p>
      {publishArea && (
        <p className="chart-note">
          {en
            ? "Bars show threshold sensitivity, not confidence intervals. † marks a quality flag."
            : "線段表示門檻敏感度，並非信賴區間。† 表示品質旗標。"}
        </p>
      )}
    </div>
  );
}

/** Retained for callers; the full numerical summary lives only in the methods inspector. */
export function StatisticsSummary({
  archive,
  lang,
}: {
  archive: NumericalArchive;
  lang: Language;
}) {
  return (
    <p className="statistics-summary">
      {lang === "en"
        ? "Full statistics and grade criteria are in Methods."
        : "完整統計與分級條件請見方法分頁。"}{" "}
      <span>{archive.meta.validation.grade}</span>
    </p>
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
  const { ref, width } = useChartWidth();
  const en = lang === "en";
  const eligible = archive.series.records.filter(
    (record) => record.official.level_m != null,
  );
  if (!showArea || !canPublishArea(archive) || !eligible.length) return null;
  const height = 300,
    left = 54,
    right = 18,
    top = 46,
    bottom = 62;
  const xAxis = niceAxis(eligible.map((record) => record.official.level_m!)),
    yAxis = niceAxis(
      eligible.flatMap((record) => [
        record.area_km2.primary_lo,
        record.area_km2.primary_hi,
      ]),
    );
  const x = (level: number) =>
      left +
      ((level - xAxis.minimum) / (xAxis.maximum - xAxis.minimum)) *
        (width - left - right),
    y = (area: number) =>
      top +
      (1 - (area - yAxis.minimum) / (yAxis.maximum - yAxis.minimum)) *
        (height - top - bottom);
  const selectedPoint = Math.max(
    0,
    eligible.findIndex(
      (record) => record.utc.slice(0, 10) === selected.utc_date,
    ),
  );
  const select = (i: number) => {
    const dateIndex = dates.findIndex((date) => date.utc === eligible[i].utc);
    if (dateIndex >= 0) onSelect(dateIndex);
  };
  return (
    <div className="scatter-plot" ref={ref}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: "block", width: "100%" }}
        role="group"
        aria-label={
          en
            ? "Radar area versus official water level. Circles precede the gap; squares follow it."
            : "雷達面積對官方水位。圓形為缺口前，方形為缺口後。"
        }
      >
        <text x={left} y="19" style={chartTitle}>
          {en ? "Radar water area (km²)" : "雷達水面積（km²）"}
        </text>
        <text x={left} y="35" style={chartText}>
          {en ? "Neither axis starts at zero" : "兩軸皆不從 0 開始"}
        </text>
        {yAxis.ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={left}
              x2={width - right}
              y1={y(tick)}
              y2={y(tick)}
              stroke={line}
            />
            <text
              x={left - 10}
              y={y(tick) + 4}
              textAnchor="end"
              style={chartText}
            >
              {tick.toFixed(yAxis.decimals)}
            </text>
          </g>
        ))}
        {xAxis.ticks.map((tick) => (
          <text
            key={tick}
            x={x(tick)}
            y={height - bottom + 22}
            textAnchor="middle"
            style={chartText}
          >
            {tick.toFixed(xAxis.decimals)}
          </text>
        ))}
        {eligible.map((record, i) => {
          const after = record.utc.slice(0, 10) > gap.end,
            cx = x(record.official.level_m!),
            cy = y(record.area_km2.primary),
            active = i === selectedPoint;
          const label = `${dateLabel(record.utc, lang)}, ${record.official.level_m?.toFixed(2)} m, ${record.area_km2.primary.toFixed(2)} km²`;
          return (
            <g
              key={record.utc}
              ref={(element) => {
                refs.current[i] = element;
              }}
              role="button"
              tabIndex={active ? 0 : -1}
              aria-label={label}
              aria-pressed={active}
              className="analysis-point"
              onClick={() => select(i)}
              onKeyDown={(event) => {
                const next =
                  event.key === "Enter" || event.key === " "
                    ? i
                    : nextIndex(event, i, eligible.length);
                if (next === null) return;
                event.preventDefault();
                select(next);
                refs.current[next]?.focus({ preventScroll: true });
              }}
            >
              <title>{label}</title>
              <line
                x1={cx}
                x2={cx}
                y1={y(record.area_km2.primary_lo)}
                y2={y(record.area_km2.primary_hi)}
                stroke={data}
                strokeOpacity="0.4"
              />
              <circle cx={cx} cy={cy} r="22" fill="transparent" />
              {after ? (
                <rect
                  x={cx - 4}
                  y={cy - 4}
                  width="8"
                  height="8"
                  fill={active ? data : bg}
                  stroke={data}
                  strokeWidth={active ? 2.5 : 1.5}
                />
              ) : (
                <circle
                  cx={cx}
                  cy={cy}
                  r={active ? 6 : 4}
                  fill={data}
                  stroke={bg}
                  strokeWidth="1.5"
                />
              )}
              {record.qa.length > 0 && (
                <text x={cx + 8} y={cy - 6} style={chartText}>
                  †
                </text>
              )}
            </g>
          );
        })}
        <text
          x={(left + width - right) / 2}
          y={height - 12}
          textAnchor="middle"
          style={chartTitle}
        >
          {en ? "Official water level (m)" : "官方水位（m）"}
        </text>
      </svg>
      <p className="chart-note">
        ● {en ? "Before gap" : "缺口前"}　□ {en ? "After gap" : "缺口後"}　
        {en
          ? "Select a point to inspect its image."
          : "選取資料點，可同步查看該日影像。"}
      </p>
    </div>
  );
}

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { datePosition, type Acquisition, type OfficialRecord } from "../domain";
import type { Language } from "../i18n";
import { canPublishArea, type NumericalArchive } from "../numerical";
import { niceAxis } from "../science";
import { predictionSegments, type StoragePrediction } from "../prediction";
import type { ReservoirEstimation } from "../storageEstimationTypes";
import TwoStagePredictionLayer, {
  canRenderTwoStage,
} from "./TwoStagePredictionLayer";
import { rainIcon, rainLabel, type WeatherSeries } from "../weather";
import WeatherPanel from "./WeatherPanel";
import type { ContextEvent } from "../events";
import EventTimeline, {
  eventTimelineHeight,
  layoutEventMarkers,
} from "./EventTimeline";

export interface AnalysisChartProps {
  archive?: NumericalArchive | null;
  records: OfficialRecord[];
  dates: Acquisition[];
  selected: Acquisition;
  onSelect: (index: number) => void;
  gap: { start: string; end: string };
  lang: Language;
  showArea?: boolean;
  prediction?: StoragePrediction | null;
  twoStage?: ReservoirEstimation | null;
  showLevel?: boolean;
  weather?: WeatherSeries | null;
  weatherInspectionDate?: string;
  onInspectWeatherDate?: (date: string) => void;
  events?: ContextEvent[];
  onInspectEvent?: (event: ContextEvent) => void;
}
const ink = "var(--ink, #18181a)",
  muted = "var(--muted, #6b6b70)",
  data = "var(--data, #2f6fed)",
  line = "var(--line, #e5e5e5)",
  bg = "var(--bg, #ffffff)";
const chartText = { fontSize: 14, fill: muted };
const chartTitle = { fontSize: 16, fontWeight: 600, fill: ink };
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
  prediction: suppliedPrediction = null,
  twoStage = null,
  showLevel = false,
  weather = null,
  weatherInspectionDate,
  onInspectWeatherDate,
  events = [],
  onInspectEvent,
}: AnalysisChartProps) {
  const predictionClipId = useId();
  const pointRefs = useRef<(SVGGElement | null)[]>([]);
  const { ref, width } = useChartWidth();
  const en = lang === "en",
    publishArea = Boolean(showArea && archive && canPublishArea(archive));
  const canEstimate = publishArea && archive?.meta.validation.grade === "A";
  const activeTwoStage =
    canEstimate && twoStage && canRenderTwoStage(twoStage) ? twoStage : null;
  const prediction = canEstimate && !twoStage ? suppliedPrediction : null;
  const left = 54,
    right = 18,
    areaTop = 46,
    plotHeight = 112,
    gaugeTop = publishArea ? areaTop + plotHeight + 44 : areaTop,
    levelTop = gaugeTop + plotHeight + 44,
    weatherTop = (showLevel ? levelTop : gaugeTop) + plotHeight + 44,
    baseHeight = weather
      ? weatherTop + plotHeight + 62
      : (showLevel ? levelTop : gaugeTop) + plotHeight + 42;
  const first = records[0]?.local_date ?? dates[0].local.slice(0, 10),
    last = records.at(-1)?.local_date ?? dates.at(-1)!.local.slice(0, 10);
  const x = (date: string) =>
    left + (datePosition(date, first, last) / 100) * (width - left - right);
  const eventMarkers = layoutEventMarkers(events, first, last, x);
  const height = baseHeight + eventTimelineHeight(eventMarkers);
  const axis = niceAxis(
    archive?.series.records.flatMap((record) => [
      record.area_km2.primary_lo,
      record.area_km2.primary_hi,
    ]) ?? [],
  );
  const areaY = (area: number) =>
    areaTop +
    (1 - (area - axis.minimum) / (axis.maximum - axis.minimum)) * plotHeight;
  // A visibility toggle must not rescale the reference observations.
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
  const levelAxis = niceAxis(
    records.flatMap((r) => (r.level_m == null ? [] : [r.level_m])),
  );
  const levelY = (level: number) =>
    levelTop +
    (1 -
      (level - levelAxis.minimum) / (levelAxis.maximum - levelAxis.minimum)) *
      plotHeight;
  const levelPaths: string[] = [];
  let levelSegment = "";
  for (const record of records) {
    if (record.level_m == null) {
      if (levelSegment) levelPaths.push(levelSegment);
      levelSegment = "";
    } else
      levelSegment += `${levelSegment ? "L" : "M"}${x(record.local_date)},${levelY(record.level_m)} `;
  }
  if (levelSegment) levelPaths.push(levelSegment);
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
  const selectedWeather = weather?.records.find(
    (row) => row.local_date === selected.local.slice(0, 10),
  );
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
            <text x={left} y={areaTop - 8} style={chartText}>
              {en ? "Axis does not start at zero" : "座標軸不從 0 開始"}
            </text>
          </>
        )}
        {[
          ...(publishArea ? [areaTop] : []),
          gaugeTop,
          ...(showLevel ? [levelTop] : []),
        ].map((top) => (
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
        {prediction && (
          <rect
            x={x(first)}
            y={gaugeTop}
            width={Math.max(
              0,
              x(prediction.training.at(-1)!.local.slice(0, 10)) - x(first),
            )}
            height={plotHeight}
            fill="var(--prediction, #bf5814)"
            opacity="0.09"
          />
        )}
        {activeTwoStage && (
          <TwoStagePredictionLayer
            report={activeTwoStage}
            x={x}
            y={gaugeY}
            left={left}
            right={width - right}
            lang={lang}
          />
        )}
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
        {prediction && (
          <g>
            <defs>
              <clipPath id={predictionClipId}>
                <rect
                  x={left}
                  y={gaugeTop}
                  width={width - left - right}
                  height={plotHeight}
                />
              </clipPath>
            </defs>
            <g clipPath={`url(#${predictionClipId})`}>
              {predictionSegments(prediction.points).map((segment, i) => (
                <path
                  key={i}
                  d={segment
                    .map(
                      (p, j) =>
                        `${j ? "L" : "M"}${x(p.local.slice(0, 10))},${gaugeY(p.predicted)}`,
                    )
                    .join(" ")}
                  fill="none"
                  stroke="var(--prediction, #bf5814)"
                  strokeWidth="2"
                  strokeDasharray="5 4"
                />
              ))}
            </g>
            {prediction.points.map((p) => {
              const px = x(p.local.slice(0, 10));
              const above = p.predicted > 100,
                below = p.predicted < 0;
              const label = `${dateLabel(p.utc, lang)}: ${p.predicted.toFixed(1)}% · ${p.training ? (en ? "Calibration" : "校正") : en ? "Evaluation" : "檢驗"}${p.extrapolated ? (en ? " · Extrapolation" : " · 外插") : ""}${above ? (en ? " · Above 100%" : " · 超過 100%") : below ? (en ? " · Below 0%" : " · 低於 0%") : ""}`;
              const color = "var(--prediction, #bf5814)";
              if (above || below) {
                const edgeY = above ? gaugeY(100) : gaugeY(0);
                const direction = above ? 1 : -1;
                return (
                  <polygon
                    key={p.utc}
                    className="prediction-overflow"
                    points={`${px},${edgeY} ${px - 4},${edgeY + direction * 7} ${px + 4},${edgeY + direction * 7}`}
                    fill={p.training ? "var(--bg, #fff)" : color}
                    stroke={color}
                    role="img"
                    aria-label={label}
                  >
                    <title>{label}</title>
                  </polygon>
                );
              }
              return (
                <rect
                  key={p.utc}
                  x={px - 3}
                  y={gaugeY(p.predicted) - 3}
                  width="6"
                  height="6"
                  fill={p.training ? "var(--bg, #fff)" : color}
                  stroke={color}
                >
                  <title>{label}</title>
                </rect>
              );
            })}
          </g>
        )}
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
        {showLevel && (
          <g
            aria-label={
              en ? "Official water level time series" : "官方水位時間序列"
            }
          >
            <text x={left} y={levelTop - 18} style={chartTitle}>
              {en ? "Official water level (m)" : "官方水位（m）"}
            </text>
            {levelAxis.ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={left}
                  x2={width - right}
                  y1={levelY(tick)}
                  y2={levelY(tick)}
                  stroke={line}
                />
                <text
                  x={left - 10}
                  y={levelY(tick) + 4}
                  textAnchor="end"
                  style={chartText}
                >
                  {tick.toFixed(levelAxis.decimals)}
                </text>
              </g>
            ))}
            {levelPaths.map((path, i) => (
              <path
                key={i}
                d={path}
                fill="none"
                stroke={ink}
                strokeWidth="1.8"
              />
            ))}
            {selectedGauge?.level_m != null && (
              <circle
                cx={x(selected.local.slice(0, 10))}
                cy={levelY(selectedGauge.level_m)}
                r="5"
                fill={data}
              >
                <title>{`${dateLabel(selected.utc, lang)}: ${selectedGauge.level_m.toFixed(2)} m`}</title>
              </circle>
            )}
            {!levelPaths.length && (
              <text x={left} y={levelTop + 30} style={chartText}>
                {en ? "No water-level observations" : "尚無水位觀測"}
              </text>
            )}
          </g>
        )}
        {weather && (
          <WeatherPanel
            series={weather}
            dates={dates}
            first={first}
            last={last}
            x={x}
            top={weatherTop}
            plotHeight={plotHeight}
            selectedDate={selected.local.slice(0, 10)}
            inspectionDate={weatherInspectionDate}
            onInspectDate={onInspectWeatherDate}
            lang={lang}
          />
        )}
        <g className="shared-date-axis">
          {ticks.map((date, i) => (
            <text
              key={date}
              x={x(date)}
              y={baseHeight - 16}
              textAnchor={
                i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"
              }
              style={chartText}
            >
              {dateLabel(date, lang)}
            </text>
          ))}
        </g>
        <EventTimeline
          markers={eventMarkers}
          top={baseHeight + 8}
          left={left}
          right={width - right}
          onSelect={onInspectEvent}
          lang={lang}
        />
      </svg>
      {activeTwoStage && (
        <p className="chart-note">
          {en
            ? "Pale date bands: High; finer levels unresolved. Their bounds describe this archive, not independent predictive confidence. Hollow orange squares: calibration points; filled squares: historical application. Bars: ± largest leave-one-out absolute error, not a confidence interval; E marks extrapolation."
            : "淡色日期短帶：偏高，分不出更細；上下限描述本年度資料，不代表獨立預測信心。空心橘方點是校正點，實心方點是歷史套用估計。誤差線：±逐一留出最大絕對誤差，非信賴區間；「外」表示外插。"}
        </p>
      )}
      <p className="chart-selection" aria-live="polite">
        <strong>{dateLabel(selected.utc, lang)}</strong>
        <span>
          {en ? "Storage" : "蓄水率"} {selectedGauge?.pct?.toFixed(1) ?? "—"}%
        </span>
        {publishArea && selectedRecord && (
          <span>{selectedRecord.area_km2.primary.toFixed(2)} km²</span>
        )}
        {weather && (
          <span
            title={`${rainLabel(selectedWeather, en)}${selectedWeather?.rainfall_quality_flag ? ` · CWA flag ${selectedWeather.rainfall_quality_flag}` : ""}`}
          >
            {en ? "Station rain" : "測站雨量"} {rainIcon(selectedWeather)}{" "}
            {selectedWeather?.rainfall_mm != null
              ? `${selectedWeather.rainfall_mm.toFixed(1)} mm`
              : rainLabel(selectedWeather, en)}
            {selectedWeather?.rainfall_quality_flag ? " †" : ""}
          </span>
        )}
      </p>
      {showLevel && (
        <p className="chart-selection">
          {en ? "Official level" : "官方水位"}:{" "}
          {selectedGauge?.level_m?.toFixed(2) ?? "—"} m
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
  const height = 320,
    left = 54,
    right = 18,
    top = 58,
    bottom = 64;
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
      <p className="chart-note">
        {en
          ? "Each point is one observation. The horizontal axis is official water level, not date; the vertical axis is SAR area. This checks their relationship; it does not estimate water level."
          : "每個點是一次觀測。橫軸是官方水位，不是日期；縱軸是 SAR 面積。用來檢查兩者關聯，並未估算水位。"}
      </p>
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
        <text x={left} y="22" style={chartTitle}>
          {en ? "Radar water area (km²)" : "雷達水面積（km²）"}
        </text>
        <text x={left} y="42" style={chartText}>
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
        {xAxis.ticks.map((tick, i) => (
          <text
            key={tick}
            x={x(tick)}
            y={height - bottom + 22}
            textAnchor={
              i === 0
                ? "start"
                : i === xAxis.ticks.length - 1
                  ? "end"
                  : "middle"
            }
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
        {en
          ? "Vertical bars show how area changes with the classification threshold, not confidence intervals."
          : "直立線表示調整分類門檻後的面積範圍，不是信賴區間。"}{" "}
        ● {en ? "Before gap" : "缺口前"}　□ {en ? "After gap" : "缺口後"}　
        {en
          ? "Select a point to inspect its image."
          : "選取資料點，可同步查看該日影像。"}
      </p>
    </div>
  );
}

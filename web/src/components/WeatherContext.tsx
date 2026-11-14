import { useEffect, useRef, useState } from "react";
import {
  dataUrl,
  datePosition,
  formatDate,
  type Acquisition,
  type OfficialRecord,
} from "../domain";
import type { Language } from "../i18n";
import {
  parseWeather,
  rainIcon,
  rainLabel,
  type WeatherSeries,
} from "../weather";

export function WeatherPlot({
  series,
  dates,
  first,
  last,
  selectedDate,
  onDateChange,
  lang,
}: {
  series: WeatherSeries;
  dates: Acquisition[];
  first: string;
  last: string;
  selectedDate: string;
  onDateChange: (date: string) => void;
  lang: Language;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    if (!ref.current) return;
    const element = ref.current;
    const observer = new ResizeObserver(() =>
      setWidth(Math.max(280, element.clientWidth)),
    );
    setWidth(Math.max(280, element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const en = lang === "en",
    left = 54,
    right = 18,
    top = 42,
    bottom = 157;
  const x = (day: string) =>
    left + (datePosition(day, first, last) / 100) * (width - left - right);
  const records = series.records.filter(
    (r) => r.local_date >= first && r.local_date <= last,
  );
  const maximum = Math.max(10, ...records.map((r) => r.rainfall_mm ?? 0));
  const y = (rain: number) => bottom - (rain / maximum) * (bottom - top);
  const days = Math.max(1, (Date.parse(last) - Date.parse(first)) / 86400000);
  const barWidth = Math.max(0.65, ((width - left - right) / (days + 1)) * 0.8);
  const byDate = new Map(records.map((r) => [r.local_date, r]));
  // Keep every acquisition's weather symbol readable on narrow charts.
  const iconSpacing = Math.min(
    ...dates
      .slice(1)
      .map((date, i) =>
        Math.abs(x(date.local.slice(0, 10)) - x(dates[i].local.slice(0, 10))),
      ),
  );
  const iconRows = Math.max(1, Math.ceil(20 / Math.max(1, iconSpacing)));
  const extraIconHeight = (iconRows - 1) * 20;
  return (
    <div ref={ref} className="weather-plot">
      <svg
        viewBox={`0 0 ${width} ${242 + extraIconHeight}`}
        role="img"
        aria-label={
          en
            ? "Daily CWA rainfall in millimetres, aligned to the SAR time axis. Use the date field for daily values."
            : "中央氣象署逐日雨量（毫米），與 SAR 共用日期範圍。可用日期欄位查看每日數值。"
        }
      >
        <text x={left} y={22} fill="var(--ink)" fontSize="16">
          {en ? "Station rainfall (mm/day)" : "測站日雨量（mm／日）"}
        </text>
        {[0, maximum / 2, maximum].map((tick) => (
          <g key={tick}>
            <line
              x1={left}
              x2={width - right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="var(--line)"
            />
            <text
              x={left - 8}
              y={y(tick) + 4}
              textAnchor="end"
              fill="var(--muted)"
              fontSize="14"
            >
              {tick.toFixed(0)}
            </text>
          </g>
        ))}
        {records.map((row) => (
          <g key={row.local_date} onClick={() => onDateChange(row.local_date)}>
            <title>{`${row.local_date}: ${rainLabel(row, en)} · ${row.rainfall_mm == null ? "—" : `${row.rainfall_mm} mm`}${row.rainfall_quality_flag ? ` · CWA flag ${row.rainfall_quality_flag}` : ""}`}</title>
            {row.rainfall_mm !== null ? (
              <rect
                x={x(row.local_date) - barWidth / 2}
                y={row.rainfall_mm > 0 ? y(row.rainfall_mm) : bottom - 1}
                width={barWidth}
                height={row.rainfall_mm > 0 ? bottom - y(row.rainfall_mm) : 1}
                fill={
                  row.rainfall_mm > 0 ? "var(--data, #2f6fed)" : "var(--muted)"
                }
              />
            ) : (
              <line
                x1={x(row.local_date)}
                x2={x(row.local_date)}
                y1={bottom - 4}
                y2={bottom + 4}
                stroke={row.rainfall_trace ? "var(--data)" : "var(--muted)"}
                strokeDasharray={row.rainfall_trace ? undefined : "2 2"}
              />
            )}
          </g>
        ))}
        <line
          x1={x(selectedDate)}
          x2={x(selectedDate)}
          y1={top}
          y2={bottom + 8}
          stroke="var(--prediction, #bf5814)"
          strokeDasharray="3 3"
        />
        {dates.map((d, i) => {
          const day = d.local.slice(0, 10),
            row = byDate.get(day);
          return (
            <text
              key={day}
              x={x(day)}
              y={187 + (i % iconRows) * 20}
              textAnchor="middle"
              fontSize="14"
              fill="var(--ink)"
            >
              <title>{`${day}: ${rainLabel(row, en)}`}</title>
              {rainIcon(row)}
            </text>
          );
        })}
        {[0, 0.5, 1].map((f) => {
          const day = new Date(
            Date.parse(first) + f * (Date.parse(last) - Date.parse(first)),
          )
            .toISOString()
            .slice(0, 10);
          return (
            <text
              key={f}
              x={x(day)}
              y={218 + extraIconHeight}
              textAnchor={f === 0 ? "start" : f === 1 ? "end" : "middle"}
              fill="var(--muted)"
              fontSize="14"
            >
              {formatDate(day, true, lang)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

export default function WeatherContext({
  reservoirKey,
  dates,
  selected,
  records,
  lang,
}: {
  reservoirKey: string;
  dates: Acquisition[];
  selected: Acquisition;
  records: OfficialRecord[];
  lang: Language;
}) {
  const [series, setSeries] = useState<WeatherSeries | null>(null);
  const [error, setError] = useState(false),
    [retry, setRetry] = useState(0);
  const [selectedDate, setSelectedDate] = useState(selected.local.slice(0, 10));
  const en = lang === "en";
  useEffect(() => {
    setSelectedDate(selected.local.slice(0, 10));
  }, [selected.local]);
  useEffect(() => {
    const controller = new AbortController();
    setSeries(null);
    setError(false);
    void fetch(dataUrl(`weather/${reservoirKey}.json`), {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("Weather unavailable");
        return response.json() as Promise<unknown>;
      })
      .then((data) => {
        if (!controller.signal.aborted)
          setSeries(parseWeather(data, reservoirKey));
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [reservoirKey, retry]);
  const first = records[0]?.local_date ?? dates[0].local.slice(0, 10);
  const last = records.at(-1)?.local_date ?? dates.at(-1)!.local.slice(0, 10);
  const day = series?.records.find((r) => r.local_date === selectedDate);
  return (
    <section
      className="weather-context"
      aria-label={en ? "Real Weather" : "真實天氣觀測"}
    >
      <h2>{en ? "CWA station rainfall" : "氣象署測站雨量"}</h2>
      {error ? (
        <div role="alert">
          <p>
            {en
              ? "Weather observations could not load. Missing data are not zero rainfall."
              : "氣象資料載入失敗；缺值不代表零雨量。"}
          </p>
          <button onClick={() => setRetry((n) => n + 1)}>
            {en ? "Retry weather" : "重新載入氣象資料"}
          </button>
        </div>
      ) : !series ? (
        <p role="status">
          {en ? "Loading historical observations…" : "載入歷史氣象觀測…"}
        </p>
      ) : (
        <>
          <WeatherPlot
            series={series}
            dates={dates}
            first={first}
            last={last}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            lang={lang}
          />
          <label>
            {en ? "Inspect a local date" : "查看台灣日期"}{" "}
            <input
              type="date"
              value={selectedDate}
              min={series.period.start}
              max={series.period.end}
              onChange={(event) => {
                if (
                  event.target.value >= series.period.start &&
                  event.target.value <= series.period.end
                )
                  setSelectedDate(event.target.value);
              }}
            />
          </label>
          <p aria-live="polite">
            <strong>
              {selectedDate} · {rainIcon(day)} {rainLabel(day, en)} ·{" "}
              {day?.rainfall_mm != null
                ? `${day.rainfall_mm.toFixed(1)} mm`
                : "—"}
            </strong>
            {day?.sunshine_hours != null
              ? ` · ${en ? "Sunshine" : "日照"} ${day.sunshine_hours.toFixed(1)} h`
              : ""}
            {day?.rainfall_quality_flag
              ? ` · ${en ? "Source quality flag" : "來源品質旗標"}: ${day.rainfall_quality_flag}`
              : ""}
          </p>
          <details>
            <summary>
              {en ? "Coverage and interpretation" : "資料範圍與判讀方式"}
            </summary>
            <p>
              {en ? series.station.name : series.station.name_zh} (
              {series.station.id}) ·{" "}
              {series.station.distance_to_reservoir_center_km.toFixed(1)} km{" "}
              {en ? "from reservoir map centre" : "距水庫圖幅中心"} ·{" "}
              <a href={series.source} target="_blank" rel="noreferrer">
                CWA CODiS ↗
              </a>
            </p>
            <p className="chart-note">
              {en
                ? "Icons mark SAR dates: ☂ rain/trace · ○ no measurable rain, sky unknown · ☀ measured sunshine with no rain · ? missing. Bars cover every calendar day, including the SAR gap."
                : "圖示對應 SAR 日期：☂ 有雨／雨跡 · ○ 未測得雨、晴陰未知 · ☀ 有日照且無雨 · ? 缺值。長條涵蓋每日，包括 SAR 缺口。"}
            </p>
            <p>
              {series.period.start} – {series.period.end} ·{" "}
              {en ? "Missing days" : "缺值日數"}:{" "}
              {series.records.filter((r) => r.condition === "missing").length} ·{" "}
              {en ? "Retrieved" : "整理時間"}:{" "}
              {series.generated_at.slice(0, 10)}
            </p>
            <p>
              {en
                ? "Nearby station measurements, not catchment-average rain. Rain status is derived from daily accumulation; an official daily sky-condition summary is unavailable here. No rain does not mean sunshine. Daily totals include hours after the SAR overpass, so they are context, not inputs to the storage prediction. Original nonzero CWA quality flags remain visible and are not reinterpreted. Weather context alone does not establish why storage changed."
                : "這是鄰近測站的點觀測，不是集水區平均雨量。晴雨標記依每日累積雨量產生，此來源未提供每日主要天氣文字；無雨不等於晴天。日累積量包含 SAR 通過之後的時段，只作背景，不輸入蓄水率預估。保留並顯示氣象署非零品質旗標，不自行改判其含義。天氣背景本身不能證明蓄水變化的原因。"}
            </p>
          </details>
        </>
      )}
    </section>
  );
}

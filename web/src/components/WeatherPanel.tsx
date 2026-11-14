import type { Acquisition } from "../domain";
import type { Language } from "../i18n";
import { rainIcon, rainLabel, type WeatherSeries } from "../weather";

/** An SVG panel using the parent chart's date scale and plotting height. */
export default function WeatherPanel({
  series,
  dates,
  first,
  last,
  x,
  top,
  plotHeight,
  selectedDate,
  inspectionDate,
  onInspectDate,
  lang,
}: {
  series: WeatherSeries;
  dates: Acquisition[];
  first: string;
  last: string;
  x: (date: string) => number;
  top: number;
  plotHeight: number;
  selectedDate: string;
  inspectionDate?: string;
  onInspectDate?: (date: string) => void;
  lang: Language;
}) {
  const en = lang === "en";
  const left = x(first),
    right = x(last),
    bottom = top + plotHeight;
  const records = series.records.filter(
    (row) => row.local_date >= first && row.local_date <= last,
  );
  const maximum = Math.max(10, ...records.map((row) => row.rainfall_mm ?? 0));
  const y = (rain: number) => bottom - (rain / maximum) * plotHeight;
  const days = Math.max(1, (Date.parse(last) - Date.parse(first)) / 86400000);
  const barWidth = Math.max(0.65, ((right - left) / (days + 1)) * 0.8);
  const byDate = new Map(records.map((row) => [row.local_date, row]));
  // Keep a single icon row, prioritising the selected acquisition. All daily bars remain.
  let previousIconX = -Infinity;
  const iconDates = dates
    .map((date) => date.local.slice(0, 10))
    .filter((day) => {
      if (day < first || day > last) return false;
      const position = x(day);
      if (
        day !== selectedDate &&
        (position - previousIconX < 20 ||
          Math.abs(position - x(selectedDate)) < 20)
      )
        return false;
      previousIconX = position;
      return true;
    });
  return (
    <g
      className="weather-panel"
      aria-label={en ? "Daily CWA station rainfall" : "氣象署測站逐日雨量"}
    >
      <text
        x={left}
        y={top - 18}
        fill="var(--ink)"
        fontSize="16"
        fontWeight="600"
      >
        {en ? "CWA rainfall (mm/day)" : "氣象署日雨量（mm）"}
      </text>
      {[0, maximum / 2, maximum].map((tick) => (
        <g key={tick}>
          <line
            x1={left}
            x2={right}
            y1={y(tick)}
            y2={y(tick)}
            stroke="var(--line)"
          />
          <text
            x={left - 10}
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
        <g key={row.local_date} onClick={() => onInspectDate?.(row.local_date)}>
          <title>{`${row.local_date}: ${rainLabel(row, en)} · ${row.rainfall_mm == null ? "—" : `${row.rainfall_mm} mm`}${row.rainfall_quality_flag ? ` · CWA flag ${row.rainfall_quality_flag}` : ""}`}</title>
          {row.rainfall_mm !== null ? (
            <rect
              className="rainfall-bar"
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
              className={
                row.rainfall_trace ? "rainfall-trace" : "rainfall-missing"
              }
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
        className="weather-selected"
        x1={x(selectedDate)}
        x2={x(selectedDate)}
        y1={top}
        y2={bottom}
        stroke="var(--data)"
        strokeDasharray="3 4"
      />
      {inspectionDate &&
        inspectionDate !== selectedDate &&
        inspectionDate >= first &&
        inspectionDate <= last && (
          <line
            x1={x(inspectionDate)}
            x2={x(inspectionDate)}
            y1={top}
            y2={bottom}
            stroke="var(--prediction, #bf5814)"
            strokeDasharray="3 3"
          />
        )}
      {iconDates.map((day) => (
        <text
          key={day}
          className="weather-icon"
          x={x(day)}
          y={bottom + 20}
          textAnchor="middle"
          fontSize="14"
          fill="var(--ink)"
          fontWeight={day === selectedDate ? 700 : undefined}
        >
          <title>{`${day}: ${rainLabel(byDate.get(day), en)}`}</title>
          {rainIcon(byDate.get(day))}
        </text>
      ))}
    </g>
  );
}

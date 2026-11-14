import {
  datePosition,
  formatDate,
  type Acquisition,
  type OfficialRecord,
} from "../domain";
import type { AreaSeries } from "../numerical";

interface Props {
  records: OfficialRecord[];
  dates: Acquisition[];
  selected: Acquisition;
  onSelect: (index: number) => void;
  gap: { start: string; end: string };
  areaSeries?: AreaSeries;
}
export default function GaugeChart({
  records,
  dates,
  selected,
  onSelect,
  gap,
  areaSeries,
}: Props) {
  const width = 920,
    height = 190,
    left = 40,
    right = areaSeries ? 45 : 22,
    top = 20,
    bottom = 34;
  const first = records[0].local_date,
    last = records.at(-1)!.local_date;
  const x = (date: string) =>
    left + (datePosition(date, first, last) / 100) * (width - left - right);
  const y = (pct: number) =>
    top + ((100 - pct) / 100) * (height - top - bottom);
  const areaMax = areaSeries
    ? Math.max(
        0.1,
        ...areaSeries.records.map((record) => record.area_km2.primary_hi),
      ) * 1.12
    : 1;
  const areaY = (area: number) =>
    top + (1 - area / areaMax) * (height - top - bottom);
  const segments: string[] = [];
  let segment = "";
  records.forEach((record) => {
    if (record.pct === null) {
      if (segment) segments.push(segment);
      segment = "";
    } else
      segment += `${segment ? "L" : "M"}${x(record.local_date)},${y(record.pct)} `;
  });
  if (segment) segments.push(segment);
  const gapStartLocal = new Date(Date.parse(gap.start) + 86_400_000)
    .toISOString()
    .slice(0, 10);
  const gapEndLocal = new Date(Date.parse(gap.end) + 86_400_000)
    .toISOString()
    .slice(0, 10);
  const current = records.find((r) => r.nisar_utc_date === selected.utc_date);
  return (
    <div className="chart-wrap">
      <svg
        className="gauge-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="group"
        aria-label="Official storage percentage over time. The shaded interval has no NISAR products. Select a sampled gauge point to change radar date."
      >
        <defs>
          <pattern
            id="gap-hatch"
            width="7"
            height="7"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(35)"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="7"
              stroke="#d9dfdc"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect
          x={x(gapStartLocal)}
          y={top}
          width={x(gapEndLocal) - x(gapStartLocal)}
          height={height - top - bottom}
          fill="#f0f2ef"
        />
        <rect
          x={x(gapStartLocal)}
          y={top}
          width={x(gapEndLocal) - x(gapStartLocal)}
          height={height - top - bottom}
          fill="url(#gap-hatch)"
        />
        {[0, 25, 50, 75, 100].map((tick) => (
          <g key={tick}>
            <line
              x1={left}
              x2={width - right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="#e5e9e5"
              strokeDasharray={tick ? "3 4" : ""}
            />
            <text
              x={left - 12}
              y={y(tick) + 4}
              textAnchor="end"
              className="chart-tick"
            >
              {tick}
            </text>
          </g>
        ))}
        <text
          x={(x(gapStartLocal) + x(gapEndLocal)) / 2}
          y={top + 16}
          textAnchor="middle"
          className="gap-label"
        >
          NO RADAR OBSERVATIONS
        </text>
        {segments.map((path, i) => (
          <path
            key={i}
            d={path}
            fill="none"
            stroke="#307b83"
            strokeWidth="2.5"
          />
        ))}
        {areaSeries &&
          [0, 0.25, 0.5, 0.75, 1].map((fraction) => (
            <text
              key={`area-axis-${fraction}`}
              x={width - right + 9}
              y={areaY(areaMax * fraction) + 4}
              className="chart-tick"
            >
              {(areaMax * fraction).toFixed(2)}
            </text>
          ))}
        {areaSeries?.records.map((record) => {
          const index = dates.findIndex(
            (date) => date.utc_date === record.utc.slice(0, 10),
          );
          if (index < 0) return null;
          const position = x(record.local.slice(0, 10));
          return (
            <g
              key={`area-${record.utc}`}
              className="chart-point"
              tabIndex={0}
              role="button"
              aria-label={`${formatDate(record.local)}: ${areaSeries.stats.classification_channel} area ${record.area_km2.primary.toFixed(3)} square kilometers, sensitivity ${record.area_km2.primary_lo.toFixed(3)} to ${record.area_km2.primary_hi.toFixed(3)}. ${record.qa.join(". ")} Select radar observation.`}
              onClick={() => onSelect(index)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(index);
                }
              }}
            >
              <title>
                {formatDate(record.local)} ·{" "}
                {areaSeries.stats.classification_channel} area{" "}
                {record.area_km2.primary.toFixed(3)} km² ·{" "}
                {record.qa.length
                  ? `QA: ${record.qa.join("; ")}`
                  : "No QA flags"}
              </title>
              <line
                x1={position}
                x2={position}
                y1={areaY(record.area_km2.primary_lo)}
                y2={areaY(record.area_km2.primary_hi)}
                stroke="#398eb6"
                strokeWidth="1.5"
                opacity="0.6"
              />
              <line
                x1={position - 3}
                x2={position + 3}
                y1={areaY(record.area_km2.primary_lo)}
                y2={areaY(record.area_km2.primary_lo)}
                stroke="#398eb6"
              />
              <line
                x1={position - 3}
                x2={position + 3}
                y1={areaY(record.area_km2.primary_hi)}
                y2={areaY(record.area_km2.primary_hi)}
                stroke="#398eb6"
              />
              <circle
                cx={position}
                cy={areaY(record.area_km2.primary)}
                r={
                  index ===
                  dates.findIndex((d) => d.utc_date === selected.utc_date)
                    ? 4.5
                    : 3
                }
                fill="#327da6"
                stroke="#fdfefa"
                strokeWidth="1"
              />
              {record.qa.length > 0 && (
                <text
                  x={position}
                  y={areaY(record.area_km2.primary_hi) - 5}
                  textAnchor="middle"
                  fill="#396f8a"
                  fontSize="9"
                >
                  †
                </text>
              )}
            </g>
          );
        })}
        <line
          x1={x(selected.local.slice(0, 10))}
          x2={x(selected.local.slice(0, 10))}
          y1={top}
          y2={height - bottom}
          stroke="#174c51"
          strokeDasharray="3 3"
        />
        {records
          .filter((r) => r.pct !== null && r.nisar_utc_date)
          .map((record) => {
            const index = dates.findIndex(
              (d) => d.utc_date === record.nisar_utc_date,
            );
            if (index < 0) return null;
            const active = record.nisar_utc_date === selected.utc_date;
            return (
              <g
                key={record.local_date}
                role="button"
                tabIndex={0}
                aria-label={`${formatDate(record.local_date)}: ${record.pct?.toFixed(1)}% storage. Select radar observation.`}
                onClick={() => onSelect(index)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(index);
                  }
                }}
                className="chart-point"
              >
                <circle
                  cx={x(record.local_date)}
                  cy={y(record.pct!)}
                  r="10"
                  fill="transparent"
                />
                <circle
                  cx={x(record.local_date)}
                  cy={y(record.pct!)}
                  r={active ? 5 : 3}
                  fill={active ? "#174c51" : "#fcfdf9"}
                  stroke="#307b83"
                  strokeWidth={active ? 2.5 : 1.5}
                />
                <title>
                  {formatDate(record.local_date)} · {record.pct?.toFixed(1)}%
                </title>
              </g>
            );
          })}
        {current?.pct !== null && current?.pct !== undefined && (
          <text
            x={Math.max(left + 22, Math.min(width - 45, x(current.local_date)))}
            y={y(current.pct) - 13}
            textAnchor="middle"
            className="chart-value"
          >
            {current.pct.toFixed(1)}%
          </text>
        )}
        {[
          "2025-11-06",
          "2026-01-01",
          "2026-03-01",
          "2026-05-01",
          "2026-07-01",
          "2026-09-01",
          "2026-10-20",
        ].map((date) => (
          <text
            key={date}
            x={x(date)}
            y={height - 9}
            textAnchor="middle"
            className="chart-tick"
          >
            {formatDate(date, true)}
          </text>
        ))}
      </svg>
      <span className="chart-y-label">STORAGE %</span>
      {areaSeries && (
        <span className="chart-area-label">
          {areaSeries.stats.classification_channel} AREA km² · ±1.5 dB
        </span>
      )}
    </div>
  );
}

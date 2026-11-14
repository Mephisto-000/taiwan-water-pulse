import { datePosition } from "../domain";
import type { Language } from "../i18n";
import { canPublishArea, type NumericalArchive } from "../numerical";

/** Descriptive spatial contrast from calibrated pixels; never a classification-accuracy score. */
export default function PolarizationSeparation({
  archive,
  lang,
}: {
  archive: NumericalArchive;
  lang: Language;
}) {
  const records = archive.series.records;
  const pairs = records.filter(
    (record) => record.separation?.HH != null && record.separation.HV != null,
  );
  if (!canPublishArea(archive) || !pairs.length) return null;
  const en = lang === "en";
  const width = 720,
    height = 300,
    left = 64,
    right = 24,
    top = 40,
    bottom = 52;
  const values = records
    .flatMap((r) => [r.separation?.HH, r.separation?.HV])
    .filter((value): value is number => value !== null && value !== undefined);
  const min = Math.min(0, ...values),
    max = Math.max(0.1, ...values);
  const pad = (max - min) * 0.1;
  const low = min - pad,
    high = max + pad;
  const first = records[0].utc.slice(0, 10),
    last = records.at(-1)!.utc.slice(0, 10);
  const x = (date: string) =>
    left + (datePosition(date, first, last) / 100) * (width - left - right);
  const y = (value: number) =>
    top + (1 - (value - low) / (high - low)) * (height - top - bottom);
  const hhHigher = pairs.filter(
    (r) => r.separation!.HH! > r.separation!.HV!,
  ).length;
  const texts = { fontSize: 14, fill: "#334f50" };
  const paths: Record<"HH" | "HV", string[]> = { HH: [], HV: [] };
  for (const channel of ["HH", "HV"] as const) {
    let segment = "";
    let previous: string | null = null;
    for (const record of records) {
      const value = record.separation?.[channel];
      const gap =
        previous !== null &&
        Date.parse(record.utc) - Date.parse(previous) > 18 * 86400000;
      if (value == null || gap) {
        if (segment) paths[channel].push(segment);
        segment = "";
      }
      if (value != null)
        segment += `${segment ? "L" : "M"}${x(record.utc.slice(0, 10))},${y(value)} `;
      previous = record.utc;
    }
    if (segment) paths[channel].push(segment);
  }
  return (
    <section className="polarization-separation">
      <h3>
        {en
          ? "HH and HV: contrast around the shoreline"
          : "HH 與 HV：輪廓內外的對比"}
      </h3>
      <p>
        {en
          ? `HH has the larger spatial contrast on ${hhHigher} of ${pairs.length} paired observations. This does not establish better water-classification accuracy.`
          : `${pairs.length} 筆成對觀測中，HH 有 ${hhHigher} 筆呈現較大的空間對比；這不代表水體分類準確度較高。`}
      </p>
      <div className="chart-scroll" style={{ overflowX: "auto" }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ display: "block", width: "100%", minWidth: 640 }}
          role="img"
          aria-label={
            en
              ? "Calibrated HH and HV spatial contrast across the observed dates"
              : "各觀測日期的 HH 與 HV 校準影像空間對比"
          }
        >
          <text
            x={left}
            y="21"
            style={{ ...texts, fontSize: 16, fontWeight: 600 }}
          >
            {en ? "Standardized median contrast" : "標準化中位數對比"}
          </text>
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
            <g key={fraction}>
              <line
                x1={left}
                x2={width - right}
                y1={y(low + (high - low) * fraction)}
                y2={y(low + (high - low) * fraction)}
                stroke="#cdd8d4"
                strokeDasharray="3 5"
              />
              <text
                x={left - 12}
                y={y(low + (high - low) * fraction) + 5}
                textAnchor="end"
                style={texts}
              >
                {(low + (high - low) * fraction).toFixed(1)}
              </text>
            </g>
          ))}
          {(["HH", "HV"] as const).flatMap((channel) =>
            paths[channel].map((path, i) => (
              <path
                key={`${channel}-${i}`}
                d={path}
                fill="none"
                stroke={channel === "HH" ? "#225c67" : "#5d648f"}
                strokeWidth="2"
                strokeDasharray={channel === "HV" ? "5 4" : undefined}
              />
            )),
          )}
          {records.map((record) => (
            <g key={record.utc}>
              <title>
                {record.utc.slice(0, 10)} UTC · HH{" "}
                {record.separation?.HH?.toFixed(2) ?? "—"} · HV{" "}
                {record.separation?.HV?.toFixed(2) ?? "—"}
              </title>
              {record.separation?.HH != null && (
                <circle
                  cx={x(record.utc.slice(0, 10))}
                  cy={y(record.separation.HH)}
                  r="4"
                  fill="#225c67"
                />
              )}
              {record.separation?.HV != null && (
                <rect
                  x={x(record.utc.slice(0, 10)) - 4}
                  y={y(record.separation.HV) - 4}
                  width="8"
                  height="8"
                  fill="#fff"
                  stroke="#5d648f"
                  strokeWidth="2"
                />
              )}
            </g>
          ))}
          {[first, "2026-03-17", "2026-06-21", last]
            .filter(
              (date, i, all) =>
                date >= first && date <= last && all.indexOf(date) === i,
            )
            .map((date, i, all) => (
              <text
                key={date}
                x={x(date)}
                y={height - 20}
                textAnchor={
                  i === 0 ? "start" : i === all.length - 1 ? "end" : "middle"
                }
                style={texts}
              >
                {date}
              </text>
            ))}
        </svg>
      </div>
      <p className="chart-note">● HH · □ HV · n = {pairs.length}</p>
      <p className="chart-note">
        {en
          ? "(Ring median − interior median) ÷ pooled standard deviation, using calibrated dB values inside the OSM boundary and its 150–300 m outer ring. These regions are reference geometry, not verified water/land truth. Lines stop at missing observations and gaps; no browse-image brightness comparison is used."
          : "使用 OSM 輪廓內部與外側 150–300 m 環帶的校準 dB 值，計算（環帶中位數 − 內部中位數）÷ 合併標準差。這些區域是參考幾何，並非驗證過的水陸真值。缺值與觀測缺口不連線，也不以預覽圖的亮度拉伸比較。"}
      </p>
      <details>
        <summary>{en ? "View contrast values" : "查看各日期對比值"}</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{en ? "UTC date" : "UTC 日期"}</th>
                <th>HH</th>
                <th>HV</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.utc}>
                  <th scope="row">{record.utc.slice(0, 10)}</th>
                  <td>{record.separation?.HH?.toFixed(3) ?? "—"}</td>
                  <td>{record.separation?.HV?.toFixed(3) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

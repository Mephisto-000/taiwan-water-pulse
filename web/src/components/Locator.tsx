import type { Reservoir } from "../domain";
import type { Language } from "../i18n";

/** A lightweight coordinate locator; this is not a radar basemap. */
export default function Locator({
  reservoir,
  reservoirs = [reservoir],
  lang = "zh-TW",
}: {
  reservoir: Reservoir;
  reservoirs?: Reservoir[];
  lang?: Language;
}) {
  const en = lang === "en";
  const longitude = (reservoir.bbox[2] + reservoir.bbox[3]) / 2;
  const latitude = (reservoir.bbox[0] + reservoir.bbox[1]) / 2;
  const x = (value: number) => 46 + ((value - 120.5) / 1.5) * 248;
  const y = (value: number) => 186 - ((value - 24) / 1.4) * 158;
  return (
    <figure className="locator-shell" style={{ margin: 0 }}>
      <svg
        viewBox="0 0 320 232"
        role="img"
        aria-label={`${en ? "Reservoir coordinate locator" : "水庫經緯度定位"}: ${reservoir.name} · ${latitude.toFixed(4)}° N, ${longitude.toFixed(4)}° E`}
        style={{ display: "block", width: "100%", minWidth: 260 }}
      >
        <metadata>
          SI-generated coordinate diagram; coordinates from reservoir source
          metadata; no agency branding.
        </metadata>
        <rect x="0" y="0" width="320" height="232" rx="8" fill="#e8eeeb" />
        {[24, 24.5, 25].map((value) => (
          <g key={value}>
            <line
              x1="46"
              x2="294"
              y1={y(value)}
              y2={y(value)}
              stroke="#9cacaa"
              strokeDasharray="3 5"
            />
            <text
              x="8"
              y={y(value) + 4}
              style={{ fontSize: 16, fill: "#385b59" }}
            >
              {value}°
            </text>
          </g>
        ))}
        {[120.5, 121, 121.5, 122].map((value) => (
          <g key={value}>
            <line
              x1={x(value)}
              x2={x(value)}
              y1="28"
              y2="186"
              stroke="#9cacaa"
              strokeDasharray="3 5"
            />
            <text
              x={x(value)}
              y="211"
              textAnchor="middle"
              style={{ fontSize: 16, fill: "#385b59" }}
            >
              {value}°
            </text>
          </g>
        ))}
        {reservoirs.map((item) => {
          const cx = x((item.bbox[2] + item.bbox[3]) / 2);
          const cy = y((item.bbox[0] + item.bbox[1]) / 2);
          const selected = item.key === reservoir.key;
          return (
            <g key={item.key}>
              <circle
                cx={cx}
                cy={cy}
                r={selected ? 8 : 5}
                fill={selected ? "#175b64" : "#718b88"}
                stroke="#fff"
                strokeWidth="2"
              />
              <title>{en ? item.name : item.name_zh}</title>
            </g>
          );
        })}
        <text
          x="292"
          y="20"
          textAnchor="end"
          style={{ fontSize: 16, fill: "#284e4d" }}
        >
          ↑ N
        </text>
      </svg>
      <figcaption>
        {latitude.toFixed(4)}° N · {longitude.toFixed(4)}° E<br />
        {en
          ? "SI-generated coordinate locator · no basemap"
          : "SI 生成經緯度示意 · 無底圖"}
      </figcaption>
    </figure>
  );
}

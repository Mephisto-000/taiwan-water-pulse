import { useEffect, useMemo, useRef, useState } from "react";
import {
  canPublishArea,
  hasRelativeAnalysis,
  relativeThresholdDb,
  type NumericalArchive,
  type RelativeNumericalArchive,
} from "../numerical";
import type { Language } from "../i18n";
import { StatisticsSummary } from "./AnalysisCharts";
import { candidateFrequency } from "./radar-analysis";

export default function FrequencyMap({
  archive,
  lang,
}: {
  archive: NumericalArchive;
  lang: Language;
}) {
  const complete = archive.series.records.every(
    (record) => archive.analysis?.frames[record.utc.slice(0, 10)] !== undefined,
  );
  if (hasRelativeAnalysis(archive) && canPublishArea(archive) && !complete)
    return (
      <p role="status">
        {lang === "en"
          ? "Loading all observations for the annual frequency map…"
          : "正在載入全年觀測，完成後顯示水面出現頻率…"}
      </p>
    );
  return hasRelativeAnalysis(archive) && canPublishArea(archive) ? (
    <RelativeFrequencyMap archive={archive} lang={lang} />
  ) : null;
}

function RelativeFrequencyMap({
  archive,
  lang,
}: {
  archive: RelativeNumericalArchive;
  lang: Language;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pointer, setPointer] = useState<{
    archive: NumericalArchive;
    index: number;
  } | null>(null);
  const eligible = canPublishArea(archive);
  const analysis = archive.meta.analysis;
  const ratio = analysis.threshold_ratio;
  const frequencies = useMemo(
    () =>
      eligible
        ? candidateFrequency(
            Object.values(archive.analysis.frames),
            archive.analysis.mask,
            Object.keys(archive.analysis.frames).map((date) => ({
              nominal: relativeThresholdDb(
                ratio,
                analysis.land_median_db_by_date[date],
              ),
              low: relativeThresholdDb(
                analysis.sensitivity_ratios[0],
                analysis.land_median_db_by_date[date],
              ),
              high: relativeThresholdDb(
                analysis.sensitivity_ratios[1],
                analysis.land_median_db_by_date[date],
              ),
            })),
          )
        : null,
    [archive, eligible, analysis, ratio],
  );
  const { width, height } = analysis.grid;
  const en = lang === "en";
  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context || !frequencies) return;
    const image = context.createImageData(width, height);
    for (let i = 0; i < width * height; i++) {
      const value = frequencies.frequency[i];
      const valid = Number.isFinite(value);
      image.data[i * 4] = valid ? Math.round(227 - 208 * value) : 233;
      image.data[i * 4 + 1] = valid ? Math.round(241 - 143 * value) : 236;
      image.data[i * 4 + 2] = valid ? Math.round(248 - 108 * value) : 232;
      image.data[i * 4 + 3] = 255;
    }
    context.putImageData(image, 0, 0);
  }, [frequencies, width, height]);
  if (!frequencies) return null;
  const pixel = pointer?.archive === archive ? pointer.index : null;
  return (
    <section className="frequency-map">
      <h3>{en ? "Where candidate water recurs" : "候選水體反覆出現的位置"}</h3>
      <p>
        {en
          ? `${analysis.grid.pixel_side_m} m analysis grid across ${frequencies.observationCount} observed passes, not a long-term climate statistic.`
          : `${analysis.grid.pixel_side_m} m 分析格網，依 ${frequencies.observationCount} 次通過統計，並非長期氣候值。`}
      </p>
      <StatisticsSummary archive={archive} lang={lang} />
      <figure style={{ margin: 0 }}>
        <div
          className="frequency-stage"
          style={{ position: "relative", width: "100%", maxWidth: 600 }}
        >
          <canvas
            ref={canvas}
            width={width}
            height={height}
            role="img"
            aria-label={
              en
                ? "Single-hue map of candidate-water frequency inside the OSM reference boundary"
                : "OSM 參考邊界內的候選水體出現比例，單色相顯示"
            }
            style={{
              display: "block",
              width: "100%",
              imageRendering: "pixelated",
            }}
            onPointerLeave={() => setPointer(null)}
            onPointerMove={(event) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              const x = Math.floor(
                ((event.clientX - bounds.left) / bounds.width) * width,
              );
              const y = Math.floor(
                ((event.clientY - bounds.top) / bounds.height) * height,
              );
              setPointer(
                x >= 0 && x < width && y >= 0 && y < height
                  ? { archive, index: y * width + x }
                  : null,
              );
            }}
          />
          <svg
            viewBox={`0 0 ${width} ${height}`}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
            }}
            aria-hidden="true"
          >
            {analysis.outline_pixel_rings.map((ring, i) => (
              <path
                key={i}
                d={
                  ring
                    .map(([x, y], j) => `${j ? "L" : "M"}${x},${y}`)
                    .join(" ") + "Z"
                }
                fill="none"
                stroke="#174b58"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          <span
            className="frequency-north"
            style={{
              position: "absolute",
              top: 14,
              right: 14,
              color: "#174b58",
              fontWeight: 700,
            }}
          >
            ↑ N
          </span>
        </div>
        <figcaption>
          <div className="radar-colorbar">
            <span>0%</span>
            <span
              style={{
                flex: 1,
                height: 12,
                background: "linear-gradient(to right,#e3f1f8,#13628c)",
              }}
            />
            <span>100%</span>
          </div>
          <p className="chart-note">
            {en
              ? `Fraction of valid observations with HH power below ${Math.round(ratio * 100)}% of that date's land-ring median. Missing pixels are excluded; gray pixels are outside the mask or have no valid observations. This is candidate water, not verified permanent water.`
              : `有效觀測中 HH 功率低於當日陸地環帶中位數 ${Math.round(ratio * 100)}% 的比例。缺值不列入分母；灰色表示遮罩外或沒有有效觀測。這是候選水體分類，並非經驗證的永久水域。`}
          </p>
          <p className="pixel-readout">
            {pixel !== null && frequencies.validCounts[pixel] > 0
              ? `${(frequencies.frequency[pixel] * 100).toFixed(0)}% · ${en ? "threshold sensitivity" : "門檻敏感度"} ${(frequencies.low[pixel] * 100).toFixed(0)}–${(frequencies.high[pixel] * 100).toFixed(0)}% · n = ${frequencies.validCounts[pixel]}`
              : en
                ? `Move over the map to inspect frequency and its ${Math.round(analysis.sensitivity_ratios[0] * 100)}–${Math.round(analysis.sensitivity_ratios[1] * 100)}% threshold-ratio sensitivity.`
                : `移至圖上查看比例及門檻比值 ${Math.round(analysis.sensitivity_ratios[0] * 100)}–${Math.round(analysis.sensitivity_ratios[1] * 100)}% 的敏感度範圍。`}
          </p>
        </figcaption>
      </figure>
    </section>
  );
}

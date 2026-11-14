// SI-assisted exploratory control; this does not change published estimates.
import { useId, useMemo, useState } from "react";
import type { Language } from "../i18n";
import {
  canPublishArea,
  estimateRelativeArea,
  hasRelativeAnalysis,
  relativeThresholdDb,
  type NumericalArchive,
} from "../numerical";
import RadarViewer from "./RadarViewer";

export interface ThresholdExperimentProps {
  archive: NumericalArchive;
  date: string;
  lang: Language;
}

export default function ThresholdExperiment({
  archive,
  date,
  lang,
}: ThresholdExperimentProps) {
  const en = lang === "en";
  const inputId = useId();
  const publishedRatio = archive.meta.analysis?.threshold_ratio ?? 0.6;
  const [ratio, setRatio] = useState(publishedRatio);
  const frame = archive.analysis?.frames[date];
  const mask = archive.analysis?.mask;
  const landMedian = archive.meta.analysis?.land_median_db_by_date[date];
  const pixelArea = archive.meta.analysis?.pixel_area_m2;
  const result = useMemo(() => {
    if (!frame || !mask || landMedian == null || pixelArea == null)
      return { estimate: null, error: false };
    try {
      return {
        estimate: estimateRelativeArea(
          frame,
          mask,
          ratio,
          landMedian,
          pixelArea,
        ),
        error: false,
      };
    } catch {
      return { estimate: null, error: true };
    }
  }, [frame, mask, ratio, landMedian, pixelArea]);
  if (!canPublishArea(archive) || !hasRelativeAnalysis(archive)) return null;
  const threshold =
    landMedian == null ? null : relativeThresholdDb(ratio, landMedian);
  return (
    <div className="threshold-experiment">
      <p className="threshold-experiment-note">
        {en
          ? "Try a different image-only definition. These calculations do not update the published area, grade or validation report."
          : "試著改變影像門檻，觀察定義如何影響結果。以下是試算，不會更新發布面積、分級或驗證報告。"}
      </p>
      <div className="threshold-experiment-control">
        <label htmlFor={inputId}>
          {en ? "Fraction of surrounding-land power" : "周邊陸地功率比值"}
        </label>
        <output htmlFor={inputId} className="threshold-experiment-value">
          {Math.round(ratio * 100)}%
        </output>
        <input
          id={inputId}
          type="range"
          min={0.3}
          max={0.9}
          step={0.01}
          value={ratio}
          aria-valuetext={
            en
              ? `${Math.round(ratio * 100)} percent of the date's land median power`
              : `當日陸地功率中位數的 ${Math.round(ratio * 100)}%`
          }
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next))
              setRatio(Math.max(0.3, Math.min(0.9, next)));
          }}
        />
        <button onClick={() => setRatio(publishedRatio)}>
          {en ? "Reset trial" : "重設試算"}
        </button>
      </div>
      {result.estimate ? (
        <dl className="inspector-metrics">
          <div className="inspector-metric">
            <dt>{en ? "Trial area" : "試算面積"}</dt>
            <dd>
              <strong>{result.estimate.area.toFixed(3)} km²</strong>
            </dd>
          </div>
          <div className="inspector-metric">
            <dt>{en ? "Ratio ±10 pp" : "比值 ±10 個百分點"}</dt>
            <dd>
              {result.estimate.low.toFixed(3)}–{result.estimate.high.toFixed(3)}{" "}
              km²
            </dd>
          </div>
          <div className="inspector-metric">
            <dt>{en ? "Trial HH threshold" : "試算 HH 門檻"}</dt>
            <dd>{threshold?.toFixed(2) ?? "—"} dB</dd>
          </div>
        </dl>
      ) : (
        <p role={result.error ? "alert" : "status"}>
          {result.error
            ? en
              ? "This trial could not be calculated from the available grid."
              : "目前格網無法完成這次試算。"
            : en
              ? "Loading the native analysis grid for this date…"
              : "正在載入當日原生分析格網…"}
        </p>
      )}
      <div className="threshold-experiment-preview">
        <RadarViewer
          archive={archive}
          date={date}
          polarization="HH"
          lang={lang}
          ratio={ratio}
          showWater
          showOutline
        />
      </div>
      <p className="threshold-experiment-note">
        {en
          ? `The estimate uses the ${archive.meta.analysis.grid.pixel_side_m} m analysis grid. Move or touch the image for display-pixel dB values; request HV in the main viewer to make its readings available too.`
          : `面積依 ${archive.meta.analysis.grid.pixel_side_m} m 分析格網計算。移動或觸碰影像可讀取顯示像素的 dB；在主影像切換至 HV 載入後，也能查看其讀值。`}
      </p>
    </div>
  );
}

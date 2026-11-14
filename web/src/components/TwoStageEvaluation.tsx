import { dataUrl } from "../domain";
import type { Language } from "../i18n";
import type { ReservoirEstimation } from "../storageEstimationTypes";

export default function TwoStageEvaluation({
  result,
  lang,
}: {
  result: ReservoirEstimation | null;
  lang: Language;
}) {
  const en = lang === "en";
  if (!result?.eligible || !result.full_pool || !result.evaluation)
    return (
      <p role="status">
        {en
          ? "A complete evaluation and at least three full-pool dates are required. Estimates are unavailable."
          : "必須先完成評估，且至少有 3 個滿庫日期，目前不提供估計。"}
      </p>
    );
  const pool = result.full_pool;
  const { high, numeric, baselines, linear_comparison } = result.evaluation;
  return (
    <div className="two-stage-evaluation">
      <p>
        {en
          ? "DEF-06: all dates at ≥99.5% official storage define the full-pool area band (quality flags retained). Sample standard deviation uses ddof=1. The lower edge is μ−2σ; at or above it, no numeric storage estimate is made."
          : "DEF-06：官方蓄水率 ≥99.5% 的所有日期用來訂滿庫面積範圍，品質旗標仍保留。標準差採 ddof=1，下緣固定為 μ−2σ；面積達到下緣時，不提供單一蓄水率估計。"}
      </p>
      <p>
        n={pool.n} · μ={pool.mean_area_km2.toFixed(6)} km² · σ=
        {pool.sample_sd_area_km2.toFixed(6)} km² · μ−2σ=
        {pool.lower_2sigma_km2.toFixed(6)} km²
      </p>
      <p>
        {en
          ? "DEF-11: below the band, interpolate between low-water drawdown calibration pairs and the last drawdown observation still in the band. Below the smallest calibrated area, extrapolate using the lowest two area points. Estimates are limited to 0–100%; raw values and extrapolation flags are retained."
          : "DEF-11：範圍以外，用退水期的低水位校正點，加上退水期最後一筆仍在範圍內的觀測，依面積分段線性內插。小於最小校正面積時，用面積最低兩點外插。結果限制在 0–100%，並保留原始值與外插標示。"}
      </p>
      <h3>{en ? "DEF-12: high-water classification" : "DEF-12：高水位判別"}</h3>
      <p>
        {en
          ? `${high.n} high-area dates; actual storage lower bound ${high.actual_min_pct.toFixed(1)}%. ${high.correct_count} match this descriptive bound; false high ${high.false_high_count}, false low ${high.false_low_count}.`
          : `判為偏高 ${high.n} 次，實際蓄水率下限 ${high.actual_min_pct.toFixed(1)}%；${high.correct_count} 次符合此描述性下限。誤判為偏高 ${high.false_high_count} 次，誤判為低水位 ${high.false_low_count} 次。`}
      </p>
      <p>
        {en
          ? "The lower bound is the minimum official storage among the high-area dates themselves. Agreement is descriptive and partly circular; it is not independent classification accuracy."
          : "此下限就是判為偏高日期的官方蓄水率最小值，因此符合下限的結果部分來自定義本身，不能當成獨立的分類準確度。"}
      </p>
      {high.misclassified.map((p) => (
        <p key={p.utc}>
          {p.local.slice(0, 10)} · {en ? "official" : "官方"}{" "}
          {p.actual_pct.toFixed(1)}% ·{" "}
          {en ? "misclassified outside the high band" : "誤判為滿庫範圍以外"}
          {p.qa.length
            ? en
              ? " · quality flag retained"
              : " · 保留品質旗標"
            : ""}
        </p>
      ))}
      <h3>
        {en
          ? "DEF-12: numeric estimates, leave one out"
          : "DEF-12：數字估計，逐一留出"}
      </h3>
      <p>
        n={numeric.n} · {en ? "mean absolute error" : "平均絕對誤差"}{" "}
        {numeric.mae_pp.toFixed(1)} {en ? "percentage points" : "個百分點"} ·{" "}
        {en ? "maximum absolute error" : "最大絕對誤差"}{" "}
        {numeric.max_abs_error_pp.toFixed(1)}{" "}
        {en ? "percentage points" : "個百分點"}
      </p>
      <div className="estimation-table-scroll">
        <table>
          <thead>
            <tr>
              <th>{en ? "Held-out date" : "留出日期"}</th>
              <th>{en ? "Official %" : "官方 %"}</th>
              <th>{en ? "Estimate %" : "估計 %"}</th>
              <th>{en ? "Absolute error (pp)" : "絕對誤差（百分點）"}</th>
              <th>{en ? "Extrapolation" : "外插"}</th>
            </tr>
          </thead>
          <tbody>
            {numeric.folds.map((f) => (
              <tr key={f.utc}>
                <td>{f.local.slice(0, 10)}</td>
                <td>{f.actual_pct.toFixed(1)}</td>
                <td>{f.predicted_pct.toFixed(1)}</td>
                <td>{f.abs_error_pp.toFixed(1)}</td>
                <td>
                  {f.extrapolated ? (en ? "Yes" : "是") : en ? "No" : "否"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        {en
          ? "Each low-water drawdown date is removed from its calibration fold. The full-pool threshold and anchor stay fixed. High-water classification and numeric error are reported separately; they are never averaged together."
          : "每次移除一個低水位退水日期，使用其餘校正點估計該日；滿庫門檻與錨點固定。高水位判別與數字誤差分開報告，不合成一個數字。"}
      </p>
      <p>
        {en
          ? "Chart points use the complete calibration set; calibration points therefore pass through official values. Error bars show ± the largest observed leave-one-out error, limited to 0–100%. This descriptive range is neither a confidence interval nor a guarantee for a new date. Points outside the drawdown are not a second low-water validation."
          : "圖上採用完整校正資料，因此校正點會通過官方值。誤差線是 ± 本庫逐一留出最大絕對誤差，限制在 0–100%；這是描述性範圍，不是信賴區間，也不保證新日期落在其中。退水期以外的套用結果，不等於第二次低水位驗證。"}
      </p>
      <h3>
        {en ? "DEF-07: first detected shrinkage" : "DEF-07：最早偵測到水面縮小"}
      </h3>
      {[
        ["2σ", result.first_detection.two_sigma],
        ["3σ", result.first_detection.three_sigma],
      ].map(([label, value]) => {
        const p = typeof value === "object" ? value : null;
        return (
          <p key={String(label)}>
            {String(label)}：
            {p
              ? `${p.local.slice(0, 10)} · ${p.storage_pct.toFixed(1)}%`
              : en
                ? "Not detected"
                : "未偵測到"}
          </p>
        );
      })}
      <details>
        <summary>
          {en ? "Baselines and linear comparison" : "基準與直線校正對照"}
        </summary>
        <p>
          {en
            ? "Baselines below identify their evaluation cohort. Twelve-day persistence is not a current gauge reading. Only compare errors for the same cohort."
            : "下列基準分別列出評估樣本；沿用 12 天前官方值不等於即時水位計。只有相同樣本的誤差才適合直接比較。"}
        </p>
        <div className="estimation-table-scroll">
          <table>
            <thead>
              <tr>
                <th>{en ? "Baseline / cohort" : "基準／樣本"}</th>
                <th>n</th>
                <th>MAE ({en ? "pp" : "百分點"})</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  [
                    "calibration_mean",
                    en
                      ? "Calibration mean / low-water LOO"
                      : "校正期平均／低水位逐一留出",
                  ],
                  [
                    "previous_official_low_water",
                    en
                      ? "Previous official value / same low-water dates"
                      : "前次官方值／同一組低水位日期",
                  ],
                  [
                    "previous_official",
                    en
                      ? "Previous official value / exactly 12 days apart"
                      : "前次官方值／嚴格相隔 12 天",
                  ],
                  [
                    "archive_mean",
                    en
                      ? "Full-archive mean / all dates (in-sample)"
                      : "全年平均／所有日期（樣本內）",
                  ],
                ] as const
              ).map(
                ([key, label]) =>
                  baselines[key] && (
                    <tr key={key}>
                      <td>{label}</td>
                      <td>{baselines[key].n}</td>
                      <td>{baselines[key].mae_pp?.toFixed(1) ?? "—"}</td>
                    </tr>
                  ),
              )}
            </tbody>
          </table>
        </div>
        <p>
          {en
            ? "First-N linear fits, all N=3…12, without selecting the best result. Later dates are evaluated; model values are not clamped."
            : "前 N 筆直線校正：N=3…12 全列，不挑最佳結果。評估後續日期，模型數值不截斷。"}
        </p>
        <div className="estimation-table-scroll">
          <table>
            <thead>
              <tr>
                <th>N</th>
                <th>{en ? "Evaluation n" : "檢驗 n"}</th>
                <th>MAE</th>
                <th>{en ? "Mean baseline MAE" : "校正平均基準 MAE"}</th>
                <th>{en ? "Extrapolated n" : "外插 n"}</th>
              </tr>
            </thead>
            <tbody>
              {linear_comparison.map((row) => (
                <tr key={row.n}>
                  <td>{row.n}</td>
                  <td>{row.evaluation_n}</td>
                  <td>{row.mae_pp?.toFixed(1) ?? "—"}</td>
                  <td>{row.calibration_mean_mae_pp?.toFixed(1) ?? "—"}</td>
                  <td>{row.extrapolated_n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p>
        {en
          ? "Only one drawdown, five low-water dates per eligible reservoir, and full-year full-pool samples. Adjacent dates are correlated. This is exploratory evaluation, not independent validation."
          : "這一年只有一次退水，每座可估計水庫僅 5 個低水位日期，滿庫範圍使用全年樣本，相鄰日期彼此相關。這是探索性檢驗，並非獨立驗證。"}
      </p>
      <a
        href={dataUrl("storage-estimation.json")}
        target="_blank"
        rel="noreferrer"
      >
        {en
          ? "Definitions and recomputed results (JSON)"
          : "定義與重算結果（JSON）"}
      </a>
    </div>
  );
}

import type { Language } from "../i18n";
import type { StorageEstimationReport } from "../storageEstimationTypes";

export default function StorageExplanation({
  report,
  lang,
  onMethods,
  onEstimate,
  canEstimate,
}: {
  report: StorageEstimationReport | null;
  lang: Language;
  onMethods: () => void;
  onEstimate: () => void;
  canEstimate: boolean;
}) {
  const en = lang === "en";
  const results = Object.values(report?.reservoirs ?? {}).filter(
    (r) => r.eligible && r.evaluation,
  );
  const count = results.reduce((sum, r) => sum + r.evaluation!.numeric.n, 0);
  const mae = count
    ? results.reduce(
        (sum, r) =>
          sum + r.evaluation!.numeric.mae_pp * r.evaluation!.numeric.n,
        0,
      ) / count
    : null;
  const lower = results.map((r) => r.evaluation!.high.actual_min_pct);
  const detection = results.flatMap((r) =>
    r.first_detection.two_sigma
      ? [r.first_detection.two_sigma.storage_pct]
      : [],
  );
  const max = results.length
    ? Math.max(...results.map((r) => r.evaluation!.numeric.max_abs_error_pp))
    : null;
  const highRange = lower.length
    ? `${Math.min(...lower).toFixed(1)}–${Math.max(...lower).toFixed(1)}%`
    : "—";
  const detectionRange = detection.length
    ? `${Math.min(...detection).toFixed(1)}–${Math.max(...detection).toFixed(1)}%`
    : "—";
  return (
    <details className="chart-reading-notes storage-explanation">
      <summary>
        {en
          ? "Can radar tell us how much water is left?"
          : "衛星看得到水面變化，但能知道水庫剩多少水嗎？"}
      </summary>
      <ol>
        <li>
          <button type="button" className="text-button" onClick={onMethods}>
            {en
              ? "Grade: is there a signal worth using?"
              : "Grade 訊號：有沒有值得使用的訊號？"}
          </button>
          <p>
            {en
              ? "Compare radar area with the official water level, and check how much the result moves when the classification threshold changes. Baoshan II and Liyutan have a stable signal; Feitsui changes too little and Shimen cannot be resolved."
              : "比較雷達面積與官方水位，並檢查換一個分類門檻會差多少。寶二與鯉魚潭有穩定的訊號；翡翠的變化太小，石門分辨不出來。"}
          </p>
        </li>
        <li>
          <button
            type="button"
            className="text-button"
            disabled={!canEstimate}
            onClick={onEstimate}
          >
            {en
              ? "Align: with a signal, can storage be estimated?"
              : "Align 校正：有訊號，就能估水量嗎？"}
          </button>
          <p>
            {en
              ? "Calibrate radar area against official readings, then estimate other dates."
              : "拿官方觀測來校正雷達面積，再估其他日期。"}
          </p>
          {mae !== null ? (
            <>
              <p>
                {en
                  ? `Not at high water: above the observed reservoir-specific bounds of ${highRange}, radar area barely moves. All radar can say is “roughly full”.`
                  : `高水位不行：兩庫觀察到的界線約在 ${highRange}，高於各庫界線時雷達面積幾乎不動，只能說「大致是滿的」。`}
              </p>
              <p>
                {en
                  ? `At low water, the ${count} leave-one-out dates are off by ${mae.toFixed(1)} percentage points on average. A high grade means area follows water level overall; it does not mean storage can be estimated at every level.`
                  : `低水位可以：${count} 次逐一留出的估計，平均差 ${mae.toFixed(1)} 個百分點。評級高只代表面積整體上跟著水位變，不代表每個水位都估得出來。`}
              </p>
              <p>
                {en
                  ? `Answer: radar area becomes more useful as water recedes. It first detects shrinkage at ${detectionRange} storage in these two reservoirs. Low-water estimates differ by ${mae.toFixed(1)} points on average, with a maximum of ${max!.toFixed(1)} points. These are observed errors, not a ± guarantee.`
                  : `答案：水庫越缺水，雷達面積越有用。這兩庫在蓄水率降到 ${detectionRange} 時第一次看出水面縮小。之後低水位估計平均差 ${mae.toFixed(1)} 個百分點，單次最大 ${max!.toFixed(1)} 個百分點；這是已觀察到的誤差，不是 ± 範圍保證。`}
              </p>
            </>
          ) : (
            <p>
              {en
                ? "Recomputed evaluation is loading or unavailable; no accuracy claim is shown."
                : "重算評估尚未載入或暫時無法使用，目前不顯示準確度數字。"}
            </p>
          )}
          <p>
            {en
              ? "Radar cannot tell 100% from 80% and cannot replace a gauge. Its use is where no current gauge data exist. This year contains a single drawdown; none of this has been tested on a second one. Full-year full-pool samples define the band, and neighbouring dates are correlated: this is exploratory evaluation, not independent validation."
              : "它分不出 100% 和 80%，也不能取代水位計。它的用處在沒有即時水位資料的地方。這一年只有一次退水，以上都還沒有經過下一次退水的檢驗。滿庫範圍使用整年樣本，相鄰日期也彼此相關：這是探索性檢驗，並非獨立驗證。"}
          </p>
        </li>
      </ol>
    </details>
  );
}

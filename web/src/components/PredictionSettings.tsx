import { useEffect, useRef } from "react";
import { formatAcquisitionDate } from "../domain";
import type { Language } from "../i18n";
import type { StoragePrediction } from "../prediction";
import type {
  EstimationMethod,
  ReservoirEstimation,
} from "../storageEstimationTypes";
import TwoStageEvaluation from "./TwoStageEvaluation";

export default function PredictionSettings({
  open,
  onClose,
  lang,
  pairCount,
  calibrationCount,
  onSampleCountChange,
  prediction,
  method = "linear",
  onMethodChange,
  estimation = null,
  grade = "A",
}: {
  open: boolean;
  onClose: () => void;
  lang: Language;
  pairCount: number;
  calibrationCount: number;
  onSampleCountChange: (count: number) => void;
  prediction: StoragePrediction | null;
  method?: EstimationMethod;
  onMethodChange?: (method: EstimationMethod) => void;
  estimation?: ReservoirEstimation | null;
  grade?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const en = lang === "en";
  useEffect(() => {
    const element = dialog.current;
    if (open && element && !element.open) element.showModal();
    else if (!open && element?.open) element.close();
    return () => {
      if (element?.open) element.close();
    };
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className="prediction-dialog"
      aria-labelledby="prediction-method-title"
      onCancel={onClose}
      onClose={onClose}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.target === event.currentTarget &&
          (event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom)
        )
          onClose();
      }}
    >
      <div className="prediction-dialog-header">
        <h2 id="prediction-method-title">
          {en ? "Adjust prediction method" : "調整估計方法"}
        </h2>
        <button type="button" onClick={onClose} autoFocus>
          {en ? "Close" : "關閉"}
        </button>
      </div>
      {grade !== "A" ? (
        <p role="status">
          {grade === "B"
            ? en
              ? "Grade B: the signal is not sufficiently stable for storage estimation. Both two-stage and linear estimates are disabled; Feitsui's observed area variation is too small."
              : "B 級：訊號尚不足以穩定估計蓄水率；翡翠的面積變化太小，兩段式與直線校正都不提供估計。"
            : grade === "C"
              ? en
                ? "Grade C: water-level changes cannot be reliably resolved from radar area. Both two-stage and linear estimates are disabled."
                : "C 級：雷達面積無法可靠分辨水位變化，兩段式與直線校正都不提供估計。"
              : en
                ? "Published grade is unavailable. Estimates remain disabled until the archive is loaded."
                : "尚未取得發布等級，觀測資料完整載入前不提供估計。"}
        </p>
      ) : (
        <>
          <label>
            {en ? "Estimation method" : "估計方法"}
            <select
              value={method}
              onChange={(event) =>
                onMethodChange?.(event.target.value as EstimationMethod)
              }
            >
              <option value="two-stage">
                {en ? "Two-stage (default)" : "兩段式（預設）"}
              </option>
              <option value="linear">
                {en
                  ? "First-N linear calibration (comparison)"
                  : "前 N 筆直線校正（對照）"}
              </option>
            </select>
          </label>
          {method === "two-stage" ? (
            <TwoStageEvaluation result={estimation} lang={lang} />
          ) : (
            <>
              <p>
                {en
                  ? "Method: linear alignment of SAR area to storage. Settings apply immediately; changing sample count changes both calibration and evaluation dates."
                  : "方法：SAR 面積與蓄水率的線性校正。設定立即生效；調整點數會同時改變校正期與檢驗期。"}
              </p>
              <label>
                {en ? "First calibration pairs" : "前幾個有效配對用於校正"}{" "}
                <select
                  value={calibrationCount}
                  onChange={(event) =>
                    onSampleCountChange(Number(event.target.value))
                  }
                >
                  {Array.from(
                    { length: Math.max(0, pairCount - 5) },
                    (_, i) => i + 3,
                  ).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                {en
                  ? "HH area → storage by linear calibration. Orange squares and dashed lines are estimates on SAR dates, not future forecasts. The shaded dates are calibration; later dates are evaluation. Existing area-method choices used this archive, so this is exploratory evaluation, not independent validation."
                  : "以 HH 水面積線性校正蓄水率。橘色方點與虛線是 SAR 觀測日的估計，不是未來預報。陰影內為校正期，之後才用於檢驗。既有面積方法曾使用此資料集選擇參數，因此這是探索性檢驗，並非獨立驗證。"}
              </p>
              <p>
                {en
                  ? "The storage axis stays at 0–100%. Lines are clipped to that panel; boundary triangles mark out-of-range predictions. Hover a triangle for its original value. Model values and error metrics are never clamped."
                  : "蓄水率軸固定為 0–100%。線條只畫在此範圍內，超界預估以邊界三角形標示；移到標記上可看原始數值。模型數值與誤差計算不截斷。"}
              </p>
              {prediction ? (
                <>
                  <p>
                    {en ? "Calibration" : "校正"}:{" "}
                    {formatAcquisitionDate(
                      prediction.training[0].utc,
                      true,
                      lang,
                    )}{" "}
                    –{" "}
                    {formatAcquisitionDate(
                      prediction.training.at(-1)!.utc,
                      true,
                      lang,
                    )}{" "}
                    ({calibrationCount}) ·{" "}
                    {en ? "Later evaluation" : "後續檢驗"}: n=
                    {prediction.evaluation.n}, MAE=
                    {prediction.evaluation.mae?.toFixed(1)}{" "}
                    {en ? "pp" : "百分點"}, RMSE=
                    {prediction.evaluation.rmse?.toFixed(1)}{" "}
                    {en ? "pp" : "百分點"}
                  </p>
                  <p>
                    {en ? "Outside calibration area range" : "面積超出校正範圍"}
                    :{" "}
                    {
                      prediction.points.filter(
                        (p) => !p.training && p.extrapolated,
                      ).length
                    }{" "}
                    ·{" "}
                    {en
                      ? "Estimates outside 0–100% (raw values retained)"
                      : "預估超出 0–100%（保留原值）"}
                    :{" "}
                    {
                      prediction.points.filter(
                        (p) => p.predicted < 0 || p.predicted > 100,
                      ).length
                    }
                  </p>
                  {(prediction.storageSpan < 10 || prediction.slope <= 0) && (
                    <p role="status">
                      {en
                        ? "Weak calibration: the first samples cover less than 10 percentage points of storage or yield a non-positive slope. Dry-period estimates may be unreliable. Try a longer initial period; evaluation changes with it."
                        : "校正限制：前幾點蓄水率變幅不足 10 個百分點，或斜率非正值，枯水期估計可能不可靠。可增加前段樣本，但檢驗期間也會跟著改變。"}
                    </p>
                  )}
                </>
              ) : (
                <p role="status">
                  {en
                    ? "Insufficient area variation or paired samples to fit this model."
                    : "面積變化或有效配對不足，無法校正。"}
                </p>
              )}
              {estimation?.eligible && (
                <details>
                  <summary>
                    {en
                      ? "Recomputed evaluation and all N comparisons"
                      : "重算評估與各 N 對照"}
                  </summary>
                  <TwoStageEvaluation result={estimation} lang={lang} />
                </details>
              )}
            </>
          )}
        </>
      )}
    </dialog>
  );
}

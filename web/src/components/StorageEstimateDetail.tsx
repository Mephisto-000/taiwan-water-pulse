import type { Language } from "../i18n";
import type { EstimationPoint } from "../storageEstimationTypes";

/** Keep categorical abstention distinct from the official gauge value beside it. */
export default function StorageEstimateDetail({
  point,
  lang,
}: {
  point: EstimationPoint;
  lang: Language;
}) {
  const en = lang === "en";
  return (
    <section
      className="storage-estimate-detail"
      aria-label={en ? "Two-stage SAR estimate" : "SAR 兩段式估計"}
    >
      <h3>{en ? "Align: two-stage estimate" : "Align：兩段式估計"}</h3>
      {point.kind === "high" ? (
        <>
          <strong>
            {en ? "High; finer levels unresolved" : "偏高，分不出更細"}
          </strong>
          <p>
            {en
              ? "No point estimate. The band describes observed high-area dates, not a confidence interval."
              : "不提供單一蓄水率估計。色帶描述這一年高面積日期的實際範圍，不是信賴區間。"}
          </p>
        </>
      ) : (
        <>
          <strong>{point.estimate_pct?.toFixed(1)}%</strong>
          <p>
            {point.range_pct?.map((n) => n.toFixed(1)).join("–")}% ·{" "}
            {en
              ? "descriptive error range, not a confidence interval"
              : "描述性誤差範圍，非信賴區間"}
          </p>
          <p>
            {point.calibration
              ? en
                ? "Calibration point; this fit is not a held-out result."
                : "校正點；此估計不是逐一留出的檢驗結果。"
              : en
                ? "Historical application of the calibrated model."
                : "將校正後模型套用於這次歷史觀測。"}
          </p>
          {point.extrapolated && (
            <p>
              {en
                ? "Extrapolation beyond calibration area"
                : "面積超出校正範圍，屬外插"}
            </p>
          )}
          {point.clamped && (
            <p>
              {en
                ? "Estimate limited to 0–100%; raw value"
                : "估計限制在 0–100%；原始值"}
              ：{point.raw_estimate_pct?.toFixed(1)}%
            </p>
          )}
        </>
      )}
      {point.qa.length > 0 && (
        <p>
          †{" "}
          {en
            ? "Quality flag retained; interpret cautiously."
            : "保留品質旗標，請審慎解讀。"}
        </p>
      )}
    </section>
  );
}

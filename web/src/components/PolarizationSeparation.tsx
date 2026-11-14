import type { Language } from "../i18n";
import { canPublishArea, type NumericalArchive } from "../numerical";
import { readScientificStats } from "../science";
import { signed } from "../workspace";

/** Drawdown contrast is distinct from spatial separation or classification accuracy. */
export default function PolarizationSeparation({
  archive,
  lang,
}: {
  archive: NumericalArchive;
  lang: Language;
}) {
  const comparison = readScientificStats(
    archive.series.stats,
  ).polarization_comparison;
  if (!canPublishArea(archive) || !comparison) return null;
  const en = lang === "en";
  const format = (date: string) =>
    new Intl.DateTimeFormat(en ? "en-GB" : "zh-TW", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(date));
  const number = (value: number | null) =>
    value == null ? "—" : value.toFixed(2);
  const hh = comparison.channels.HH.change_pct,
    hv = comparison.channels.HV.change_pct;
  const clearer =
    hh != null && hv != null && hh < 0 && Math.abs(hh) > Math.abs(hv);
  return (
    <div className="polarization-separation">
      <h3>
        {en ? "Which polarization shows the change?" : "哪個極化能凸顯變化？"}
      </h3>
      <p>
        {clearer
          ? en
            ? "HH shows a larger decrease in dark area during this drawdown; HV changes less."
            : "這段退水期間，HH 的暗色範圍縮小較多，HV 的變化較小。"
          : en
            ? "The two channels respond differently. Compare their measured changes below."
            : "兩個通道的反應不同，可由下列實際變化比較。"}
      </p>
      <p className="inspector-secondary">
        {format(comparison.reference_utc)} → {format(comparison.selected_utc)}
      </p>
      <table className="science-table polarization-table">
        <thead>
          <tr>
            <th>{en ? "Channel" : "極化"}</th>
            <th>{en ? "Area change" : "面積變化"}</th>
            <th>{en ? "r (all)" : "r（全部）"}</th>
            <th>{en ? "n" : "筆數"}</th>
          </tr>
        </thead>
        <tbody>
          {(["HH", "HV"] as const).map((channel) => (
            <tr key={channel}>
              <th scope="row">{channel}</th>
              <td>{signed(comparison.channels[channel].change_pct)}%</td>
              <td>
                {number(comparison.channels[channel].all.pearson_area_vs_level)}
              </td>
              <td>{comparison.channels[channel].all.n}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <details className="science-details compact-details">
        <summary>
          {en ? "Sensitivity to quality flags" : "品質旗標的影響"}
        </summary>
        <table className="science-table">
          <thead>
            <tr>
              <th>{en ? "Channel" : "極化"}</th>
              <th>{en ? "r without flags" : "排除旗標的 r"}</th>
              <th>{en ? "n" : "筆數"}</th>
            </tr>
          </thead>
          <tbody>
            {(["HH", "HV"] as const).map((channel) => (
              <tr key={channel}>
                <th scope="row">{channel}</th>
                <td>
                  {number(
                    comparison.channels[channel].without_flagged
                      .pearson_area_vs_level,
                  )}
                </td>
                <td>{comparison.channels[channel].without_flagged.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(["HH", "HV"] as const).map((channel) => (
          <p key={channel} className="inspector-secondary">
            {channel} †{" "}
            {comparison.channels[channel].flagged_dates.length
              ? comparison.channels[channel].flagged_dates
                  .map(format)
                  .join("、")
              : en
                ? "No flagged dates"
                : "無旗標日期"}
          </p>
        ))}
        <p className="inspector-secondary">
          {en
            ? "The main grade keeps every observation. Removing all automatically flagged dates is a sensitivity check only."
            : "主要分級保留每筆觀測；排除全部自動旗標日期僅作敏感度檢查。"}
        </p>
      </details>
      <details className="science-details compact-details">
        <summary>{en ? "A possible explanation" : "可能的解釋"}</summary>
        <p>
          {en
            ? "Candidate exposed bed, selected using HH, remains dark in HV and may be difficult to distinguish from water. Selection by HH is biased; independent ground observations are not available to confirm this explanation."
            : "依 HH 選出的候選裸露庫底，在 HV 仍偏暗，可能較難與水面分辨。但以 HH 選樣本存在偏差，目前也沒有獨立地面觀測確認這個解釋。"}
        </p>
      </details>
    </div>
  );
}

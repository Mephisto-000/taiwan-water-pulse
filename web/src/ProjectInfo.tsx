// SI-assisted project documentation; source observations are not SI-generated.
import { useEffect, useState } from "react";
import { bilingual, type Language } from "./i18n";
import {
  dataUrl,
  type Acquisition,
  type DataIndex,
  type OfficialSeries,
} from "./domain";
import type { NumericalArchive } from "./numerical";

export function ProjectInfo({
  index,
  acquisition,
  archive,
  series,
  lang,
}: {
  index: DataIndex;
  acquisition: Acquisition;
  archive: NumericalArchive | null;
  series: OfficialSeries | null;
  lang: Language;
}) {
  const t = (en: string, zh: string) => bilingual(lang, en, zh);
  const [version, setVersion] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch(dataUrl("provenance.json"), { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((p: unknown) => {
        if (
          p &&
          typeof p === "object" &&
          "code_version" in p &&
          typeof p.code_version === "string" &&
          /^[0-9a-f]{40}$/.test(p.code_version)
        )
          setVersion(p.code_version);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return (
    <>
      <section id="methods" className="methods-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">04 / {t("DATA & METHODS", "資料與方法")}</p>
            <h2>
              {t("A clear view of the limits.", "看見影像，也看見限制。")}
            </h2>
          </div>
          <a href={dataUrl("provenance.json")}>
            {t("Provenance ↗", "來源紀錄 ↗")}
          </a>
        </div>
        <div className="method-columns">
          <div>
            <h3>{t("What you are looking at", "目前呈現的資料")}</h3>
            <p>
              {t(
                "NISAR L-band GCOV, NASA/JPL & ISRO, distributed by ASF DAAC. Calibrated gamma-nought power is processed on a fixed, north-up reservoir grid. Source observations are not SI-generated.",
                "NISAR L 波段 GCOV 資料來自 NASA/JPL 與 ISRO，由 ASF DAAC 發布。校準後的 gamma-nought 功率轉至固定、北向上的水庫格網。原始觀測不是 SI 生成。",
              )}
            </p>
            <dl className="provenance-list">
              <dt>{t("Collection", "產品集")}</dt>
              <dd>{index.collection} · Provisional</dd>
              <dt>{t("Granule", "資料產品識別碼")}</dt>
              <dd className="granule">{acquisition.granule}</dd>
              <dt>UTC</dt>
              <dd>{acquisition.utc}</dd>
              <dt>{t("Taiwan time", "台灣時間")}</dt>
              <dd>{acquisition.local}</dd>
              <dt>{t("Official records retrieved", "官方資料擷取時間")}</dt>
              <dd>{series?.retrieved_at ?? index.seed_retrieved_at}</dd>
              <dt>{t("Image grid", "影像格網")}</dt>
              <dd>
                {archive
                  ? `${archive.meta.grid.pixel_side_m} m · EPSG:${archive.meta.grid.epsg}`
                  : "—"}{" "}
                ·{" "}
                {t(
                  "pixel spacing, not effective resolution",
                  "像素間距，不等於有效解析度",
                )}
              </dd>
            </dl>
            <div className="source-links">
              <a href={dataUrl("diagnostics.json")}>
                {t(
                  "Scale ladder & polarization diagnostics ↗",
                  "解析度階梯與極化診斷 ↗",
                )}
              </a>
              <a href={dataUrl("methods.md")}>
                {t("Reproducible methods ↗", "可重現的方法 ↗")}
              </a>
              <a href={dataUrl("validation.json")}>
                {t("Current validation report ↗", "本次驗證報告 ↗")}
              </a>
              <a href={dataUrl("historical-validation.json")}>
                {t("Earlier held-out results ↗", "先前獨立驗證結果 ↗")}
              </a>
              <a
                href="https://nisar-docs.asf.alaska.edu/gcov/"
                target="_blank"
                rel="noreferrer"
              >
                ASF GCOV {t("guide", "指南")} ↗
              </a>
              <a
                href="https://fhy.wra.gov.tw/fhyv2/monitor/reservoir"
                target="_blank"
                rel="noreferrer"
              >
                WRA {t("reservoir records", "水庫資訊")} ↗
              </a>
            </div>
          </div>
          <div>
            <h3>
              {t("How the experimental estimate works", "實驗性估算與分級")}
            </h3>
            <p>
              {t(
                "A common HH method averages linear power onto a 30 m native UTM analysis grid, then classifies pixels inside the OSM polygon (no buffer) below 60% of the same-date surrounding-land median. Polarization, mask and relative threshold are not tuned against official water levels. Area is compared with paired water levels using Pearson r and Spearman ρ, bootstrap intervals, and a below-95%-storage subset.",
                "四庫共用 HH 方法：線性功率平均至原生 UTM 30 m 分析格網，在 OSM 輪廓內（無緩衝區）判定低於同日周邊陸地中位數 60% 的像素。極化、遮罩與相對門檻不使用官方水位調整。面積與配對水位使用 Pearson r、Spearman ρ、bootstrap 區間及蓄水率低於 95% 的子集評估。",
              )}
            </p>
            <p className="hypothesis-note">
              {t(
                "In candidate drawdown pixels selected using HH, March HV remained darker than the surrounding reference area. This is consistent with the proposed weak-HV-contrast explanation, but HH-based selection is biased and there are no independent exposed-bed labels. It remains a hypothesis, not a confirmed physical cause; see the polarization diagnostics.",
                "在依 HH 選出的候選消落區，三月 HV 仍比周邊參考區暗，與 HV 對消落區對比較弱的解釋一致。但以 HH 選樣本有偏差，也沒有獨立的裸露庫底標記，因此仍是假說，不能認定物理成因已證實；詳見極化診斷。",
              )}
            </p>
            <ul>
              <li>
                {t(
                  "A: r ≥ 0.8 and its 95% lower bound ≥ 0.6. B: r ≥ 0.5 with weaker evidence. C: r < 0.5 or insufficient evidence. Physical checks can withhold area even when correlation is high.",
                  "A：r ≥ 0.8 且 95% 區間下界 ≥ 0.6。B：r ≥ 0.5，但證據較弱。C：r < 0.5 或證據不足。即使相關高，未通過物理檢查仍會暫不展示面積。",
                )}
              </li>
              <li>
                {t(
                  "Grades describe this experiment; they are not independent certification. The analysis scale was selected after comparing the declared scales, so this remains exploratory. Earlier failed held-out results remain in the report. OSM outlines are reference water boundaries, not surveyed maximum-storage shorelines or ground truth.",
                  "分級描述這次實驗，不是獨立認證。分析尺度是在比較列出的尺度後選擇，仍屬探索性結果；先前失敗的驗證仍保留。OSM 輪廓是水域參考邊界，不是測量過的滿水位岸線或驗證真值。",
                )}
              </li>
              <li>
                {t(
                  "Wind, rain, floating debris, smooth exposed banks, radar shadow, layover and speckle can affect classification. Possible causes of poor performance remain hypotheses here.",
                  "風浪、降雨、漂流物、平滑裸露岸地、雷達陰影、疊置與斑點雜訊都可能影響分類。表現不佳的物理成因在此仍是假說。",
                )}
              </li>
              <li>
                {t(
                  "Filtering and reprojection operate on linear power before conversion to dB. Quantization spans −35 to +5 dB; zero denotes missing data. The 50%–70% reference-power sensitivity range is not a confidence interval. Display images retain a finer grid than the classification.",
                  "在線性功率下濾波、重投影後才轉 dB。量化涵蓋 −35 至 +5 dB，0 表示缺值。周邊參考功率 50%–70% 的敏感度範圍不是信賴區間。影像顯示保留比分類更細的格網。",
                )}
              </li>
              <li>
                {t(
                  "Official 07:00 readings occur about 1.7 hours after these acquisitions. Curves connect sampled records for readability; missing values are not filled. The radar product gap is 18 March–20 June 2026 UTC.",
                  "官方 07:00 觀測約比這批取像晚 1.7 小時。曲線連接取樣紀錄以協助閱讀，不填補缺值。2026 年 3 月 18 日至 6 月 20 日 UTC 無雷達產品。",
                )}
              </li>
              <li>
                <strong>
                  {t(
                    "Surface area is not storage volume. Correlation does not establish causation.",
                    "水面積不等於蓄水量。相關性不代表因果關係。",
                  )}
                </strong>
              </li>
            </ul>
          </div>
        </div>
      </section>
      <aside
        className="si-disclosure"
        aria-label={t("SI usage disclosure", "SI 使用揭露")}
      >
        <strong>SI-assisted project</strong>
        <p>
          {t(
            "OpenAI Codex assisted with code, interface copy, translation, documentation and data preparation. Radar and official source observations are not SI-generated. Automated checks do not replace scientific review.",
            "OpenAI Codex 協助程式碼、介面文案、翻譯、文件及資料整理。雷達與官方原始觀測不是 SI 生成；自動檢查不取代科學審查。",
          )}
        </p>
        <a href={dataUrl("si-usage.json")}>
          {t("Usage metadata ↗", "使用範圍與 metadata ↗")}
        </a>
      </aside>
      <footer>
        <span>Taiwan’s Water Pulse · v0.2</span>
        <p>
          NISAR · NASA/JPL & ISRO · ASF DAAC
          <br />© OpenStreetMap contributors / WRA
        </p>
        <span>
          {t("Data pipeline commit", "資料產生程式版本")}{" "}
          <code>{version ? version.slice(0, 8) : "—"}</code>
        </span>
      </footer>
    </>
  );
}

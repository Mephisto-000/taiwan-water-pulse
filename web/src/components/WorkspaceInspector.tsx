// SI-assisted interface and explanatory copy; source observations are not generated.
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  dataUrl,
  type Acquisition,
  type DataIndex,
  type OfficialSeries,
  type Polarization,
} from "../domain";
import type { Language } from "../i18n";
import { canPublishArea, type NumericalArchive } from "../numerical";
import { readScientificStats } from "../science";
import {
  gradeDescription,
  observationAt,
  relativeChange,
  signed,
  type ReservoirSummary,
} from "../workspace";
import PolarizationSeparation from "./PolarizationSeparation";
import ThresholdExperiment from "./ThresholdExperiment";
import FrequencyMap from "./FrequencyMap";

export type InspectorTab = "day" | "methods" | "sources";
export interface WorkspaceInspectorProps {
  index: DataIndex;
  reservoirKey: string;
  archive: NumericalArchive | null;
  official: OfficialSeries | null;
  acquisition: Acquisition;
  referenceDate: string;
  lang: Language;
  polarization?: Polarization;
  summaries: ReservoirSummary[];
  tab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
}
const value = (number: number | null | undefined, digits = 2) =>
  number == null || !Number.isFinite(number)
    ? "—"
    : number.toFixed(digits).replace("-", "−");
const ci = (interval: [number, number] | null | undefined) =>
  interval ? interval.map((number) => value(number)).join(" – ") : "—";
function taiwanDate(date: string, lang: Language, time = false): string {
  const parsed = new Date(date);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(time
      ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const }
      : {}),
  }).format(parsed);
}
function Metric({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="inspector-metric">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
function RadarExplanation({ en }: { en: boolean }) {
  return (
    <details className="science-details radar-explanation">
      <summary>
        {en ? "Why is the water dark?" : "為什麼水是暗的？"}
        <span aria-hidden="true">＋</span>
      </summary>
      <svg
        viewBox="0 0 280 150"
        role="img"
        aria-label={
          en
            ? "Calm water reflects radar away; rough terrain scatters part of the signal back."
            : "平靜水面把雷達波反射到別處；粗糙地表將部分訊號散射回衛星。"
        }
      >
        <defs>
          <marker
            id="wave-arrow"
            markerWidth="6"
            markerHeight="6"
            refX="5"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L6,3 L0,6" fill="var(--data, #2f6fed)" />
          </marker>
        </defs>
        <path
          d="M22 15 L75 87 L127 15 M166 15 L213 87 L182 37 M213 87 L248 30"
          stroke="var(--data, #2f6fed)"
          strokeWidth="2"
          fill="none"
          markerEnd="url(#wave-arrow)"
        />
        <path
          d="M15 90 H132 M155 90 L165 81 L175 88 L185 75 L200 91 L215 84 L228 92 L242 79 L265 90"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
        />
        <text
          x="74"
          y="116"
          textAnchor="middle"
          fill="currentColor"
          fontSize="13"
        >
          {en ? "Calm water" : "平靜水面"}
        </text>
        <text
          x="211"
          y="116"
          textAnchor="middle"
          fill="currentColor"
          fontSize="13"
        >
          {en ? "Rough ground" : "粗糙地表"}
        </text>
        <text
          x="140"
          y="143"
          textAnchor="middle"
          fill="currentColor"
          fontSize="12"
        >
          SI-generated schematic
        </text>
      </svg>
      <p>
        {en
          ? "Calm water reflects most of the radar signal away, so it looks dark. Rough ground and vegetation scatter more signal back. Wind can roughen water and make it brighter."
          : "平靜水面像鏡子，把大部分雷達波反射到別處，所以看起來暗。粗糙地表與植被將較多訊號散射回來。風浪會使水面變粗糙、變亮。"}
      </p>
    </details>
  );
}

export default function WorkspaceInspector({
  index,
  reservoirKey,
  archive,
  official,
  acquisition,
  referenceDate,
  lang,
  polarization = "HH",
  summaries,
  tab,
  onTabChange,
}: WorkspaceInspectorProps) {
  const en = lang === "en";
  const tabs: { id: InspectorTab; label: string }[] = [
    { id: "day", label: en ? "This day" : "這一天" },
    { id: "methods", label: en ? "Methods" : "方法" },
    { id: "sources", label: en ? "Sources" : "來源" },
  ];
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = observationAt(archive?.series, acquisition.utc_date);
  const qualityFlags =
    current?.qa_by_channel?.[polarization] ?? current?.qa ?? [];
  const reference = observationAt(archive?.series, referenceDate);
  const gauge = official?.records.find(
    (record) => record.nisar_utc_date === acquisition.utc_date,
  );
  const pct = gauge?.pct ?? current?.official.pct;
  const level = gauge?.level_m ?? current?.official.level_m;
  const publish = canPublishArea(archive);
  const referenceLabel =
    reference?.official.pct != null && reference.official.pct >= 99.5
      ? en
        ? "full pool"
        : "滿庫"
      : en
        ? "reference"
        : "起點";
  const science = readScientificStats(archive?.series.stats);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const [version, setVersion] = useState<string>("");
  const [experimentOpen, setExperimentOpen] = useState(false);
  const [frequencyOpen, setFrequencyOpen] = useState(false);
  useEffect(() => {
    if (tab !== "sources" || version) return;
    const controller = new AbortController();
    void fetch(dataUrl("provenance.json"), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Provenance unavailable");
        return response.json() as Promise<unknown>;
      })
      .then((result) => {
        if (
          result &&
          typeof result === "object" &&
          "code_version" in result &&
          typeof result.code_version === "string" &&
          /^[a-f0-9]{40}$/.test(result.code_version)
        )
          setVersion(result.code_version);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [tab, version]);
  useEffect(() => {
    setCopyStatus("idle");
  }, [acquisition.granule]);
  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(acquisition.granule);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  };
  return (
    <aside
      className="workspace-inspector"
      aria-label={en ? "Observation details" : "觀測詳情"}
    >
      <div
        className="inspector-tabs"
        role="tablist"
        aria-label={en ? "Details view" : "詳情分頁"}
      >
        {tabs.map((item, i) => (
          <button
            key={item.id}
            id={`inspector-tab-${item.id}`}
            ref={(element) => {
              tabRefs.current[i] = element;
            }}
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`inspector-panel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => onTabChange(item.id)}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (i + 1) % tabs.length
                  : event.key === "ArrowLeft"
                    ? (i + tabs.length - 1) % tabs.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : null;
              if (next === null) return;
              event.preventDefault();
              onTabChange(tabs[next].id);
              tabRefs.current[next]?.focus();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        className="inspector-panel"
        id={`inspector-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`inspector-tab-${tab}`}
        tabIndex={0}
      >
        {tab === "day" && (
          <>
            <section className="inspector-section">
              <div className="inspector-date">
                {taiwanDate(acquisition.utc, lang, true)}{" "}
                <span>{en ? "Taiwan time" : "台灣時間"}</span>
              </div>
              <p
                className="inspector-status"
                data-grade={archive?.meta.validation.grade}
              >
                {gradeDescription(archive?.meta.validation.grade, lang)}
                {archive?.meta.validation.grade === "C" && (
                  <button
                    className="text-button"
                    onClick={() => onTabChange("methods")}
                  >
                    {en ? "Why" : "原因"}
                  </button>
                )}
              </p>
              {archive?.meta.validation.grade !== "C" && (
                <div className="inspector-hero-metric">
                  <span>
                    {en ? "Water surface seen by radar" : "雷達看到的水面"}
                  </span>
                  <strong>
                    {publish && current
                      ? current.area_km2.primary.toFixed(2)
                      : "—"}
                    {publish && current && <small> km²</small>}
                  </strong>
                </div>
              )}
              {publish && current ? (
                <p className="inspector-secondary">
                  {en ? "Threshold sensitivity" : "門檻敏感度"}{" "}
                  {value(current.area_km2.primary_lo)} –{" "}
                  {value(current.area_km2.primary_hi)} km²
                </p>
              ) : null}
              <dl className="inspector-metrics official-metrics">
                <Metric label={en ? "Official storage" : "官方蓄水率"}>
                  <strong>
                    {value(pct, 1)}
                    <small> %</small>
                  </strong>
                </Metric>
                <Metric label={en ? "Official water level" : "官方水位"}>
                  <strong>
                    {value(level)}
                    <small> m</small>
                  </strong>
                </Metric>
              </dl>
              {qualityFlags.length ? (
                <p className="inspector-qa">
                  † {polarization}{" "}
                  {en
                    ? "This observation carries a quality flag. It remains in the analysis."
                    : "這次觀測帶有品質旗標，仍保留在分析中。"}{" "}
                  <button
                    className="text-button"
                    onClick={() => onTabChange("methods")}
                  >
                    {en ? "Details" : "詳情"}
                  </button>
                </p>
              ) : null}
            </section>
            <section className="inspector-section">
              <h3>
                {en
                  ? `Compared with ${referenceLabel}`
                  : `與${referenceLabel}相比`}
                <span>{reference ? taiwanDate(reference.utc, lang) : "—"}</span>
              </h3>
              <dl className="inspector-metrics delta-metrics">
                <Metric label={en ? "Radar water surface" : "雷達水面"}>
                  <span>
                    {publish && current && reference
                      ? `${value(reference.area_km2.primary)} → ${value(current.area_km2.primary)} km²`
                      : "—"}
                  </span>
                  <strong>
                    {publish && current && reference
                      ? `${signed(relativeChange(current.area_km2.primary, reference.area_km2.primary))}%`
                      : en
                        ? "Unresolved"
                        : "未能分辨"}
                  </strong>
                </Metric>
                <Metric label={en ? "Storage" : "蓄水率"}>
                  <span>
                    {value(reference?.official.pct, 1)} → {value(pct, 1)}%
                  </span>
                  <strong>
                    {signed(
                      pct != null && reference?.official.pct != null
                        ? pct - reference.official.pct
                        : null,
                    )}{" "}
                    {en ? "pp" : "個百分點"}
                  </strong>
                </Metric>
                <Metric label={en ? "Water level" : "水位"}>
                  <span>
                    {value(reference?.official.level_m)} → {value(level)} m
                  </span>
                  <strong>
                    {signed(
                      level != null && reference?.official.level_m != null
                        ? level - reference.official.level_m
                        : null,
                      2,
                    )}{" "}
                    m
                  </strong>
                </Metric>
              </dl>
              <p className="inspector-secondary">
                {en
                  ? "Surface area and stored volume describe different dimensions of the reservoir."
                  : "水面積與蓄水量，描述的是水庫不同的尺度。"}
              </p>
            </section>
            <section className="inspector-section inspector-faq">
              <RadarExplanation en={en} />
              <details className="science-details">
                <summary>
                  {en
                    ? "How should I read the blue area?"
                    : "藍色水面該怎麼讀？"}
                  <span aria-hidden="true">＋</span>
                </summary>
                <p>
                  {en
                    ? "Blue marks candidate water classified from HH on a 30 m grid. The fine grayscale image has a separate display grid. Absolute area depends on the threshold definition; relative changes across dates are more informative."
                    : "藍色是依 HH、30 m 格網分類的候選水體；細緻的灰階影像使用另一套顯示格網。面積絕對值取決於門檻定義，跨日期的相對變化較有參考價值。"}
                </p>
              </details>
            </section>
          </>
        )}
        {tab === "methods" && (
          <>
            <section className="inspector-section">
              <h2>
                {en ? "One method, four reservoirs" : "同一個方法，四座水庫"}
              </h2>
              <p>
                {en
                  ? "HH linear power is averaged onto a native 30 m grid. Inside the OSM outline with no buffer, pixels below 60% of that date’s surrounding-land median are candidate water. Official levels are used for evaluation, not to tune this definition."
                  : "先將 HH 線性功率平均至原生 30 m 格網。在無外擴的 OSM 輪廓內，低於同日周邊陸地中位數 60% 的像素列為候選水體。官方水位用來評估，未用來調整這套定義。"}
              </p>
              <p className="inspector-secondary">
                {en
                  ? "The 0.6 ratio is a chosen definition inspired by an uncalibrated preview check, not a measured physical water–land boundary."
                  : "0.6 源自未校準預覽值的粗估，是選定的定義，並非量測出的物理水陸分界。"}
              </p>
            </section>
            <section className="inspector-section methods-results">
              <h3>{en ? "Results & confidence" : "結果與可信程度"}</h3>
              {!summaries.length && (
                <p role="status">
                  {en ? "Loading reservoir results…" : "正在載入各庫結果…"}
                </p>
              )}
              {summaries.map((summary) => {
                const reservoir = index.reservoirs.find(
                  (reservoir) => reservoir.key === summary.key,
                );
                const validation = summary.meta.validation;
                const evidence = readScientificStats(summary.series.stats);
                const allowed =
                  validation.publish_area && validation.grade !== "C";
                return (
                  <details
                    className="science-details reservoir-result"
                    key={summary.key}
                    open={summary.key === reservoirKey}
                  >
                    <summary>
                      <strong>
                        {en ? reservoir?.name : reservoir?.name_zh}
                      </strong>
                      <span className="result-grade">{validation.grade}</span>
                    </summary>
                    <p className="inspector-secondary">
                      {gradeDescription(validation.grade, lang)}
                    </p>
                    <dl className="inspector-metrics science-table">
                      <Metric label="Pearson r">
                        <strong>
                          {value(validation.pearson_area_vs_level)}
                        </strong>
                        <span>95% CI {ci(validation.pearson_ci95)}</span>
                      </Metric>
                      <Metric label="Spearman ρ">
                        <strong>
                          {value(validation.spearman_area_vs_level)}
                        </strong>
                        <span>95% CI {ci(validation.spearman_ci95)}</span>
                      </Metric>
                      <Metric
                        label={en ? "Paired observations" : "配對觀測筆數"}
                      >
                        {validation.n}
                      </Metric>
                      <Metric label={en ? "Level span" : "水位變幅"}>
                        {value(evidence.effect_size?.level_range_m)} m
                      </Metric>
                      <Metric label={en ? "Area range" : "面積全距"}>
                        {allowed
                          ? `${value(evidence.effect_size?.area_range_km2, 3)} km²`
                          : en
                            ? "Withheld"
                            : "未發布"}
                      </Metric>
                      <Metric
                        label={
                          en ? "Range / sensitivity width" : "全距／敏感度寬"
                        }
                      >
                        {value(
                          evidence.effect_size?.range_to_sensitivity_ratio,
                        )}
                      </Metric>
                      <Metric label={en ? "Classification" : "分類設定"}>
                        HH / {summary.meta.analysis?.grid.pixel_side_m ?? "—"} m
                        /{" "}
                        {value(
                          (summary.meta.analysis?.threshold_ratio ?? 0.6) * 100,
                          0,
                        )}
                        %
                      </Metric>
                    </dl>
                    <details className="science-details compact-details">
                      <summary>
                        {en
                          ? "Below 95% storage & repeatability"
                          : "低於 95% 子集與滿庫重複性"}
                      </summary>
                      <dl className="inspector-metrics">
                        <Metric label={en ? "Subset r / ρ" : "子集 r／ρ"}>
                          {value(validation.below_95.pearson_area_vs_level)} /{" "}
                          {value(validation.below_95.spearman_area_vs_level)}
                        </Metric>
                        <Metric label={en ? "Subset n" : "子集筆數"}>
                          {validation.below_95.n}
                        </Metric>
                        <Metric label="r 95% CI">
                          {ci(validation.below_95.pearson_ci95)}
                        </Metric>
                        <Metric label="ρ 95% CI">
                          {ci(validation.below_95.spearman_ci95)}
                        </Metric>
                        <Metric
                          label={en ? "Full-pool observations" : "滿庫觀測筆數"}
                        >
                          {evidence.full_storage_repeatability?.n ?? "—"}
                        </Metric>
                        {allowed && (
                          <>
                            <Metric
                              label={
                                en ? "Full-pool area SD" : "滿庫面積標準差"
                              }
                            >
                              {value(
                                evidence.full_storage_repeatability?.std_km2,
                                3,
                              )}{" "}
                              km²
                            </Metric>
                            <Metric
                              label={
                                en ? "Full-pool area range" : "滿庫面積全距"
                              }
                            >
                              {value(
                                evidence.full_storage_repeatability?.range_km2,
                                3,
                              )}{" "}
                              km²
                            </Metric>
                          </>
                        )}
                      </dl>
                      <p className="inspector-secondary">
                        {en
                          ? "Full pool means storage ≥99.5%. Spread describes these observations, not a measured instrument error."
                          : "滿庫指蓄水率 ≥99.5%；散布描述這批觀測，不是已量測的儀器誤差。"}
                      </p>
                    </details>
                  </details>
                );
              })}
              <details className="science-details">
                <summary>{en ? "What the grades mean" : "分級條件"}</summary>
                <p>
                  {en
                    ? "A requires r ≥0.8, its 95% lower bound ≥0.6, physical checks, and area range at least twice the mean sensitivity width. B requires r ≥0.5 and a positive 95% lower bound. C withholds area."
                    : "A 要求 r ≥0.8、95% 區間下界 ≥0.6、通過物理檢查，且面積全距至少為平均敏感度帶寬的兩倍。B 要求 r ≥0.5 且 95% 區間下界大於 0。C 暫不發布面積。"}
                </p>
              </details>
            </section>
            {archive && publish && (
              <section className="inspector-section">
                <PolarizationSeparation archive={archive} lang={lang} />
              </section>
            )}
            {publish &&
              science.volume_closure?.eligible &&
              science.volume_closure.available && (
                <section className="inspector-section">
                  <h3>
                    {en
                      ? "Does the volume change close?"
                      : "水量變化能對得上嗎？"}
                  </h3>
                  <p className="inspector-secondary">
                    {science.volume_closure.start_utc
                      ? taiwanDate(science.volume_closure.start_utc, lang)
                      : "—"}{" "}
                    →{" "}
                    {science.volume_closure.end_utc
                      ? taiwanDate(science.volume_closure.end_utc, lang)
                      : "—"}
                  </p>
                  <dl className="inspector-metrics closure-metrics">
                    <Metric
                      label={
                        en ? "Radar area × level change" : "雷達面積 × 水位變化"
                      }
                    >
                      <strong>
                        {value(science.volume_closure.radar_million_m3)}
                      </strong>{" "}
                      {en ? "million m³" : "百萬 m³"}
                    </Metric>
                    <Metric label={en ? "Threshold range" : "門檻範圍"}>
                      {value(science.volume_closure.radar_low_million_m3)}–
                      {value(science.volume_closure.radar_high_million_m3)}{" "}
                      {en ? "million m³" : "百萬 m³"}
                    </Metric>
                    <Metric
                      label={
                        en ? "Official stored-volume change" : "官方蓄水量變化"
                      }
                    >
                      {value(science.volume_closure.official_million_m3)}{" "}
                      {en ? "million m³" : "百萬 m³"}
                    </Metric>
                    <Metric label={en ? "Radar / official" : "雷達／官方"}>
                      {value(science.volume_closure.ratio, 3)}
                    </Metric>
                  </dl>
                  <p className="inspector-secondary">
                    {en
                      ? "This uses official water levels and linearly interpolates area between observations. It is a physical consistency check, not independent validation; the result changes with the threshold."
                      : "這項檢查使用官方水位，並在觀測間線性內插面積。它是物理合理性檢查，並非獨立驗證；結果會隨門檻改變。"}
                  </p>
                  {science.volume_closure.source && (
                    <a
                      href={science.volume_closure.source}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {en ? "Official volume source" : "官方蓄水量來源"}
                    </a>
                  )}
                </section>
              )}
            {publish && science.threshold_sensitivity && (
              <section className="inspector-section">
                <details className="science-details">
                  <summary>
                    {en ? "Wider threshold sensitivity" : "更寬的門檻敏感度"}
                  </summary>
                  <p>
                    {en
                      ? "These alternative definitions are diagnostics. The published 60% rule is unchanged."
                      : "以下替代定義僅作診斷，發布的 60% 規則維持不變。"}
                  </p>
                  <div className="science-table-wrap">
                    <table className="science-table">
                      <thead>
                        <tr>
                          <th>{en ? "Definition" : "定義"}</th>
                          <th>{en ? "This day km²" : "當日 km²"}</th>
                          <th>r</th>
                        </tr>
                      </thead>
                      <tbody>
                        {science.threshold_sensitivity.definitions.map(
                          (definition) => (
                            <tr key={definition.id}>
                              <th scope="row">
                                {definition.offset_db == null
                                  ? "Otsu"
                                  : `−${Math.abs(definition.offset_db)} dB`}
                              </th>
                              <td>
                                {value(
                                  definition.records.find(
                                    (record) =>
                                      record.utc.slice(0, 10) ===
                                      acquisition.utc_date,
                                  )?.area_km2,
                                  3,
                                )}
                              </td>
                              <td>
                                {value(
                                  definition.statistics.pearson_area_vs_level,
                                )}
                              </td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                </details>
              </section>
            )}
            {publish && archive && (
              <section className="inspector-section">
                <details
                  className="science-details"
                  open={experimentOpen}
                  onToggle={(event) =>
                    setExperimentOpen(event.currentTarget.open)
                  }
                >
                  <summary>
                    {en ? "Explore the threshold (trial)" : "探索門檻（試算）"}
                  </summary>
                  {experimentOpen && (
                    <ThresholdExperiment
                      key={reservoirKey}
                      archive={archive}
                      date={acquisition.utc_date}
                      lang={lang}
                    />
                  )}
                </details>
                <details
                  className="science-details"
                  open={frequencyOpen}
                  onToggle={(event) =>
                    setFrequencyOpen(event.currentTarget.open)
                  }
                >
                  <summary>
                    {en ? "Water frequency across the archive" : "全年水體頻率"}
                  </summary>
                  {frequencyOpen && (
                    <FrequencyMap archive={archive} lang={lang} />
                  )}
                </details>
              </section>
            )}
            <section className="inspector-section">
              <details className="science-details">
                <summary>
                  {en ? "Limits & quality flags" : "限制與品質旗標"}
                </summary>
                <ul className="inspector-limitations">
                  <li>
                    {en
                      ? "Results are exploratory and use the observed sample; earlier failed held-out results remain available."
                      : "結果屬於樣本內的探索性分析；先前未通過的獨立驗證仍保留。"}
                  </li>
                  <li>
                    {en
                      ? "Wind, smooth exposed banks, radar shadow, terrain and speckle can alter the classification. OSM geometry is a reference, not ground truth."
                      : "風浪、平滑裸露岸地、雷達陰影、地形與斑點雜訊可能改變分類；OSM 是參考幾何，不是真值。"}
                  </li>
                  <li>
                    {en
                      ? "Sensitivity bars vary the reference-power ratio from 50% to 70%; they are not 95% confidence intervals."
                      : "敏感度線段使用參考功率比值 50%–70%，並非 95% 信賴區間。"}
                  </li>
                  <li>
                    {en
                      ? "QA flags mark a land median shifted by >2 dB, or full-pool area >3 MAD below its median. Flagged observations remain in the primary statistics."
                      : "QA 標記陸地中位數偏離逾 2 dB，或滿庫面積低於其中位數逾 3 MAD。主要統計保留所有旗標觀測。"}
                  </li>
                  <li>
                    {en
                      ? "Display: HH −18 to −2 dB; HV −21 to −6 dB, rounded outward from pooled 2nd–98th percentiles. Quantization and classification are unchanged."
                      : "顯示範圍：HH −18 至 −2 dB；HV −21 至 −6 dB，由合併第 2–98 百分位向外取整。量化資料與分類設定不變。"}
                  </li>
                </ul>
              </details>
              <a href={dataUrl("methods.md")}>
                {en ? "Read the reproducible method" : "閱讀可重現的方法"}
              </a>
            </section>
          </>
        )}
        {tab === "sources" && (
          <>
            <section className="inspector-section">
              <h2>{en ? "Trace this observation" : "追溯這次觀測"}</h2>
              <p>
                {en
                  ? "NISAR L-band GCOV, NASA/JPL & ISRO. Distributed by ASF DAAC."
                  : "NISAR L 波段 GCOV，NASA/JPL 與 ISRO 提供，由 ASF DAAC 發布。"}
              </p>
              <code className="source-id">{acquisition.granule}</code>
              <div className="source-actions">
                <button onClick={() => void copyId()}>
                  {copyStatus === "copied"
                    ? en
                      ? "Copied"
                      : "已複製"
                    : en
                      ? "Copy product ID"
                      : "複製產品 ID"}
                </button>
                <a
                  href={dataUrl(`reservoirs/${reservoirKey}/timeseries.csv`)}
                  download
                >
                  {en ? "Download CSV" : "下載 CSV"}
                </a>
              </div>
              {copyStatus === "error" && (
                <p role="status">
                  {en
                    ? "Copy was unavailable. Select the product ID above to copy it."
                    : "無法自動複製，請選取上方產品 ID 複製。"}
                </p>
              )}
              <dl className="inspector-metrics source-metadata">
                <Metric label="UTC">{acquisition.utc}</Metric>
                <Metric label={en ? "Taiwan time" : "台灣時間"}>
                  {taiwanDate(acquisition.utc, lang, true)}
                </Metric>
                <Metric label={en ? "Official retrieval" : "官方資料擷取"}>
                  {taiwanDate(
                    official?.retrieved_at ?? index.seed_retrieved_at,
                    lang,
                    true,
                  )}
                </Metric>
                <Metric label={en ? "Display grid" : "顯示格網"}>
                  {archive?.meta.grid.pixel_side_m ?? "—"} m
                </Metric>
                <Metric label={en ? "Collection" : "產品集"}>
                  {index.collection}
                </Metric>
              </dl>
              <p className="inspector-secondary">
                {en
                  ? "Grid spacing is not effective resolution. Official 07:00 readings occur about 1.7 hours after these radar acquisitions."
                  : "格網間距不等於有效解析度。官方 07:00 觀測約比這批雷達取像晚 1.7 小時。"}
              </p>
            </section>
            <section className="inspector-section source-links">
              <h3>{en ? "Data & reproducibility" : "資料與可重現性"}</h3>
              {[
                [
                  "https://nisar-docs.asf.alaska.edu/gcov/",
                  en ? "ASF GCOV documentation" : "ASF GCOV 文件",
                ],
                [
                  "https://fhy.wra.gov.tw/fhyv2/monitor/reservoir",
                  en ? "WRA reservoir observations" : "水利署水庫觀測",
                ],
                [
                  dataUrl("validation.json"),
                  en ? "Validation report (JSON)" : "驗證報告（JSON）",
                ],
                [
                  dataUrl("diagnostics.json"),
                  en ? "Scale & polarization diagnostics" : "尺度與極化診斷",
                ],
                [
                  dataUrl("historical-validation.json"),
                  en ? "Earlier held-out results" : "先前獨立驗證",
                ],
                [
                  dataUrl("provenance.json"),
                  en ? "Source provenance" : "資料來源紀錄",
                ],
              ].map(([href, label]) => (
                <a
                  key={href}
                  href={href}
                  {...(href.startsWith("https:")
                    ? {
                        target: "_blank",
                        rel: "noreferrer",
                        "aria-label": `${label}${en ? " (opens a new tab)" : "（另開分頁）"}`,
                      }
                    : {})}
                >
                  {label}
                </a>
              ))}
            </section>
            <section className="inspector-section si-disclosure">
              <h3>{en ? "AI / SI usage disclosure" : "AI／SI 使用揭露"}</h3>
              <p>
                {en
                  ? "OpenAI Codex assisted with code, interface copy, translation, documentation and data preparation. SI stands for Super Intelligence in the project’s supplied disclosure guidance. Radar and official source observations are not SI-generated."
                  : "OpenAI Codex 協助程式碼、介面文案、翻譯、文件與資料整理。SI 為專案所附規範使用的 Super Intelligence。雷達與官方原始觀測不是 SI 生成。"}
              </p>
              <a href={dataUrl("si-usage.json")}>
                {en ? "Usage metadata" : "使用範圍與 metadata"}
              </a>
            </section>
            <footer className="inspector-section inspector-footer">
              <strong>Taiwan’s Water Pulse</strong>
              <span>© OpenStreetMap contributors / WRA</span>
              <span>
                {en ? "Data pipeline commit" : "資料產生程式版本"}{" "}
                <code>{version ? version.slice(0, 8) : "—"}</code>
              </span>
            </footer>
          </>
        )}
      </div>
    </aside>
  );
}

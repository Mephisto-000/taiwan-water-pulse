// SI-generated and SI-assisted code and copy. See /data/si-usage.json.
import { useEffect, useRef, useState } from "react";
import Comparison from "./components/Comparison";
import RadarViewer from "./components/RadarViewer";
import Filmstrip from "./components/Filmstrip";
import AnalysisCharts, { ScatterPlot } from "./components/AnalysisCharts";
import SceneOverview from "./components/SceneOverview";
import FrequencyMap from "./components/FrequencyMap";
import PolarizationSeparation from "./components/PolarizationSeparation";
import Locator from "./components/Locator";
import {
  canPublishArea,
  estimateRelativeArea,
  hasRelativeAnalysis,
  relativeThresholdDb,
  preloadNumericalArchive,
  useNumericalArchive,
} from "./numerical";
import { bilingual, resolveLanguage, type Language } from "./i18n";
import { explorerSearch, parseExplorerState } from "./state";
import {
  dataUrl,
  datePosition,
  formatDate,
  loadJson,
  nearestAcquisition,
  parseIndex,
  parseOfficial,
  type DataIndex,
  type OfficialSeries,
  type Polarization,
} from "./domain";
import { ProjectInfo } from "./ProjectInfo";

const chapters = [
  {
    date: "2025-11-05",
    compare: "2026-03-17",
    reservoir: "baoshan2",
    en: "A full beginning",
    zh: "滿庫的起點",
  },
  {
    date: "2026-03-17",
    compare: "2025-11-05",
    reservoir: "baoshan2",
    en: "The retreat",
    zh: "水面的退縮",
  },
  {
    date: "2026-03-17",
    compare: "2026-06-21",
    reservoir: "liyutan",
    en: "The missing chapter",
    zh: "觀測的空白",
  },
  {
    date: "2026-06-21",
    compare: "2026-03-17",
    reservoir: "baoshan2",
    en: "Water returns",
    zh: "水又回來了",
  },
  {
    date: "2026-08-20",
    compare: "2026-03-17",
    reservoir: "feitsui",
    en: "A different rhythm",
    zh: "不同的節奏",
  },
];
function PulseIcon() {
  return (
    <svg viewBox="0 0 34 34" fill="none" aria-hidden="true">
      <metadata>
        SI-generated project icon; OpenAI Codex; no agency branding.
      </metadata>
      <path
        d="M3 19h8l4-12 6 22 4-10h6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
export default function App() {
  const [index, setIndex] = useState<DataIndex | null>(null);
  const [error, setError] = useState(false),
    [retry, setRetry] = useState(0);
  const query = new URLSearchParams(window.location.search);
  const lang = resolveLanguage(
    query.get("lang"),
    navigator.language,
    query.get("demo") === "1",
  );
  const t = (en: string, zh: string) => bilingual(lang, en, zh);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    void loadJson("index.json", parseIndex, controller.signal)
      .then(setIndex)
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [retry]);
  if (!index)
    return (
      <main className="boot">
        <PulseIcon />
        <h1>{t("Taiwan’s Water Pulse", "台灣水庫的旱澇節奏")}</h1>
        {error ? (
          <>
            <p role="alert">
              {t(
                "The archive could not be loaded. Please try again.",
                "無法載入歷史資料，請重試。",
              )}
            </p>
            <button onClick={() => setRetry((n) => n + 1)}>
              {t("Retry", "重新載入")}
            </button>
          </>
        ) : (
          <p role="status">
            {t("Loading the observation archive…", "正在載入歷史觀測…")}
          </p>
        )}
      </main>
    );
  return <Explorer index={index} />;
}
function Explorer({ index }: { index: DataIndex }) {
  const [state, setState] = useState(() =>
    parseExplorerState(window.location.search, index, navigator.language),
  );
  const {
    reservoirKey,
    dateIndex,
    compareDateIndex,
    polarization,
    lang,
    demo,
  } = state;
  const t = (en: string, zh: string) => bilingual(lang, en, zh);
  const fmt = (date: string, short = false) => formatDate(date, short, lang);
  const [chapter, setChapter] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false),
    [view, setView] = useState<"compare" | "single">("compare");
  const [gauge, setGauge] = useState<{
    key: string;
    series: OfficialSeries;
  } | null>(null);
  const series = gauge?.key === reservoirKey ? gauge.series : null;
  const officialCache = useRef(new Map<string, OfficialSeries>());
  const [gaugeError, setGaugeError] = useState(false),
    [gaugeRetry, setGaugeRetry] = useState(0);
  const [ratioOverride, setRatioOverride] = useState<{
    key: string;
    value: number;
  } | null>(null);
  const [showWater, setShowWater] = useState(false);
  const [demoReady, setDemoReady] = useState(false),
    [demoError, setDemoError] = useState(false);
  const [demoRetry, setDemoRetry] = useState(0);
  const reservoir = index.reservoirs.find((r) => r.key === reservoirKey)!;
  const acquisition = index.dates[dateIndex],
    compareDate = index.dates[compareDateIndex].utc_date;
  const enabled =
    index.image_reservoirs?.includes(reservoirKey) ??
    (index.mode === "numeric" ||
      index.numeric_reservoirs?.includes(reservoirKey) === true);
  const numerical = useNumericalArchive(enabled, reservoirKey, index.dates),
    archive = numerical.archive;
  const publishArea = archive ? canPublishArea(archive) : false,
    validation = archive?.meta.validation;
  const channel = archive?.meta.classification_channel ?? "HH";
  const ratio =
    ratioOverride?.key === reservoirKey
      ? ratioOverride.value
      : (archive?.meta.analysis?.threshold_ratio ?? 0.6);
  const landMedian =
    archive?.meta.analysis?.land_median_db_by_date[acquisition.utc_date];
  const threshold =
    landMedian === undefined ? null : relativeThresholdDb(ratio, landMedian);
  const estimate =
    archive &&
    publishArea &&
    hasRelativeAnalysis(archive) &&
    landMedian !== undefined
      ? estimateRelativeArea(
          archive.analysis.frames[acquisition.utc_date],
          archive.analysis.mask,
          ratio,
          landMedian,
          archive.meta.analysis.pixel_area_m2,
        )
      : null;
  const current = series?.records.find(
    (r) => r.nisar_utc_date === acquisition.utc_date,
  );
  const lowest = series?.records
    .filter((r) => r.pct !== null)
    .reduce<
      OfficialSeries["records"][number] | undefined
    >((best, r) => (!best || r.pct! < best.pct! ? r : best), undefined);
  const name = lang === "en" ? reservoir.name : reservoir.name_zh;
  useEffect(() => {
    const url = new URL(window.location.href);
    url.search = explorerSearch(state, index, url.search);
    window.history.replaceState(null, "", url);
    document.documentElement.lang = lang === "en" ? "en" : "zh-Hant";
    const title =
      lang === "en"
        ? "Taiwan’s Water Pulse — a year through radar"
        : "台灣水庫的旱澇節奏｜以雷達回顧一年";
    const description =
      lang === "en"
        ? "Explore calibrated NISAR reservoir imagery, compare dates, and examine experimental water-area estimates alongside official observations."
        : "探索 NISAR 水庫校準影像、滑動比較日期，並對照實驗性水面積估算與水利署官方觀測。";
    document.title = title;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", description);
    document
      .querySelector('meta[property="og:title"]')
      ?.setAttribute("content", title);
    document
      .querySelector('meta[property="og:description"]')
      ?.setAttribute("content", description);
    document
      .querySelector('meta[property="og:locale"]')
      ?.setAttribute("content", lang === "en" ? "en_US" : "zh_TW");
  }, [state, index, lang]);
  useEffect(() => {
    const handle = () => {
      setState({
        ...parseExplorerState(
          window.location.search,
          index,
          navigator.language,
        ),
        demo: false,
      });
      setPlaying(false);
      setChapter(null);
    };
    window.addEventListener("popstate", handle);
    return () => window.removeEventListener("popstate", handle);
  }, [index]);
  useEffect(() => {
    const controller = new AbortController();
    setGauge(null);
    setGaugeError(false);
    const cached = officialCache.current.get(reservoirKey);
    if (cached) {
      setGauge({ key: reservoirKey, series: cached });
      return () => controller.abort();
    }
    void loadJson(
      `official/${reservoirKey}.json`,
      parseOfficial,
      controller.signal,
    )
      .then((series) => {
        if (!controller.signal.aborted) {
          officialCache.current.set(reservoirKey, series);
          setGauge({ key: reservoirKey, series });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setGaugeError(true);
      });
    return () => controller.abort();
  }, [reservoirKey, gaugeRetry]);
  useEffect(() => {
    if (!playing || !archive) return;
    const id = window.setInterval(
      () =>
        setState((s) => ({
          ...s,
          dateIndex: (s.dateIndex + 1) % index.dates.length,
        })),
      1500,
    );
    return () => window.clearInterval(id);
  }, [playing, archive, index.dates.length]);
  const goChapter = (i: number) => {
    const c = chapters[i];
    setChapter(i);
    setPlaying(false);
    setView("compare");
    setState((s) => ({
      ...s,
      reservoirKey: c.reservoir,
      dateIndex: nearestAcquisition(index.dates, c.date),
      compareDateIndex: nearestAcquisition(index.dates, c.compare),
    }));
  };
  useEffect(() => {
    if (!demo) {
      setDemoReady(false);
      setDemoError(false);
      return;
    }
    if (!archive || demoReady) return;
    const controller = new AbortController();
    setDemoError(false);
    async function prepare() {
      for (const key of ["baoshan2", "liyutan", "feitsui"]) {
        await preloadNumericalArchive(key, index.dates, controller.signal);
        if (!officialCache.current.has(key)) {
          const records = await loadJson(
            `official/${key}.json`,
            parseOfficial,
            controller.signal,
          );
          if (!controller.signal.aborted)
            officialCache.current.set(key, records);
        }
      }
      if (!controller.signal.aborted) setDemoReady(true);
    }
    void prepare().catch(() => {
      if (!controller.signal.aborted) setDemoError(true);
    });
    return () => controller.abort();
  }, [demo, archive, demoReady, demoRetry, index.dates]);
  const demoStarted = useRef(false);
  useEffect(() => {
    if (!demo) {
      demoStarted.current = false;
      return;
    }
    if (!demoReady || demoStarted.current) return;
    demoStarted.current = true;
    const c = chapters[0];
    setChapter(0);
    setView("compare");
    setState((s) => ({
      ...s,
      lang: "en",
      reservoirKey: c.reservoir,
      dateIndex: nearestAcquisition(index.dates, c.date),
      compareDateIndex: nearestAcquisition(index.dates, c.compare),
    }));
  }, [demo, demoReady, index.dates]);
  useEffect(() => {
    if (!demo || !demoReady || !archive || chapter === null) return;
    const timer = window.setTimeout(() => {
      if (chapter === chapters.length - 1) {
        setState((s) => ({ ...s, demo: false }));
        return;
      }
      const c = chapters[chapter + 1];
      setChapter(chapter + 1);
      setState((s) => ({
        ...s,
        reservoirKey: c.reservoir,
        dateIndex: nearestAcquisition(index.dates, c.date),
        compareDateIndex: nearestAcquisition(index.dates, c.compare),
      }));
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [demo, demoReady, archive, chapter, index.dates]);
  const selectDate = (i: number) => {
    setPlaying(false);
    setChapter(null);
    setState((s) => ({ ...s, dateIndex: i, demo: false }));
  };
  const selectReservoir = (key: string) => {
    setPlaying(false);
    setChapter(null);
    setShowWater(false);
    setState((s) => ({ ...s, reservoirKey: key, demo: false }));
  };
  const storyText =
    chapter === 0
      ? t(
          "Begin with the reservoir outline and the dark, low-return parts of the radar image. Move the divider to compare the starting scene with the later low-storage observation; the outline stays fixed.",
          "先辨認水庫輪廓與影像中低回波的暗色區域。拖動分隔線，將起點與後來低蓄水期的影像對照；輪廓位置保持固定。",
        )
      : chapter === 1
        ? t(
            "Compare the shoreline and dark patches with the full-storage scene. Backscatter changes are visible, but darkness alone does not establish water extent. Examine the experimental estimates and their validation below.",
            "與滿庫影像比較岸線及暗色區域。回波的變化可以觀察，但暗色不一定就是水；請一併查看下方的實驗性估算與驗證。",
          )
        : chapter === 2
          ? t(
              "The two radar images bracket a gap, not a continuous recovery. The lowest sampled official storage falls inside that gap: radar missed it. We preserve the missing interval rather than inventing an image.",
              "兩張雷達影像之間是觀測缺口，並不是連續回補的動畫。官方取樣最低蓄水率落在空白中，雷達錯過了它；這裡保留缺口，不補造影像。",
            )
          : chapter === 3
            ? t(
                "Radar observations resume after the gap. Compare the dark-water pattern with March; official storage provides a separate measure of recovery. Surface area and storage are different quantities.",
                "缺口後雷達觀測恢復，將水面低回波的分布與三月對照；官方蓄水率則提供另一種回補尺度。水面積與蓄水量是不同的物理量。",
              )
            : t(
                "Feitsui follows a different storage trajectory. Read its radar frames alongside the gauge record. Rainfall, terrain and reservoir operations are possible explanations, not established causes here.",
                "翡翠水庫呈現不同的蓄水軌跡。並讀雷達影格與官方紀錄；降雨、地形與調度是可能解釋，本作品尚未證實其因果關係。",
              );
  return (
    <div className={demo ? "is-demo" : undefined}>
      <a className="skip-link" href="#explorer">
        {t("Skip to the explorer", "跳至互動探索")}
      </a>
      <header className="site-header">
        <a className="brand" href={import.meta.env.BASE_URL}>
          <PulseIcon />
          <span>
            Taiwan’s Water Pulse
            <small>
              {t("A landscape, in time", "台灣水庫的旱澇節奏")} · SI-generated
              icon
            </small>
          </span>
        </a>
        <nav aria-label={t("Main navigation", "主要導覽")}>
          <a href="#explorer">{t("Explore", "探索")}</a>
          <a href="#story">{t("The story", "故事")}</a>
          <a href="#methods">{t("Data & methods", "資料與方法")}</a>
        </nav>
        <div
          className="language-control"
          role="group"
          aria-label={t("Language", "語言")}
        >
          {(["en", "zh-TW"] as Language[]).map((l) => (
            <button
              key={l}
              aria-pressed={lang === l}
              onClick={() => setState((s) => ({ ...s, lang: l, demo: false }))}
            >
              {l === "en" ? "EN" : "繁中"}
            </button>
          ))}
        </div>
      </header>
      <main>
        <section className="intro">
          <div>
            <p className="eyebrow">NISAR · L-BAND · TAIWAN</p>
            <h1>
              {t("Watch the water’s edge change.", "看見水面，隨時間改變。")}
            </h1>
            <p>
              {t(
                "A year of reservoir observations, through calibrated radar and official water records.",
                "以校準雷達影像與官方觀測，回顧水庫一年間的退水與回補。",
              )}
            </p>
          </div>
          <div className="archive-tag">
            <strong>2025.11 — 2026.10</strong>
            <span>
              {index.dates.length} {t("radar passes", "次取像")} ·{" "}
              {index.reservoirs.length} {t("reservoirs", "座水庫")}
            </span>
            <a href="#methods">
              {t(
                "Historical archive · read the limits ↗",
                "歷史觀測資料 · 判讀限制 ↗",
              )}
            </a>
          </div>
        </section>
        <section
          id="story"
          className="story-panel"
          aria-label={t("Five chapters", "五幕故事")}
        >
          <div className="story-chapters">
            {chapters.map((c, i) => (
              <button
                key={c.en}
                aria-pressed={chapter === i}
                onClick={() => {
                  setState((s) => ({ ...s, demo: false }));
                  goChapter(i);
                }}
              >
                <span>0{i + 1}</span>
                {t(c.en, c.zh)}
              </button>
            ))}
            <button
              className="demo-button"
              onClick={() => {
                setPlaying(false);
                setState((s) => ({
                  ...s,
                  demo: !s.demo,
                  lang: s.demo ? s.lang : "en",
                }));
              }}
            >
              {demo ? "Stop demo" : t("▶ 30s tour", "▶ 30 秒導覽")}
            </button>
          </div>
          {demo && !demoReady && (
            <p className="demo-status" role="status">
              {demoError
                ? "The tour could not preload imagery."
                : "Preparing all tour imagery before the 30-second sequence…"}
              {demoError && (
                <button onClick={() => setDemoRetry((n) => n + 1)}>
                  Retry tour
                </button>
              )}
            </p>
          )}
          {chapter !== null && (!demo || demoReady) && (
            <div className="story-caption" aria-live="polite">
              <strong>{t(chapters[chapter].en, chapters[chapter].zh)}</strong>
              <p>{storyText}</p>
              {current?.pct != null && (
                <p className="story-evidence">
                  WRA · {fmt(current.local_date)} · {current.pct.toFixed(1)}%{" "}
                  {t("storage", "蓄水率")}
                  {chapter === 2 &&
                    lowest &&
                    ` · ${t("Lowest sampled", "取樣最低值")} ${fmt(lowest.local_date)}: ${lowest.pct!.toFixed(1)}%`}
                </p>
              )}
            </div>
          )}
        </section>
        <section
          id="explorer"
          className="explorer"
          aria-label={t("Reservoir explorer", "水庫探索")}
        >
          <div className="reservoir-list">
            {index.reservoirs.map((r, i) => (
              <button
                key={r.key}
                aria-pressed={r.key === reservoirKey}
                onClick={() => selectReservoir(r.key)}
              >
                <span className="reservoir-number">0{i + 1}</span>
                <span>
                  <strong>{lang === "en" ? r.name : r.name_zh}</strong>
                  <small>{lang === "en" ? r.name_zh : r.name}</small>
                </span>
                <span aria-hidden="true">↗</span>
              </button>
            ))}
          </div>
          <div className="workspace">
            <div className="main-column">
              <section className="radar-card">
                <div className="card-heading">
                  <div>
                    <p className="eyebrow">
                      01 / {t("READ THE RADAR", "閱讀雷達影像")}
                    </p>
                    <h2>{name}</h2>
                  </div>
                  <div
                    className="channel-control"
                    role="group"
                    aria-label={t("Radar polarization", "雷達極化通道")}
                  >
                    {(["HH", "HV"] as Polarization[]).map((pol) => (
                      <button
                        key={pol}
                        aria-pressed={pol === polarization}
                        onClick={() =>
                          setState((s) => ({ ...s, polarization: pol }))
                        }
                      >
                        {pol}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="scene-meta">
                  <span>{fmt(acquisition.utc_date)} UTC</span>
                  <span>
                    {t(
                      "Track 111 · Frame 014 · ascending",
                      "升軌 Track 111 · Frame 014",
                    )}
                  </span>
                </div>
                <div
                  className="view-switch"
                  role="group"
                  aria-label={t("Image view", "影像檢視")}
                >
                  <button
                    aria-pressed={view === "compare"}
                    onClick={() => setView("compare")}
                  >
                    {t("Compare dates", "比較兩個日期")}
                  </button>
                  <button
                    aria-pressed={view === "single"}
                    onClick={() => setView("single")}
                  >
                    {t("Inspect a scene", "檢視單一影像")}
                  </button>
                </div>
                {archive ? (
                  view === "compare" ? (
                    <Comparison
                      archive={archive}
                      date={acquisition.utc_date}
                      compareDate={compareDate}
                      polarization={polarization}
                      lang={lang}
                    />
                  ) : (
                    <RadarViewer
                      archive={archive}
                      date={acquisition.utc_date}
                      polarization={polarization}
                      lang={lang}
                      ratio={ratio}
                      showWater={publishArea && showWater}
                    />
                  )
                ) : (
                  <div
                    className="scene-status"
                    role={numerical.error ? "alert" : "status"}
                  >
                    <p>
                      {numerical.error
                        ? t(
                            "This reservoir’s calibrated imagery could not be loaded.",
                            "無法載入此水庫的校準影像。",
                          )
                        : t(
                            "Loading calibrated reservoir imagery…",
                            "正在載入水庫校準影像…",
                          )}
                    </p>
                    {numerical.error && (
                      <button onClick={numerical.retry}>
                        {t("Retry imagery", "重新載入影像")}
                      </button>
                    )}
                  </div>
                )}
                {view === "compare" && (
                  <div className="comparison-controls">
                    <label>
                      {t("Compare with", "比較日期")}
                      <select
                        value={compareDateIndex}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            compareDateIndex: Number(e.target.value),
                            demo: false,
                          }))
                        }
                      >
                        {index.dates.map((d, i) => (
                          <option key={d.utc_date} value={i}>
                            {fmt(d.utc_date)} UTC
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      onClick={() => {
                        selectDate(
                          nearestAcquisition(index.dates, "2025-11-05"),
                        );
                        setState((s) => ({
                          ...s,
                          compareDateIndex: nearestAcquisition(
                            index.dates,
                            "2026-03-17",
                          ),
                        }));
                      }}
                    >
                      {t("Start → last before gap", "起點 → 缺口前最後觀測")}
                    </button>
                    <button
                      onClick={() => {
                        selectDate(
                          nearestAcquisition(index.dates, "2026-03-17"),
                        );
                        setState((s) => ({
                          ...s,
                          compareDateIndex: nearestAcquisition(
                            index.dates,
                            "2026-06-21",
                          ),
                        }));
                      }}
                    >
                      {t("Before → after the gap", "缺口前 → 缺口後")}
                    </button>
                  </div>
                )}
                <p className="channel-note">
                  {polarization === "HH"
                    ? t(
                        "HH: horizontal transmit, horizontal receive.",
                        "HH：水平發射、水平接收。",
                      )
                    : t(
                        "HV: horizontal transmit, vertical receive.",
                        "HV：水平發射、垂直接收。",
                      )}{" "}
                  {t(
                    "These are measured channels, not synthesized observations.",
                    "切換的是實際量測通道，不是生成新的觀測。",
                  )}
                </p>
              </section>
              <section
                className="timeline-card"
                aria-label={t("Acquisition timeline", "取像時間軸")}
              >
                <div className="section-heading">
                  <h3>{t("Follow the observations", "沿著時間探索")}</h3>
                  <span>
                    {dateIndex + 1} / {index.dates.length}
                  </span>
                </div>
                <div className="timeline-controls">
                  <button
                    className="play-button"
                    aria-label={
                      playing
                        ? t("Pause", "暫停")
                        : t("Play observations", "播放觀測")
                    }
                    disabled={!archive}
                    onClick={() => {
                      setView("single");
                      setChapter(null);
                      setState((s) => ({ ...s, demo: false }));
                      setPlaying((p) => !p);
                    }}
                  >
                    {playing ? "Ⅱ" : "▶"}
                  </button>
                  <div className="timeline-track">
                    <div className="track-line" />
                    <div
                      className="timeline-gap"
                      style={{
                        left: `${datePosition(index.gap.start, index.dates[0].utc_date, index.dates.at(-1)!.utc_date)}%`,
                        width: `${datePosition(index.gap.end, index.dates[0].utc_date, index.dates.at(-1)!.utc_date) - datePosition(index.gap.start, index.dates[0].utc_date, index.dates.at(-1)!.utc_date)}%`,
                      }}
                    />
                    <div
                      role="group"
                      aria-label={t(
                        "Observation dates; use arrow keys",
                        "觀測日期；使用方向鍵切換",
                      )}
                    >
                      {index.dates.map((d, i) => (
                        <button
                          className="timeline-tick"
                          key={d.utc_date}
                          tabIndex={i === dateIndex ? 0 : -1}
                          aria-label={`${fmt(d.utc_date)} UTC`}
                          aria-pressed={i === dateIndex}
                          style={{
                            left: `${datePosition(d.utc_date, index.dates[0].utc_date, index.dates.at(-1)!.utc_date)}%`,
                          }}
                          onClick={() => selectDate(i)}
                          onKeyDown={(e) => {
                            const next =
                              e.key === "ArrowRight"
                                ? Math.min(index.dates.length - 1, i + 1)
                                : e.key === "ArrowLeft"
                                  ? Math.max(0, i - 1)
                                  : e.key === "Home"
                                    ? 0
                                    : e.key === "End"
                                      ? index.dates.length - 1
                                      : null;
                            if (next !== null) {
                              e.preventDefault();
                              selectDate(next);
                              (
                                e.currentTarget.parentElement?.children[
                                  next
                                ] as HTMLElement
                              )?.focus();
                            }
                          }}
                        >
                          <span />
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => selectDate(Math.max(0, dateIndex - 1))}
                    disabled={dateIndex === 0}
                    aria-label={t("Previous observation", "上一筆觀測")}
                  >
                    ←
                  </button>
                  <button
                    onClick={() =>
                      selectDate(
                        Math.min(index.dates.length - 1, dateIndex + 1),
                      )
                    }
                    disabled={dateIndex === index.dates.length - 1}
                    aria-label={t("Next observation", "下一筆觀測")}
                  >
                    →
                  </button>
                </div>
                <p className="timeline-note">
                  {t(
                    "Actual time spacing · no radar product",
                    "按實際時間間距排列 · 無雷達產品",
                  )}{" "}
                  {index.gap.start} — {index.gap.end} UTC
                </p>
                {archive && (
                  <Filmstrip
                    archive={archive}
                    dates={index.dates}
                    selectedDate={acquisition.utc_date}
                    polarization={polarization}
                    lang={lang}
                    gap={index.gap}
                    onSelect={selectDate}
                  />
                )}
              </section>
            </div>
            <aside className="insights">
              <section className="official-card">
                <p className="eyebrow">
                  02 / {t("OFFICIAL CONTEXT", "官方觀測脈絡")}
                </p>
                <h3>
                  {t("Storage, independently observed", "獨立觀測的蓄水狀態")}
                </h3>
                {gaugeError ? (
                  <>
                    <p role="alert">
                      {t(
                        "Official records could not be loaded.",
                        "官方資料載入失敗。",
                      )}
                    </p>
                    <button onClick={() => setGaugeRetry((n) => n + 1)}>
                      {t("Retry", "重試")}
                    </button>
                  </>
                ) : (
                  <>
                    <div className="big-metric">
                      {current?.pct != null ? current.pct.toFixed(1) : "—"}
                      <span>%</span>
                    </div>
                    <p>
                      {t("Water level", "水位")}{" "}
                      <strong>
                        {current?.level_m != null
                          ? `${current.level_m.toFixed(2)} m`
                          : "—"}
                      </strong>
                    </p>
                    <p className="secondary">
                      {current
                        ? `${fmt(current.local_date)} · 07:00 UTC+8`
                        : t("No paired record", "無配對觀測")}
                    </p>
                  </>
                )}
                <p className="secondary">
                  {t(
                    "Storage is a gauge observation. Radar measures backscatter, not stored volume.",
                    "蓄水率來自官方觀測。雷達量測回波，不直接量測蓄水量。",
                  )}
                </p>
              </section>
              {archive && (
                <section className="validation-card">
                  <p className="eyebrow">{t("METHOD CHECK", "方法評估")}</p>
                  <h3>{t("Reservoir-specific evidence", "逐庫檢視證據")}</h3>
                  <span className="grade-badge">
                    {t("Grade", "等級")} {validation?.grade ?? "C"} ·{" "}
                    {publishArea
                      ? t("Experimental", "實驗性")
                      : t("Imagery only", "僅影像")}
                  </span>
                  <dl className="stat-list">
                    <dt>Pearson r</dt>
                    <dd>
                      {validation?.pearson_area_vs_level?.toFixed(3) ?? "—"}
                    </dd>
                    <dt>Spearman ρ</dt>
                    <dd>
                      {validation?.spearman_area_vs_level?.toFixed(3) ?? "—"}
                    </dd>
                    <dt>n</dt>
                    <dd>{validation?.n ?? "—"}</dd>
                    <dt>{t("Pearson 95% CI", "Pearson 95% 區間")}</dt>
                    <dd>
                      {validation?.pearson_ci95
                        ?.map((v) => v.toFixed(2))
                        .join(" – ") ?? "—"}
                    </dd>
                  </dl>
                  <p className="secondary">
                    {t(
                      "Image-only threshold. These correlations describe sampled dates, not an independent validation pass.",
                      "門檻只由影像決定。相關係數描述這批日期，不代表通過獨立驗證。",
                    )}
                  </p>
                  {validation?.pearson_ci95 &&
                    validation.pearson_ci95[0] < 0 && (
                      <p className="confidence-note">
                        {t(
                          "Low confidence: the correlation interval crosses zero. This experiment does not establish reliable tracking for this reservoir.",
                          "低信心：相關係數區間跨越 0，這項實驗尚未建立此水庫的可靠追蹤能力。",
                        )}
                      </p>
                    )}
                  <a href="#methods">
                    {t("How grades work ↗", "分級與限制 ↗")}
                  </a>
                </section>
              )}
              {archive && publishArea && estimate && (
                <section className="threshold-card">
                  <h3>{t("Explore the threshold", "探索分類門檻")}</h3>
                  <p>
                    {channel} · {(ratio * 100).toFixed(0)}% ×{" "}
                    {t("land median", "周邊中位數")} · {threshold?.toFixed(2)}{" "}
                    dB · {t("Experimental", "實驗性")}
                  </p>
                  <label htmlFor="threshold">
                    {t("Candidate water threshold", "候選水體門檻")}
                  </label>
                  <input
                    id="threshold"
                    type="range"
                    min={0.3}
                    max={0.9}
                    step={0.01}
                    value={ratio}
                    onChange={(e) => {
                      setRatioOverride({
                        key: reservoirKey,
                        value: Number(e.target.value),
                      });
                      setShowWater(true);
                      setView("single");
                    }}
                  />
                  <div className="area-estimate">
                    <strong>{estimate.area.toFixed(3)} km²</strong>
                    <span>
                      {estimate.low.toFixed(3)} – {estimate.high.toFixed(3)} km²
                      (ratio ±10 pp)
                    </span>
                  </div>
                  <div className="button-row">
                    <button
                      aria-pressed={showWater}
                      onClick={() => {
                        setShowWater((v) => !v);
                        setView("single");
                      }}
                    >
                      {t("Water overlay", "水體疊色")}
                    </button>
                    <button onClick={() => setRatioOverride(null)}>
                      {t("Reset", "重設")}
                    </button>
                  </div>
                  <p className="secondary">
                    {t(
                      "The slider changes this scene only. Charts and grades retain the frozen threshold; sensitivity is not a confidence interval.",
                      "滑桿僅改變此影像。圖表與等級仍使用固定門檻；敏感度範圍不是信賴區間。",
                    )}
                  </p>
                </section>
              )}
              <section className="locator-card">
                <h3>{t("Place in context", "地理位置")}</h3>
                <Locator
                  reservoir={reservoir}
                  reservoirs={index.reservoirs}
                  lang={lang}
                />
                {archive && (
                  <SceneOverview
                    archive={archive}
                    browsePath={acquisition.browse[polarization]}
                    lang={lang}
                  />
                )}
              </section>
            </aside>
          </div>
        </section>
        <section id="analysis" className="analysis-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">
                03 / {t("READ THE EVIDENCE", "對照觀測證據")}
              </p>
              <h2>
                {t("Two measurements. One timeline.", "兩種觀測，同一段時間。")}
              </h2>
            </div>
            <a
              href={dataUrl(`reservoirs/${reservoirKey}/timeseries.csv`)}
              download
            >
              {t("Download CSV ↓", "下載 CSV ↓")}
            </a>
          </div>
          <p>
            {publishArea
              ? t(
                  "Radar candidate-water area above; official storage below. Bars show threshold sensitivity (ratio ±10 pp). The missing radar interval stays empty.",
                  "上圖是雷達候選水面積，下圖是官方蓄水率。誤差棒表示周邊中位數 50%／70% 門檻的敏感度範圍；雷達缺口保持留白。",
                )
              : t(
                  "Area estimates are unavailable or still loading. Official storage provides context; the method assessment explains why area values are withheld.",
                  "此水庫的面積估算尚未載入或未提供。官方蓄水率提供脈絡；方法評估說明不展示面積數值的原因。",
                )}
          </p>
          {series && (
            <AnalysisCharts
              archive={archive ?? undefined}
              records={series.records}
              dates={index.dates}
              selected={acquisition}
              onSelect={selectDate}
              gap={index.gap}
              lang={lang}
              showArea={publishArea}
            />
          )}
          {archive && publishArea && (
            <ScatterPlot
              archive={archive}
              dates={index.dates}
              selected={acquisition}
              onSelect={selectDate}
              gap={index.gap}
              lang={lang}
              showArea={publishArea}
            />
          )}
        </section>
        {archive && publishArea && (
          <div className="analysis-science-grid">
            <FrequencyMap archive={archive} lang={lang} />
            <PolarizationSeparation archive={archive} lang={lang} />
          </div>
        )}
        <ProjectInfo
          index={index}
          acquisition={acquisition}
          archive={archive}
          series={series}
          lang={lang}
        />
      </main>
    </div>
  );
}

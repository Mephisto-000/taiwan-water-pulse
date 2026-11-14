import WeatherContext from "./components/WeatherContext";
// SI-assisted interface and copy. Source observations are not SI-generated.
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type CSSProperties,
} from "react";
import EventNotes from "./components/EventNotes";
import Comparison from "./components/Comparison";
import AcquisitionTimeline from "./components/AcquisitionTimeline";
import AnalysisCharts, { ScatterPlot } from "./components/AnalysisCharts";
import { RadarCanvas } from "./components/RadarViewer";
import WorkspaceInspector, {
  type InspectorTab,
} from "./components/WorkspaceInspector";
import {
  canPublishArea,
  parseNumericMeta,
  parseAreaSeries,
  useNumericalArchive,
} from "./numerical";
import { bilingual, resolveLanguage } from "./i18n";
import { explorerSearch, parseExplorerState } from "./state";
import {
  formatAcquisitionDate,
  formatAcquisitionTime,
  loadJson,
  nearestAcquisition,
  parseIndex,
  parseOfficial,
  type DataIndex,
  type OfficialSeries,
  type Polarization,
} from "./domain";
import { buildAcquisitionSlots } from "./timeline";
import {
  gradeDescription,
  lowestObservation,
  observationAt,
  relativeChange,
  sparklinePath,
  type ReservoirSummary,
} from "./workspace";

type View = "single" | "side-by-side" | "swipe";
function initialTheme(): "light" | "dark" {
  try {
    const saved = localStorage.getItem("water-pulse-theme");
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    /* A private browser may disallow persistence. */
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}
function Sparkline({ summary }: { summary?: ReservoirSummary }) {
  return (
    <svg viewBox="0 0 56 20" className="reservoir-spark" aria-hidden="true">
      <path
        d={summary ? sparklinePath(summary.series.records) : ""}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}
export default function App() {
  const [index, setIndex] = useState<DataIndex | null>(null);
  const [error, setError] = useState(false),
    [retry, setRetry] = useState(0);
  const query = new URLSearchParams(window.location.search);
  const lang = resolveLanguage(query.get("lang"), navigator.language);
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
        <div className="boot-mark" aria-hidden="true">
          ≈
        </div>
        <h1>{t("Taiwan’s Water Pulse", "台灣水庫的旱澇節奏")}</h1>
        <p role={error ? "alert" : "status"}>
          {error
            ? t("The archive could not be loaded.", "觀測資料載入失敗。")
            : t("Opening the observation workspace…", "正在開啟觀測工作區…")}
        </p>
        {error && (
          <button onClick={() => setRetry((n) => n + 1)}>
            {t("Try again", "再試一次")}
          </button>
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
  const [theme, setTheme] = useState(initialTheme);
  const [view, setView] = useState<View>("swipe"),
    [showWater, setShowWater] = useState(true),
    [showEdge, setShowEdge] = useState(true);
  const [section, setSection] = useState<"image" | "charts">("image");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("day"),
    [inspectorOpen, setInspectorOpen] = useState(false);
  const [playing, setPlaying] = useState(false),
    [chapter, setChapter] = useState(0);
  const [tourPlaying, setTourPlaying] = useState(
    () =>
      state.demo &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [summaries, setSummaries] = useState<ReservoirSummary[]>([]),
    [summaryError, setSummaryError] = useState(false),
    [summaryRetry, setSummaryRetry] = useState(0);
  const [gauge, setGauge] = useState<{
      key: string;
      series: OfficialSeries;
    } | null>(null),
    [gaugeError, setGaugeError] = useState(false),
    [gaugeRetry, setGaugeRetry] = useState(0);
  const officialCache = useRef(new Map<string, OfficialSeries>());
  const initialDateResolved = useRef(
    new URLSearchParams(window.location.search).has("date") || demo,
  );
  const tourStarted = useRef(false),
    imageRef = useRef<HTMLDivElement>(null);
  const reservoir = index.reservoirs.find((r) => r.key === reservoirKey)!;
  const acquisition = index.dates[dateIndex],
    reference = index.dates[compareDateIndex];
  const numerical = useNumericalArchive(true, reservoirKey, index.dates, {
    selectedDate: acquisition.utc_date,
    referenceDate: reference.utc_date,
    polarization,
  });
  const archive = numerical.archive,
    publishArea = canPublishArea(archive);
  const official = gauge?.key === reservoirKey ? gauge.series : null;
  const activeSummary = summaries.find((s) => s.key === reservoirKey);
  const records = archive?.series ?? activeSummary?.series;
  const observation = observationAt(records, acquisition.utc_date),
    refObservation = observationAt(records, reference.utc_date);
  const current = official?.records.find(
    (r) => r.nisar_utc_date === acquisition.utc_date,
  );
  const pct = current?.pct ?? observation?.official.pct;
  const grade =
    archive?.meta.validation.grade ?? activeSummary?.meta.validation.grade;
  const schedule = useMemo(
    () => buildAcquisitionSlots(index.dates),
    [index.dates],
  );
  const observedSummary = useMemo(
    () =>
      archive
        ? summaries.map((s) =>
            s.key === reservoirKey
              ? {
                  key: reservoirKey,
                  meta: archive.meta,
                  series: archive.series,
                }
              : s,
          )
        : summaries,
    [archive, summaries, reservoirKey],
  );
  const name = lang === "en" ? reservoir.name : reservoir.name_zh;
  const fullReference =
    refObservation?.official.pct != null && refObservation.official.pct >= 99.5;
  const referenceLabel = `${t(fullReference ? "Full pool" : "Start", fullReference ? "滿庫" : "起點")} ${formatAcquisitionDate(reference, true, lang)}`;
  const selectedLabel = `${t("Selected", "選取日")} ${formatAcquisitionDate(acquisition, true, lang)}`;
  const pauseInteraction = () => {
    setPlaying(false);
    setTourPlaying(false);
  };
  const selectDate = (i: number) => {
    pauseInteraction();
    setState((s) => ({ ...s, dateIndex: i }));
  };
  const selectReservoir = (key: string) => {
    pauseInteraction();
    setState((s) => ({ ...s, reservoirKey: key }));
  };
  const openInspector = (tab: InspectorTab) => {
    setInspectorTab(tab);
    setInspectorOpen(true);
  };
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("water-pulse-theme", theme);
    } catch {
      /* Optional preference persistence. */
    }
  }, [theme]);
  useEffect(() => {
    const url = new URL(window.location.href);
    url.search = explorerSearch(state, index, url.search);
    window.history.replaceState(null, "", url);
    document.documentElement.lang = lang === "en" ? "en" : "zh-Hant";
    document.title = t(
      "Taiwan’s Water Pulse — radar workspace",
      "台灣水庫的旱澇節奏｜雷達觀測工作區",
    );
  }, [state, index, lang]);
  useEffect(() => {
    const pop = () => {
      setState(
        parseExplorerState(window.location.search, index, navigator.language),
      );
      setPlaying(false);
      setTourPlaying(false);
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, [index]);
  useEffect(() => {
    const controller = new AbortController();
    setSummaryError(false);
    void Promise.all(
      index.reservoirs.map(async (r) => {
        const [meta, series] = await Promise.all([
          loadJson(
            `reservoirs/${r.key}/meta.json`,
            parseNumericMeta,
            controller.signal,
          ),
          loadJson(
            `reservoirs/${r.key}/timeseries.json`,
            (value) => parseAreaSeries(value, index.dates),
            controller.signal,
          ),
        ]);
        return { key: r.key, meta, series };
      }),
    )
      .then(setSummaries)
      .catch(() => {
        if (!controller.signal.aborted) setSummaryError(true);
      });
    return () => controller.abort();
  }, [index, summaryRetry]);
  useEffect(() => {
    if (initialDateResolved.current || !records) return;
    initialDateResolved.current = true;
    const low = lowestObservation(records);
    if (low)
      setState((s) => ({
        ...s,
        dateIndex: nearestAcquisition(index.dates, low.utc.slice(0, 10)),
        compareDateIndex: 0,
      }));
  }, [records, index.dates]);
  useEffect(() => {
    const controller = new AbortController();
    setGaugeError(false);
    setGauge(null);
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
  const playbackFrameReady =
    !!archive?.frames[acquisition.utc_date]?.[polarization] &&
    (view === "single" ||
      !!archive?.frames[reference.utc_date]?.[polarization]);
  useEffect(() => {
    if (!playing || !playbackFrameReady) return;
    const id = window.setTimeout(
      () =>
        setState((s) => ({
          ...s,
          dateIndex: (s.dateIndex + 1) % index.dates.length,
        })),
      1500,
    );
    return () => window.clearTimeout(id);
  }, [
    playing,
    playbackFrameReady,
    acquisition.utc_date,
    reference.utc_date,
    polarization,
    reservoirKey,
    view,
    index.dates.length,
  ]);
  const mainSummary = summaries.find((s) => s.key === "baoshan2");
  const lowDate = mainSummary
    ? lowestObservation(mainSummary.series)?.utc.slice(0, 10)
    : undefined;
  const lowIndex = nearestAcquisition(
    index.dates,
    lowDate ?? acquisition.utc_date,
  );
  const afterGap = index.dates.findIndex((d) => d.utc_date > index.gap.end);
  const chapterDates = [0, lowIndex, lowIndex, Math.max(0, afterGap), lowIndex];
  const goChapter = (next: number) => {
    setChapter(next);
    setPlaying(false);
    setView("swipe");
    setSection("image");
    setState((s) => ({
      ...s,
      reservoirKey: "baoshan2",
      polarization: "HH",
      dateIndex: chapterDates[next],
      compareDateIndex: next === 2 ? Math.max(0, afterGap) : 0,
      demo: true,
    }));
    if (next === 4) openInspector("methods");
  };
  useEffect(() => {
    if (!demo) {
      tourStarted.current = false;
      return;
    }
    if (tourStarted.current || !mainSummary) return;
    tourStarted.current = true;
    goChapter(0);
  }, [demo, mainSummary]);
  const tourFrameReady =
    !!mainSummary &&
    officialCache.current.has("baoshan2") &&
    !!archive?.frames[acquisition.utc_date]?.[polarization] &&
    !!archive?.frames[reference.utc_date]?.[polarization];
  useEffect(() => {
    if (!demo || !tourPlaying || !tourFrameReady) return;
    const id = window.setTimeout(() => {
      if (chapter === 4) {
        setTourPlaying(false);
        return;
      }
      goChapter(chapter + 1);
    }, 6000);
    return () => window.clearTimeout(id);
  }, [
    demo,
    tourPlaying,
    chapter,
    acquisition.utc_date,
    tourFrameReady,
    polarization,
  ]);
  useEffect(() => {
    const escape = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setTourPlaying(false);
        setState((s) => ({ ...s, demo: false }));
        setInspectorOpen(false);
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);
  const shortcuts = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      event.target instanceof HTMLElement &&
      event.target.closest("input,select,textarea,button,a")
    )
      return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      selectDate(
        Math.max(
          0,
          Math.min(
            index.dates.length - 1,
            dateIndex + (event.key === "ArrowRight" ? 1 : -1),
          ),
        ),
      );
    } else if (event.key === " ") {
      event.preventDefault();
      setTourPlaying(false);
      setPlaying((v) => !v);
    } else if (/^[1-4]$/.test(event.key)) {
      event.preventDefault();
      selectReservoir(index.reservoirs[Number(event.key) - 1].key);
    } else if (event.key.toLowerCase() === "c") {
      event.preventDefault();
      pauseInteraction();
      setView((v) => (v === "single" ? "swipe" : "single"));
    } else if (event.key.toLowerCase() === "h") {
      event.preventDefault();
      pauseInteraction();
      setState((s) => ({
        ...s,
        polarization: s.polarization === "HH" ? "HV" : "HH",
      }));
    }
  };
  const first = mainSummary?.series.records[0],
    low = mainSummary ? lowestObservation(mainSummary.series) : undefined;
  const returnRecord = mainSummary
    ? observationAt(
        mainSummary.series,
        index.dates[Math.max(0, afterGap)].utc_date,
      )
    : undefined;
  const storageChange = relativeChange(
      low?.official.storage_volume_m3,
      first?.official.storage_volume_m3,
    ),
    areaChange = relativeChange(low?.area_km2.primary, first?.area_km2.primary);
  const levelChange =
    first?.official.level_m != null && low?.official.level_m != null
      ? first.official.level_m - low.official.level_m
      : null;
  const number = (v: number | null | undefined, digits = 1) =>
    v == null ? "—" : v.toFixed(digits);
  const gapDays = schedule.gaps.find((g) => g.lastSlot > g.firstSlot)?.days;
  const lowestGauge = officialCache.current
    .get("baoshan2")
    ?.records.filter((r) => r.pct != null)
    .reduce<OfficialSeries["records"][number] | undefined>(
      (best, r) => (!best || r.pct! < best.pct! ? r : best),
      undefined,
    );
  const tourTexts = [
    t(
      `Radar passes at ${formatAcquisitionTime(index.dates[0], lang)}; the 07:00 gauge recorded ${number(first?.official.pct)}% storage in Baoshan II. The dark shape is the water surface: calm water reflects radar energy away.`,
      `清晨 ${formatAcquisitionTime(index.dates[0], lang)} 雷達通過；當日 07:00，寶山第二官方蓄水率 ${number(first?.official.pct)}%。暗色的形狀就是水面：平靜的水把雷達波反射到別處。`,
    ),
    t(
      `Water level fell ${number(levelChange)} m. Storage fell ${number(storageChange == null ? null : Math.abs(storageChange), 0)}%, while the radar surface shrank about ${number(areaChange == null ? null : Math.abs(areaChange), 0)}%. Surface area and stored volume respond differently.`,
      `水位下降 ${number(levelChange)} m。蓄水量減少 ${number(storageChange == null ? null : Math.abs(storageChange), 0)}%，雷達水面約縮小 ${number(areaChange == null ? null : Math.abs(areaChange), 0)}%。水面的變化與水量並不成比例。`,
    ),
    t(
      `There are no radar products for ${gapDays ?? "—"} days. Gauges kept recording; the sampled minimum was ${number(lowestGauge?.pct)}%. Radar missed the lowest point, so this interval stays empty.`,
      `接下來 ${gapDays ?? "—"} 天沒有雷達產品。水位站持續記錄，取樣最低蓄水率是 ${number(lowestGauge?.pct)}%。雷達錯過最低點，這段保留空白。`,
    ),
    t(
      `Radar observations resume. Storage is ${number(returnRecord?.official.pct)}% and the measured water surface is ${number(returnRecord?.area_km2.primary, 2)} km². Compare its shape with the first image.`,
      `缺口後雷達恢復觀測。蓄水率 ${number(returnRecord?.official.pct)}%，水面 ${number(returnRecord?.area_km2.primary, 2)} km²；可以與第一張影像比較形狀。`,
    ),
    t(
      "One method, four reservoirs. Read the evidence for each in Methods: the size of a change must exceed the method’s sensitivity before we can interpret it confidently.",
      "同一個方法用在四座水庫。方法分頁逐庫列出證據；變化必須超過方法敏感度，才能有把握地解讀。",
    ),
  ];
  const toggleTour = () => {
    if (demo) {
      setState((s) => ({ ...s, demo: false }));
      setTourPlaying(false);
    } else {
      goChapter(0);
      setTourPlaying(true);
    }
  };
  return (
    <div className="workspace-app">
      <a className="skip-link" href="#image-workspace">
        {t("Skip to imagery", "跳至影像")}
      </a>
      <header className="workspace-header">
        <a className="brand" href={import.meta.env.BASE_URL}>
          <span className="brand-symbol" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>{t("Taiwan’s Water Pulse", "台灣水庫的旱澇節奏")}</span>
        </a>
        <span className="header-context">
          <span>/</span> {name} <span>/</span>{" "}
          <time>{formatAcquisitionDate(acquisition, true, lang)}</time>
        </span>
        <nav
          className="header-actions"
          aria-label={t("Workspace navigation", "工作區導覽")}
        >
          <button
            className="header-methods"
            onClick={() => openInspector("methods")}
          >
            {t("Methods & data", "方法與資料")}
          </button>
          <button
            onClick={() =>
              setState((s) => ({
                ...s,
                lang: s.lang === "en" ? "zh-TW" : "en",
              }))
            }
            aria-label={t("Switch to Traditional Chinese", "切換英文")}
          >
            {lang === "en" ? "繁中" : "EN"}
          </button>
          <button
            className="theme-toggle"
            onClick={() => setTheme((v) => (v === "dark" ? "light" : "dark"))}
            aria-label={
              theme === "dark"
                ? t("Light theme", "淺色主題")
                : t("Dark theme", "深色主題")
            }
          >
            {theme === "dark" ? "☼" : "◐"}
          </button>
          <button className="primary-button tour-start" onClick={toggleTour}>
            {demo
              ? t("End tour", "結束導覽")
              : t("30-second tour", "30 秒導覽")}
          </button>
        </nav>
      </header>
      <div className="workspace-shell">
        <aside
          className="archive-sidebar"
          aria-label={t("Reservoir and acquisition archive", "水庫與觀測清單")}
        >
          <div className="sidebar-heading">
            <span>{t("Reservoirs", "水庫")}</span>
            <span className="key-hints">
              <kbd>1</kbd>–<kbd>4</kbd>
            </span>
          </div>
          <div
            className="reservoir-tabs"
            role="tablist"
            aria-label={t("Select a reservoir", "選擇水庫")}
          >
            {index.reservoirs.map((r, i) => {
              const summary = observedSummary.find((s) => s.key === r.key);
              return (
                <button
                  key={r.key}
                  role="tab"
                  aria-selected={r.key === reservoirKey}
                  tabIndex={r.key === reservoirKey ? 0 : -1}
                  onClick={() => selectReservoir(r.key)}
                  onKeyDown={(event) => {
                    const next =
                      event.key === "ArrowDown" || event.key === "ArrowRight"
                        ? (i + 1) % index.reservoirs.length
                        : event.key === "ArrowUp" || event.key === "ArrowLeft"
                          ? (i + index.reservoirs.length - 1) %
                            index.reservoirs.length
                          : null;
                    if (next != null) {
                      event.preventDefault();
                      selectReservoir(index.reservoirs[next].key);
                      (
                        event.currentTarget.parentElement?.children[
                          next
                        ] as HTMLButtonElement
                      )?.focus();
                    }
                  }}
                >
                  <span>
                    <strong>
                      {lang === "en" ? r.name : r.name_zh.replace("水庫", "")}
                    </strong>
                    <small>
                      {summary?.meta.validation.grade === "A"
                        ? t("Tracks water level", "跟得上水位")
                        : summary?.meta.validation.grade === "B"
                          ? t("Below sensitivity", "變化小於敏感度")
                          : summary?.meta.validation.grade === "C"
                            ? t("Change unresolved", "分辨不出變化")
                            : "…"}
                    </small>
                  </span>
                  <Sparkline summary={summary} />
                </button>
              );
            })}
          </div>
          <div className="sidebar-heading passes-heading">
            <span>
              {t("Acquisitions", "通過紀錄")}{" "}
              <b>
                {index.dates.length}
                <span> / {schedule.slots.length}</span>
              </b>
            </span>
            <span>{t("Storage", "蓄水率")}　km²</span>
          </div>
          <div
            className="pass-list"
            role="list"
            aria-label={t("All scheduled acquisitions", "全部預期通過時段")}
          >
            {schedule.slots.map((slot) => {
              const i = slot.acquisitionIndex;
              const row =
                i === null ? undefined : observationAt(records, slot.utcDate);
              return (
                <div role="listitem" key={slot.utcDate}>
                  {i === null ? (
                    <div
                      className="pass-row missing-pass"
                      title={t("No radar product", "沒有雷達產品")}
                    >
                      <time>
                        {new Date(Date.parse(slot.localTimestamp) + 8 * 3600000)
                          .toISOString()
                          .slice(0, 10)}
                      </time>
                      <span>{t("No product", "沒有產品")}</span>
                      <span>—</span>
                    </div>
                  ) : (
                    <button
                      className={`pass-row${i === dateIndex ? " is-selected" : ""}`}
                      aria-pressed={i === dateIndex}
                      tabIndex={i === dateIndex ? 0 : -1}
                      onClick={() => selectDate(i)}
                      onKeyDown={(event) => {
                        const next =
                          event.key === "ArrowDown"
                            ? Math.min(index.dates.length - 1, i + 1)
                            : event.key === "ArrowUp"
                              ? Math.max(0, i - 1)
                              : event.key === "Home"
                                ? 0
                                : event.key === "End"
                                  ? index.dates.length - 1
                                  : null;
                        if (next !== null) {
                          event.preventDefault();
                          selectDate(next);
                          const list =
                            event.currentTarget.closest(".pass-list");
                          window.requestAnimationFrame(() =>
                            list
                              ?.querySelector<HTMLButtonElement>(".is-selected")
                              ?.focus({ preventScroll: true }),
                          );
                        }
                      }}
                    >
                      <time>
                        {index.dates[i].local.slice(0, 10)}
                        {(row?.qa_by_channel?.[polarization] ?? row?.qa)?.length
                          ? "†"
                          : ""}
                      </time>
                      <span>
                        {row?.official.pct == null
                          ? "—"
                          : `${row.official.pct.toFixed(1)}%`}
                      </span>
                      <span>
                        {publishArea && row
                          ? row.area_km2.primary.toFixed(2)
                          : "—"}
                      </span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <div className="sidebar-footer">
            <span className="status-dot" />
            NISAR L-band <span>Track 111 / Frame 014</span>
          </div>
        </aside>
        <main className="workspace-main" id="image-workspace">
          <div className="mobile-reservoir">
            <label htmlFor="reservoir-select">{t("Reservoir", "水庫")}</label>
            <select
              id="reservoir-select"
              value={reservoirKey}
              onChange={(event) => selectReservoir(event.target.value)}
            >
              {index.reservoirs.map((r) => (
                <option key={r.key} value={r.key}>
                  {lang === "en" ? r.name : r.name_zh}
                </option>
              ))}
            </select>
            <button onClick={() => openInspector("day")}>
              {t("Details", "數據")}
            </button>
          </div>
          <div className="workspace-toolbar">
            <div
              className="segmented section-switch"
              aria-label={t("Workspace view", "工作區內容")}
            >
              <button
                aria-pressed={section === "image"}
                onClick={() => setSection("image")}
              >
                {t("Image", "影像")}
              </button>
              <button
                aria-pressed={section === "charts"}
                onClick={() => setSection("charts")}
              >
                {t("Charts", "圖表")}
              </button>
            </div>
            {section === "image" && (
              <>
                <div
                  className="segmented"
                  aria-label={t("Image view", "影像模式")}
                >
                  <button
                    aria-pressed={view === "single"}
                    onClick={() => {
                      pauseInteraction();
                      setView("single");
                    }}
                  >
                    {t("Single", "單張")}
                  </button>
                  <button
                    aria-pressed={view !== "single"}
                    onClick={() => {
                      pauseInteraction();
                      setView("swipe");
                    }}
                  >
                    {t("Compare", "對照")}
                  </button>
                </div>
                <div
                  className="segmented"
                  aria-label={t("Polarization", "極化")}
                >
                  {(["HH", "HV"] as Polarization[]).map((pol) => (
                    <button
                      key={pol}
                      aria-pressed={polarization === pol}
                      onClick={() => {
                        pauseInteraction();
                        setState((s) => ({ ...s, polarization: pol }));
                      }}
                    >
                      {pol}
                    </button>
                  ))}
                </div>
                <button
                  className="overlay-toggle"
                  aria-pressed={showWater}
                  onClick={() => {
                    pauseInteraction();
                    setShowWater((v) => !v);
                  }}
                >
                  <span className="toggle-track">
                    <i />
                  </span>
                  {t("Water", "疊色")}
                </button>
                <button
                  className="edge-toggle"
                  aria-pressed={showEdge}
                  onClick={() => {
                    pauseInteraction();
                    setShowEdge((v) => !v);
                  }}
                >
                  {t("Edge", "邊界")}
                </button>
                <button
                  className="reset-view"
                  onClick={() => {
                    pauseInteraction();
                    setShowWater(true);
                    setShowEdge(true);
                    setView("swipe");
                    setState((s) => ({
                      ...s,
                      polarization: "HH",
                      compareDateIndex: 0,
                    }));
                  }}
                >
                  {t("Reset", "重設")}
                </button>
                <span className="toolbar-scale">
                  {polarization === "HH" ? "−18" : "−21"}
                  <i />
                  {polarization === "HH" ? "−2" : "−6"}
                  <span>γ⁰ dB</span>
                </span>
              </>
            )}
            <button
              className="inspector-toggle"
              onClick={() => openInspector("day")}
              aria-label={t("Open data panel", "開啟資料面板")}
            >
              ☷
            </button>
          </div>
          <div className="workspace-content">
            {section === "image" ? (
              <div
                className="image-workspace"
                ref={imageRef}
                tabIndex={0}
                onKeyDown={shortcuts}
                aria-label={t(
                  "Radar image. Arrow keys change dates, C compares, H changes polarization.",
                  "雷達影像。方向鍵換日期，C 切換對照，H 切換極化。",
                )}
              >
                <div className="image-context">
                  <div>
                    <span className="context-label">
                      {t("OBSERVATION", "觀測影像")}
                    </span>
                    <h1>{name}</h1>
                    <p>
                      {t(
                        "The dark shape is calm water, which reflects radar energy away.",
                        "暗色的形狀是平靜水面，它把雷達波反射到別處。",
                      )}
                    </p>
                  </div>
                  <div className="image-context-date">
                    <time>
                      {formatAcquisitionDate(acquisition, false, lang)}
                    </time>
                    <span>
                      {formatAcquisitionTime(acquisition, lang)}{" "}
                      {t("Taiwan", "台灣時間")}
                    </span>
                  </div>
                </div>
                {archive ? (
                  <div
                    className="image-stage"
                    style={
                      {
                        "--radar-aspect":
                          archive.meta.grid.width / archive.meta.grid.height,
                      } as CSSProperties
                    }
                    onPointerDown={pauseInteraction}
                  >
                    <Comparison
                      archive={archive}
                      date={acquisition.utc_date}
                      compareDate={reference.utc_date}
                      polarization={polarization}
                      lang={lang}
                      mode={view}
                      showWater={showWater && publishArea}
                      showReferenceEdge={showEdge}
                      referenceLabel={referenceLabel}
                      selectedLabel={selectedLabel}
                      onInteract={pauseInteraction}
                      frameErrors={numerical.frameErrors}
                      onRetry={numerical.retryFrame}
                    />
                  </div>
                ) : (
                  <div
                    className="image-placeholder"
                    role={numerical.error ? "alert" : "status"}
                  >
                    <span className="placeholder-grid" aria-hidden="true" />
                    <p>
                      {numerical.error
                        ? t("Imagery could not load.", "影像資料載入失敗。")
                        : t(
                            "Preparing the reservoir grid…",
                            "正在準備水庫格網…",
                          )}
                    </p>
                    {numerical.error && (
                      <button onClick={numerical.retry}>
                        {t("Try again", "再試一次")}
                      </button>
                    )}
                  </div>
                )}
                <div className="image-footer">
                  <span>
                    <i className="water-key" />
                    {showWater && publishArea
                      ? t("HH-classified water", "HH 分類水面")
                      : t("Calibrated backscatter", "校準後雷達回波")}
                  </span>
                  {view !== "single" && (
                    <label className="compare-layout">
                      {t("Compare", "對照")}
                      <select
                        aria-label={t(
                          "Desktop comparison layout",
                          "桌機對照方式",
                        )}
                        value={view}
                        onChange={(event) => {
                          pauseInteraction();
                          setView(event.target.value as View);
                        }}
                      >
                        <option value="swipe">{t("Swipe", "滑桿")}</option>
                        <option value="side-by-side">
                          {t("Side by side", "並排")}
                        </option>
                      </select>
                    </label>
                  )}
                  <label className="reference-select">
                    {t("Reference", "對照日")}
                    <select
                      value={compareDateIndex}
                      onChange={(event) => {
                        pauseInteraction();
                        setState((s) => ({
                          ...s,
                          compareDateIndex: Number(event.target.value),
                        }));
                      }}
                    >
                      {index.dates.map((d, i) => (
                        <option key={d.utc_date} value={i}>
                          {formatAcquisitionDate(d, true, lang)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            ) : (
              <section className="charts-workspace">
                <div className="charts-heading">
                  <div>
                    <span className="context-label">
                      {t("OBSERVATION SERIES", "觀測序列")}
                    </span>
                    <h1>
                      {t(
                        "Radar area & official storage",
                        "雷達面積與官方蓄水率",
                      )}
                    </h1>
                    <p>{gradeDescription(grade, lang)}</p>
                  </div>
                  {archive && (
                    <button
                      className="chart-thumbnail"
                      onClick={() => {
                        setSection("image");
                        imageRef.current?.focus();
                      }}
                      aria-label={t(
                        "Return to selected radar image",
                        "回到選取日雷達影像",
                      )}
                    >
                      <RadarCanvas
                        archive={archive}
                        date={acquisition.utc_date}
                        polarization="HH"
                        label={selectedLabel}
                      />
                      <span>
                        {formatAcquisitionDate(acquisition, true, lang)}
                      </span>
                    </button>
                  )}
                </div>
                {gaugeError ? (
                  <div role="alert">
                    <p>
                      {t(
                        "Official records could not load.",
                        "官方紀錄載入失敗。",
                      )}
                    </p>
                    <button onClick={() => setGaugeRetry((n) => n + 1)}>
                      {t("Retry", "重試")}
                    </button>
                  </div>
                ) : (
                  official && (
                    <AnalysisCharts
                      key={reservoirKey}
                      archive={archive}
                      records={official.records}
                      dates={index.dates}
                      selected={acquisition}
                      onSelect={selectDate}
                      gap={index.gap}
                      lang={lang}
                      showArea={publishArea}
                    />
                  )
                )}
                {official && (
                  <WeatherContext
                    key={reservoirKey}
                    reservoirKey={reservoirKey}
                    dates={index.dates}
                    selected={acquisition}
                    records={official.records}
                    lang={lang}
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
                <EventNotes reservoirKey={reservoirKey} lang={lang} />
              </section>
            )}
          </div>
          {demo && (
            <section
              className="tour-caption"
              aria-label={t("Guided tour", "導覽")}
            >
              <div className="tour-caption-heading">
                <strong>{chapter + 1} / 5</strong>
                <div>
                  <button
                    onClick={() => {
                      setTourPlaying(false);
                      goChapter(Math.max(0, chapter - 1));
                    }}
                    disabled={chapter === 0}
                    aria-label={t("Previous chapter", "上一幕")}
                  >
                    ‹
                  </button>
                  <button
                    onClick={() => {
                      if (tourPlaying) setTourPlaying(false);
                      else {
                        goChapter(chapter);
                        setTourPlaying(true);
                      }
                    }}
                  >
                    {tourPlaying ? t("Pause", "暫停") : t("Continue", "繼續")}
                  </button>
                  <button
                    onClick={() => {
                      setTourPlaying(false);
                      goChapter(Math.min(4, chapter + 1));
                    }}
                    disabled={chapter === 4}
                    aria-label={t("Next chapter", "下一幕")}
                  >
                    ›
                  </button>
                  <button onClick={toggleTour}>{t("End", "結束")}</button>
                </div>
              </div>
              <p aria-live="polite">
                {reservoirKey === "baoshan2" &&
                dateIndex === chapterDates[chapter]
                  ? tourTexts[chapter]
                  : t(
                      "Tour paused. Continue to return to this chapter’s reservoir and date.",
                      "導覽已暫停。繼續時會回到這一幕的水庫與日期。",
                    )}
              </p>
            </section>
          )}
          <div className="workspace-timebar">
            <div className="shortcut-hints">
              <span>
                <kbd>←</kbd>
                <kbd>→</kbd> {t("date", "換日期")}
              </span>
              <span>
                <kbd>{t("Space", "空白鍵")}</kbd> {t("play", "播放")}
              </span>
              <span>
                <kbd>C</kbd> {t("compare", "對照")}
              </span>
              <span>
                <kbd>H</kbd> HH/HV
              </span>
            </div>
            <AcquisitionTimeline
              dates={index.dates}
              selectedIndex={dateIndex}
              lang={lang}
              onSelect={selectDate}
              playing={playing}
              onTogglePlay={() => {
                setTourPlaying(false);
                setPlaying((v) => !v);
              }}
            />
          </div>
        </main>
        <aside
          className={`inspector-shell${inspectorOpen ? " is-open" : ""}`}
          aria-label={t("Observation details", "觀測詳細資訊")}
        >
          <button
            className="inspector-close"
            onClick={() => setInspectorOpen(false)}
          >
            {t("Close details", "關閉資料面板")} ×
          </button>
          {summaryError && (
            <div className="inline-error" role="alert">
              {t(
                "Some reservoir summaries are unavailable.",
                "水庫摘要暫時無法載入。",
              )}
              <button onClick={() => setSummaryRetry((n) => n + 1)}>
                {t("Retry", "重試")}
              </button>
            </div>
          )}
          <WorkspaceInspector
            polarization={polarization}
            reservoirKey={reservoirKey}
            index={index}
            archive={archive}
            official={official}
            acquisition={acquisition}
            referenceDate={reference.utc_date}
            lang={lang}
            summaries={observedSummary}
            tab={inspectorTab}
            onTabChange={setInspectorTab}
          />
        </aside>
        {inspectorOpen && (
          <button
            className="inspector-backdrop"
            aria-label={t("Close data panel", "關閉資料面板")}
            onClick={() => setInspectorOpen(false)}
          />
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {name}，{formatAcquisitionDate(acquisition, false, lang)}，
        {t("storage", "蓄水率")} {pct == null ? "—" : pct.toFixed(1)}%。
        {publishArea && observation
          ? `${t("Water surface", "水面")} ${observation.area_km2.primary.toFixed(2)} km²`
          : gradeDescription(grade, lang)}
      </p>
    </div>
  );
}

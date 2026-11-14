import { useEffect, useRef, useState } from "react";
import GaugeChart from "./components/GaugeChart";
import Locator from "./components/Locator";
import NumericScene from "./components/NumericScene";
import { estimateArea, useNumericalArchive } from "./numerical";
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

const chapters = [
  {
    number: "01",
    title: "Full to the brim",
    date: "2025-11-05",
    reservoir: "baoshan2",
    text: "The story begins with full reservoirs. On 6 November, Baoshan II stood at 100.0% storage.",
  },
  {
    number: "02",
    title: "A dry winter",
    date: "2026-03-17",
    reservoir: "baoshan2",
    text: "By 18 March, Baoshan II was at 28.2%. Follow the official gauges as the winter unfolds.",
  },
  {
    number: "03",
    title: "The blind spot",
    date: "2026-03-17",
    reservoir: "liyutan",
    text: "No NISAR products are available for this frame from 18 March to 20 June (UTC product dates). Gauge samples continue; radar observations do not.",
  },
  {
    number: "04",
    title: "Water returns",
    date: "2026-06-21",
    reservoir: "baoshan2",
    text: "On 22 June, Baoshan II was back at 100.0%. Radar observations resume after the gap.",
  },
  {
    number: "05",
    title: "A different rhythm",
    date: "2026-08-20",
    reservoir: "feitsui",
    text: "Feitsui follows a different pattern: 91.9% on 18 March, then 74.1% on 21 August. Why it differs remains a hypothesis to investigate.",
  },
];
function PulseIcon() {
  return (
    <svg viewBox="0 0 34 34" fill="none" aria-hidden="true">
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
function Arrow({ left = false }: { left?: boolean }) {
  return <span aria-hidden="true">{left ? "←" : "→"}</span>;
}

export default function App() {
  const [index, setIndex] = useState<DataIndex | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    void loadJson("index.json", parseIndex, controller.signal)
      .then(setIndex)
      .catch((e: unknown) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Data could not be loaded.",
          );
      });
    return () => controller.abort();
  }, [retry]);
  if (error)
    return (
      <main className="boot">
        <PulseIcon />
        <h1>The archive could not be loaded</h1>
        <p role="alert">{error}</p>
        <button onClick={() => setRetry((n) => n + 1)}>Retry loading</button>
      </main>
    );
  if (!index)
    return (
      <main className="boot" aria-live="polite">
        <PulseIcon />
        <h1>Taiwan’s Water Pulse</h1>
        <p>Opening the reservoir archive…</p>
        <div className="loading-bar" />
      </main>
    );
  return <Explorer index={index} />;
}
function Explorer({ index }: { index: DataIndex }) {
  const initial = useRef(new URLSearchParams(window.location.search));
  const [reservoirKey, setReservoirKey] = useState(() =>
    index.reservoirs.some((r) => r.key === initial.current.get("reservoir"))
      ? initial.current.get("reservoir")!
      : (index.numeric_reservoirs?.[0] ?? "baoshan2"),
  );
  const [dateIndex, setDateIndex] = useState(() =>
    nearestAcquisition(
      index.dates,
      initial.current.get("date") || "2026-03-17",
    ),
  );
  const [polarization, setPolarization] = useState<Polarization>(
    initial.current.get("pol") === "HV" ? "HV" : "HH",
  );
  const [series, setSeries] = useState<OfficialSeries | null>(null),
    [gaugeError, setGaugeError] = useState(""),
    [gaugeRetry, setGaugeRetry] = useState(0);
  const [playing, setPlaying] = useState(false),
    [tab, setTab] = useState<"explore" | "story" | "methods">("explore"),
    [chapter, setChapter] = useState(1),
    [imageState, setImageState] = useState<"loading" | "ready" | "error">(
      "loading",
    ),
    [imageRetry, setImageRetry] = useState(0),
    [zoom, setZoom] = useState(1),
    [details, setDetails] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const methodsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (tab === "methods")
      methodsRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
  }, [tab]);
  const reservoir =
    index.reservoirs.find((r) => r.key === reservoirKey) || index.reservoirs[0];
  const acquisition = index.dates[dateIndex];
  const current = series?.records.find(
    (r) => r.nisar_utc_date === acquisition.utc_date,
  );
  const first = series?.records[0];
  const change =
    current?.pct != null && first?.pct != null ? current.pct - first.pct : null;
  const available = acquisition.available[polarization];
  const imagePath = acquisition.browse[polarization];
  const numericMode =
    index.mode === "numeric" ||
    (index.mode === "mixed" &&
      index.numeric_reservoirs?.includes(reservoir.key) === true);
  const numerical = useNumericalArchive(
    numericMode,
    reservoir.key,
    index.dates,
  );
  const archive = numerical.archive;
  const classificationChannel = archive?.meta.classification_channel ?? "HH";
  const [thresholdOverride, setThresholdOverride] = useState<{
    key: string;
    value: number;
  } | null>(null);
  const threshold =
    thresholdOverride?.key === reservoir.key
      ? thresholdOverride.value
      : (archive?.meta.thresholds[classificationChannel] ?? -18);
  const estimate = archive
    ? estimateArea(
        archive.frames[acquisition.utc_date][classificationChannel],
        archive.mask,
        threshold,
        archive.meta.pixel_area_m2,
      )
    : null;
  const qaByDate = new Map(
    archive?.series.records.map((record) => [
      record.utc.slice(0, 10),
      record.qa,
    ]) ?? [],
  );
  const areaObservation = archive?.series.records.find(
    (record) => record.utc.slice(0, 10) === acquisition.utc_date,
  );
  useEffect(() => {
    const controller = new AbortController();
    setSeries(null);
    setGaugeError("");
    void loadJson(
      `official/${reservoir.key}.json`,
      parseOfficial,
      controller.signal,
    )
      .then(setSeries)
      .catch((e: unknown) => {
        if (!controller.signal.aborted)
          setGaugeError(
            e instanceof Error ? e.message : "Gauge data could not be loaded",
          );
      });
    return () => controller.abort();
  }, [reservoir.key, gaugeRetry]);
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("reservoir", reservoir.key);
    url.searchParams.set("date", acquisition.utc_date);
    url.searchParams.set("pol", polarization);
    window.history.replaceState(null, "", url);
  }, [reservoir.key, acquisition.utc_date, polarization]);
  useEffect(() => {
    setImageState("loading");
    setZoom(1);
  }, [imagePath, imageRetry]);
  // Cached images may complete before the effect above runs.
  useEffect(() => {
    if (imageRef.current?.complete && imageRef.current.naturalWidth > 0)
      setImageState("ready");
  }, [imagePath, imageRetry]);
  useEffect(() => {
    if (!playing || (numericMode ? !archive : imageState !== "ready")) return;
    const id = window.setInterval(
      () => setDateIndex((i) => (i + 1) % index.dates.length),
      1500,
    );
    return () => window.clearInterval(id);
  }, [playing, imageState, index.dates.length, numericMode, archive]);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(target.tagName) ||
        target.isContentEditable
      )
        return;
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        setPlaying(false);
        setDateIndex((i) =>
          Math.max(
            0,
            Math.min(
              index.dates.length - 1,
              i + (event.key === "ArrowRight" ? 1 : -1),
            ),
          ),
        );
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [index.dates.length]);
  useEffect(() => {
    if (!playing || numericMode) return;
    const images = index.dates
      .filter((d) => d.available[polarization])
      .map((d) => {
        const img = new Image();
        img.src = dataUrl(d.browse[polarization]);
        return img;
      });
    return () => {
      images.forEach((img) => {
        img.onload = null;
      });
    };
  }, [playing, index.dates, polarization, numericMode]);
  const selectDate = (i: number, leaveTour = true) => {
    setDateIndex(i);
    setPlaying(false);
    if (leaveTour && tab === "story") setTab("explore");
  };
  const navigateChapter = (i: number) => {
    const next = chapters[i];
    setChapter(i);
    setReservoirKey(next.reservoir);
    selectDate(nearestAcquisition(index.dates, next.date), false);
  };
  return (
    <>
      <a className="skip-link" href="#explorer">
        Skip to explorer
      </a>
      <header className="site-header">
        <a className="brand" href={import.meta.env.BASE_URL}>
          <span className="brand-icon">
            <PulseIcon />
          </span>
          <span>
            Taiwan’s Water Pulse<small>A RESERVOIR STORY, SEEN BY RADAR</small>
          </span>
        </a>
        <nav aria-label="Main navigation">
          {(["explore", "story", "methods"] as const).map((item) => (
            <button
              key={item}
              className={tab === item ? "nav-active" : ""}
              onClick={() => {
                if (item === "story") navigateChapter(chapter);
                setTab(item);
              }}
              aria-current={tab === item ? "page" : undefined}
            >
              {item === "explore"
                ? "The explorer"
                : item === "story"
                  ? "The story"
                  : "Data & methods"}
            </button>
          ))}
        </nav>
        <a
          className="github-link"
          href="https://github.com/Mephisto-000/taiwan-water-pulse"
          target="_blank"
          rel="noreferrer"
        >
          View source <span aria-hidden="true">↗</span>
        </a>
      </header>
      <main id="explorer">
        <section className="intro">
          <div>
            <div className="eyebrow">
              <span /> NISAR FIRST-YEAR ARCHIVE{" "}
              <span className="eyebrow-divider">/</span> TAIWAN
            </div>
            <h1>Every reservoir has a rhythm.</h1>
            <p>
              Follow a year of falling water and returning rain, through the
              eyes of L-band radar.
            </p>
          </div>
          <div className="archive-tag">
            <span>HISTORICAL OBSERVATIONS</span>
            <strong>
              Nov 2025 <span>—</span> Oct 2026
            </strong>
            <small>
              {index.dates.length} passes · {index.reservoirs.length} reservoirs
              · one changing landscape
            </small>
          </div>
        </section>
        <div className="mode-notice">
          <span className="notice-label">
            {numericMode ? "CALIBRATED GCOV" : "BROWSE EDITION"}
          </span>
          <p>
            {numericMode
              ? "Explore calibrated radar backscatter, adjust the water threshold, and compare estimated surface area with official gauge samples."
              : "Real radar previews and official gauges. Calibrated access succeeded; water-area estimates are withheld because independent validation did not meet the publication criterion."}
          </p>
          <button
            onClick={() => {
              setTab("methods");
              setDetails(true);
            }}
          >
            What this means <span aria-hidden="true">↗</span>
          </button>
        </div>
        {tab === "story" && (
          <section className="story-panel" aria-label="Five chapter tour">
            <div className="story-chapters">
              {chapters.map((c, i) => (
                <button
                  key={c.number}
                  className={chapter === i ? "chapter-active" : ""}
                  onClick={() => navigateChapter(i)}
                >
                  <span>{c.number}</span>
                  {c.title}
                </button>
              ))}
            </div>
            <p aria-live="polite">{chapters[chapter].text}</p>
            <button className="text-button" onClick={() => setTab("explore")}>
              Leave the guided story <span aria-hidden="true">↗</span>
            </button>
          </section>
        )}
        <div className="workspace">
          <aside className="sidebar">
            <div className="section-label">
              01 <span>CHOOSE A RESERVOIR</span>
            </div>
            <div className="reservoir-list">
              {index.reservoirs.map((r, i) => (
                <button
                  key={r.key}
                  onClick={() => {
                    setReservoirKey(r.key);
                    if (tab === "story") setTab("explore");
                  }}
                  className={`reservoir-choice ${reservoir.key === r.key ? "selected" : ""}`}
                  aria-pressed={reservoir.key === r.key}
                >
                  <span className="reservoir-number">0{i + 1}</span>
                  <span className="reservoir-name">
                    {r.name}
                    <small>
                      {r.name_zh} {r.key === "feitsui" ? "· comparison" : ""}
                    </small>
                  </span>
                  <span className="choice-arrow" aria-hidden="true">
                    ↗
                  </span>
                </button>
              ))}
            </div>
            <div className="reservoir-context">
              <div className="context-title">
                <span className="tiny-dot" /> NORTHERN & CENTRAL TAIWAN
              </div>
              <Locator reservoir={reservoir} />
              <div className="coordinate-row">
                <span>
                  {((reservoir.bbox[0] + reservoir.bbox[1]) / 2).toFixed(3)}° N
                </span>
                <span>
                  {((reservoir.bbox[2] + reservoir.bbox[3]) / 2).toFixed(3)}° E
                </span>
              </div>
            </div>
            <div className="radar-explainer">
              <span className="eyebrow">A DIFFERENT KIND OF LIGHT</span>
              <svg
                className="radar-diagram"
                viewBox="0 0 230 65"
                role="img"
                aria-label="Calm water reflects radar away; rough land scatters radar back"
              >
                <path
                  d="M24 8l43 42 43-42M144 8l33 40-6-27m6 27 17-37"
                  fill="none"
                  stroke="#6f9a9d"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                />
                <path
                  d="M25 53h88m24 0 9-7 9 7 10-10 10 10 10-5 10 5h15"
                  fill="none"
                  stroke="#204e52"
                  strokeWidth="2"
                />
                <text x="68" y="64" textAnchor="middle">
                  WATER
                </text>
                <text x="174" y="64" textAnchor="middle">
                  LAND
                </text>
              </svg>
              <p>
                Calm water reflects the radar pulse away, so it looks dark. Land
                and vegetation scatter some of it back, so they look brighter.
              </p>
            </div>
          </aside>
          <div className="main-column">
            <section className="radar-card" aria-label="NISAR radar scene">
              <div className="card-heading">
                <div>
                  <span className="section-label">
                    02 <span>READ THE RADAR</span>
                  </span>
                  <h2>
                    {reservoir.name}
                    <span className="chinese-name">{reservoir.name_zh}</span>
                  </h2>
                </div>
                <div
                  className="channel-control"
                  role="group"
                  aria-label="Measured radar channel"
                >
                  {(["HH", "HV"] as const).map((pol) => (
                    <button
                      key={pol}
                      className={polarization === pol ? "active" : ""}
                      aria-pressed={polarization === pol}
                      onClick={() => setPolarization(pol)}
                    >
                      {pol}
                    </button>
                  ))}
                </div>
              </div>
              <div className="scene-meta">
                <span>
                  <span className="tiny-dot" />{" "}
                  {formatDate(acquisition.local.slice(0, 10))}{" "}
                  <span className="muted">· Taiwan</span>
                </span>
                <span>
                  TRACK 111 ↑ <span className="muted">/</span> FRAME 014
                </span>
              </div>
              <div className="scene-view">
                <div className="scene-image-viewport">
                  {numericMode && archive && (
                    <NumericScene
                      archive={archive}
                      date={acquisition.utc_date}
                      polarization={polarization}
                      threshold={threshold}
                      zoom={zoom}
                    />
                  )}
                  {!numericMode && available && (
                    <img
                      ref={imageRef}
                      key={`${imagePath}-${imageRetry}`}
                      className={`radar-image ${imageState === "ready" ? "loaded" : ""}`}
                      src={dataUrl(imagePath)}
                      alt={`Full-frame NISAR ${polarization} radar browse image acquired ${acquisition.utc}. This is a browse preview, not a georeferenced reservoir overlay.`}
                      style={{ transform: `scale(${zoom})` }}
                      onLoad={() => setImageState("ready")}
                      onError={() => {
                        setImageState("error");
                        setPlaying(false);
                      }}
                    />
                  )}
                </div>
                <div className="scene-label">
                  <span className="scene-dot" /> L-BAND / {polarization}{" "}
                  <small>
                    {numericMode
                      ? "CALIBRATED RESERVOIR GRID · EPSG:3857"
                      : "FULL-FRAME BROWSE PREVIEW"}
                  </small>
                </div>
                <span className="north-label">
                  {numericMode ? "N ↑" : "NATIVE"}
                  <small>
                    {numericMode
                      ? "North-up · fixed grid"
                      : "Product grid orientation"}
                  </small>
                </span>
                {(numericMode
                  ? !archive && !numerical.error
                  : imageState === "loading" && available) && (
                  <div className="scene-status" role="status">
                    <div className="loading-bar" />
                    Loading radar observation…
                  </div>
                )}
                {(numericMode
                  ? !!numerical.error
                  : !available || imageState === "error") && (
                  <div className="scene-status" role="alert">
                    <strong>
                      {numericMode
                        ? "Numerical data unavailable"
                        : "Preview unavailable"}
                    </strong>
                    <span>
                      {numericMode
                        ? numerical.error
                        : "This observation cannot be displayed. Other dates and gauges remain available."}
                    </span>
                    {available && (
                      <button
                        onClick={() =>
                          numericMode
                            ? numerical.retry()
                            : setImageRetry((i) => i + 1)
                        }
                      >
                        Retry image
                      </button>
                    )}
                  </div>
                )}
                <div className="scene-bottom">
                  <span>
                    {numericMode
                      ? `γ⁰ · −35 to +5 dB · blue = ${classificationChannel} water candidates`
                      : "γ⁰ browse · display values only"}
                  </span>
                  <div className="zoom-controls">
                    <button
                      aria-label="Zoom out preview"
                      disabled={zoom <= 1}
                      onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
                    >
                      −
                    </button>
                    <button
                      aria-label="Reset preview zoom"
                      onClick={() => setZoom(1)}
                    >
                      {zoom.toFixed(1)}×
                    </button>
                    <button
                      aria-label="Zoom in preview"
                      disabled={zoom >= 3}
                      onClick={() => setZoom((z) => Math.min(3, z + 0.5))}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
              <div className="scene-caption">
                <span>
                  Dark ≈ low return <span className="gray-scale" /> Bright ≈
                  high return
                </span>
                <span>
                  {numericMode
                    ? `Blue mask uses ${classificationChannel}, independent of displayed channel`
                    : "No dB values or area derived from previews"}
                </span>
              </div>
              <div className="channel-note">
                <span aria-hidden="true">ⓘ</span>{" "}
                {polarization === "HH"
                  ? "HH: horizontal transmit, horizontal receive."
                  : "HV: horizontal transmit, vertical receive."}{" "}
                Switching channels selects existing measurements, not a new
                observation.
              </div>
            </section>
            <section
              className="timeline-card"
              aria-label="Acquisition timeline"
            >
              <div className="timeline-heading">
                <span className="section-label">
                  03 <span>MOVE THROUGH TIME</span>
                </span>
                <span className="observation-count">
                  OBSERVATION {String(dateIndex + 1).padStart(2, "0")}{" "}
                  <span>/ {index.dates.length}</span>
                </span>
              </div>
              <div className="timeline-controls">
                <button
                  className={`play-button ${playing ? "playing" : ""}`}
                  aria-label={
                    playing ? "Pause observations" : "Play observations"
                  }
                  onClick={() => setPlaying((p) => !p)}
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
                  >
                    <span>No products available</span>
                  </div>
                  {index.dates.map((d, i) => (
                    <button
                      key={d.utc_date}
                      aria-label={`Select ${formatDate(d.local.slice(0, 10))}`}
                      aria-pressed={i === dateIndex}
                      title={
                        qaByDate.get(d.utc_date)?.join(" · ") ||
                        formatDate(d.local)
                      }
                      className={`timeline-tick ${i === dateIndex ? "tick-active" : ""}`}
                      style={{
                        left: `${datePosition(d.utc_date, index.dates[0].utc_date, index.dates.at(-1)!.utc_date)}%`,
                      }}
                      onClick={() => selectDate(i)}
                    >
                      <span />
                      {!!qaByDate.get(d.utc_date)?.length && (
                        <span className="tick-qa" aria-hidden="true">
                          †
                        </span>
                      )}
                      <span className="tick-tooltip">
                        {formatDate(d.local.slice(0, 10), true)}
                      </span>
                    </button>
                  ))}
                  <div className="timeline-months">
                    <span>Nov ’25</span>
                    <span>Jan ’26</span>
                    <span>Mar</span>
                    <span>May</span>
                    <span>Jul</span>
                    <span>Sep</span>
                    <span>Oct</span>
                  </div>
                </div>
                <div className="step-buttons">
                  <button
                    aria-label="Previous observation"
                    disabled={dateIndex === 0}
                    onClick={() => selectDate(dateIndex - 1)}
                  >
                    <Arrow left />
                  </button>
                  <button
                    aria-label="Next observation"
                    disabled={dateIndex === index.dates.length - 1}
                    onClick={() => selectDate(dateIndex + 1)}
                  >
                    <Arrow />
                  </button>
                </div>
              </div>
              <div className="timeline-foot">
                <span>Dates are spaced by elapsed time. Use ← → to step.</span>
                <span>UTC product gap: 18 Mar — 20 Jun 2026</span>
              </div>
            </section>
          </div>
          <aside className="gauge-sidebar">
            <div className="section-label">
              04 <span>CHECK THE GAUGES</span>
            </div>
            <div className="gauge-date">
              {formatDate(acquisition.local.slice(0, 10), true)}{" "}
              <span>· 07:00 TAIWAN</span>
            </div>
            <div className="metric-label">Official storage</div>
            <div className="storage-metric">
              {current?.pct != null ? current.pct.toFixed(1) : "—"}
              <span>%</span>
            </div>
            <div className="storage-bar">
              <div style={{ width: `${current?.pct ?? 0}%` }} />
            </div>
            <div className="change-label">
              {change === null
                ? "No official observation"
                : `${change > 0 ? "+" : ""}${change.toFixed(1)} percentage points`}
              <span>
                since{" "}
                {first
                  ? formatDate(first.local_date, true)
                  : "first observation"}
              </span>
            </div>
            <div className="level-metric">
              <span>Water level</span>
              <strong>
                {current?.level_m != null ? current.level_m.toFixed(2) : "—"}{" "}
                <small>m</small>
              </strong>
            </div>
            <div className="source-chip">WRA · OFFICIAL GAUGE</div>
            <div className="area-unavailable">
              <span className="metric-label">Radar water area</span>
              {numericMode ? (
                <div className="numeric-area">
                  {estimate?.area.toFixed(3) ?? "—"} <small>km²</small>
                </div>
              ) : (
                <strong>Not measured</strong>
              )}
              <p>
                {numericMode
                  ? `Dark valid ${classificationChannel} pixels inside the fixed reservoir mask. Surface area is an estimate, not storage volume.`
                  : "Browse images support visual comparison. Reliable area estimates require calibrated GCOV pixels and a validated classifier."}
              </p>
              {numericMode && estimate && (
                <div className="numeric-sensitivity">
                  Sensitivity: {estimate.low.toFixed(3)}–
                  {estimate.high.toFixed(3)} km²
                  <br />
                  {classificationChannel} threshold ±1.5 dB
                </div>
              )}
              <label className={numericMode ? "threshold-control" : undefined}>
                {numericMode
                  ? `${classificationChannel} water threshold`
                  : "Water threshold"}{" "}
                <span>
                  {numericMode ? `${threshold.toFixed(1)} dB` : "unavailable"}
                </span>
                <input
                  type="range"
                  min="-30"
                  max="-8"
                  step="0.5"
                  value={threshold}
                  disabled={!numericMode || !archive}
                  aria-label={
                    numericMode
                      ? `${classificationChannel} water threshold in decibels`
                      : "Water threshold unavailable in browse edition"
                  }
                  onChange={(event) =>
                    setThresholdOverride({
                      key: reservoir.key,
                      value: Number(event.target.value),
                    })
                  }
                />
              </label>
              {numericMode && (
                <button
                  className="threshold-reset"
                  onClick={() => setThresholdOverride(null)}
                >
                  Reset to pooled Otsu default
                </button>
              )}
              {!!areaObservation?.qa.length && (
                <div className="qa-notice">
                  QA: {areaObservation.qa.join(" · ")}
                </div>
              )}
              <small>
                {numericMode
                  ? `Chart points and correlations use the fixed default ${classificationChannel} threshold. The slider updates this observation and its blue overlay.`
                  : "Thresholds, sensitivity intervals and correlations are disabled in this edition."}
              </small>
            </div>
            <button
              className="provenance-button"
              onClick={() => {
                setDetails((p) => !p);
                setTab("methods");
              }}
            >
              Source & limitations <span aria-hidden="true">↗</span>
            </button>
          </aside>
        </div>
        <section className="chart-card">
          <div className="chart-heading">
            <div>
              <span className="section-label">THE YEAR IN CONTEXT</span>
              <h2>A gauge on the changing landscape</h2>
            </div>
            <div className="chart-legend">
              <span>
                <i /> Official storage (%)
              </span>
              {numericMode && (
                <span>
                  <i className="area-legend" /> Radar {classificationChannel}{" "}
                  area (km²)
                </span>
              )}
              <span>
                <i className="hatch" /> NISAR gap
              </span>
            </div>
          </div>
          {gaugeError ? (
            <div className="inline-error" role="alert">
              {gaugeError}
              <button onClick={() => setGaugeRetry((i) => i + 1)}>
                Retry gauges
              </button>
            </div>
          ) : series ? (
            <GaugeChart
              records={series.records}
              dates={index.dates}
              selected={acquisition}
              onSelect={selectDate}
              gap={index.gap}
              areaSeries={archive?.series}
            />
          ) : (
            <div className="chart-loading" role="status">
              Loading official gauge samples…
            </div>
          )}
          <div className="chart-footer">
            <p>
              {series?.source_kind === "live"
                ? `${series.records.length} sampled official dates. Lines are visual guides, not daily observations.`
                : "25 sampled official dates from the supplied WRA archive; connecting lines are visual guides, not daily observations."}{" "}
              Missing values remain gaps.
            </p>
            <span>
              {archive
                ? `Spearman ρ = ${archive.series.stats.spearman_area_vs_level?.toFixed(3) ?? "unavailable"} · n = ${archive.series.stats.n} · default ${classificationChannel} area vs water level`
                : "Radar area correlation: not published (validation criteria not met)"}
            </span>
          </div>
        </section>
        {(tab === "methods" || details) && (
          <section className="methods-panel" id="methods" ref={methodsRef}>
            <div className="methods-intro">
              <div className="eyebrow">TRACE EVERY OBSERVATION</div>
              <h2>The evidence, and its limits.</h2>
              <p>
                Surface area is not storage volume.{" "}
                {numericMode
                  ? "We compare estimated radar surface area with water level. The relationship checks the method; it does not infer water volume."
                  : "This edition shows imagery and gauges side by side; it does not measure water area or infer water volume."}
              </p>
            </div>
            <div className="method-columns">
              <div>
                <h3>Current observation</h3>
                <dl>
                  <dt>Product</dt>
                  <dd>{index.collection} · Provisional</dd>
                  {numericMode && (
                    <>
                      <dt>Processing</dt>
                      <dd>
                        Invalid mask filtering → 3×3 linear-power mean → fixed
                        EPSG:3857 bilinear grid → 10·log10 → Uint8 quantization
                        (0 = invalid). One pooled Otsu threshold per reservoir;
                        sensitivity ±1.5 dB.
                      </dd>
                      <dt>Current {classificationChannel} threshold</dt>
                      <dd>
                        {threshold.toFixed(1)} dB · pixel area{" "}
                        {archive?.meta.pixel_area_m2.toFixed(2) ?? "—"} m²
                      </dd>
                    </>
                  )}
                  <dt>Granule</dt>
                  <dd className="granule">{acquisition.granule}</dd>
                  <dt>Acquired · UTC</dt>
                  <dd>{acquisition.utc}</dd>
                  <dt>Acquired · Taiwan (UTC+8)</dt>
                  <dd>{acquisition.local}</dd>
                  <dt>Official observation · Taiwan</dt>
                  <dd>
                    {current &&
                    (current.pct !== null || current.level_m !== null)
                      ? `${current.local_date} 07:00:00 +08:00`
                      : "No valid gauge reading for this date"}
                  </dd>
                  <dt>Numerical validation</dt>
                  <dd>
                    Authenticated AOI reads passed. Frozen water-classification
                    methods did not reach the required independent correlation.
                    Area results are not published in this edition.
                  </dd>
                  <dt>Gauge archive</dt>
                  <dd>
                    {series?.source_kind === "live"
                      ? "Endpoint observations"
                      : "Supplied seed archive"}{" "}
                    · retrieved{" "}
                    {series?.retrieved_at || index.seed_retrieved_at}
                  </dd>
                </dl>
                <a
                  href={dataUrl("provenance.json")}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open machine-readable provenance ↗
                </a>
                <br />
                <a
                  href="https://github.com/Mephisto-000/taiwan-water-pulse/blob/main/pipeline/assets/numeric-validation.json"
                  target="_blank"
                  rel="noreferrer"
                >
                  Inspect the independent validation report ↗
                </a>
              </div>
              <div>
                <h3>Read this before interpreting</h3>
                <ul>
                  <li>
                    Track 111 ascending, Frame 014, 40+5 MHz, HH/HV. No VV or VH
                    measurements are present.
                  </li>
                  <li>
                    {numericMode
                      ? `The radar grid is north-up and fixed across dates. Blue water candidates use ${classificationChannel}, independent of the displayed HH/HV channel. Zoom adds no spatial detail.`
                      : "Browse previews are display images, not calibrated dB rasters. Zoom adds no detail. The location map is separate from the radar image."}
                  </li>
                  <li>
                    Calibrated GCOV gamma-nought power must be filtered and
                    resampled in linear units before conversion to dB.
                  </li>
                  <li>
                    Wind, rain, floating debris, steep-bank layover and shadow,
                    and speckle all affect radar interpretation.
                  </li>
                  <li>
                    Provisional calibration may change with reprocessing; orbit
                    accuracy is near-real-time. Pixel spacing is not spatial
                    resolution.
                  </li>
                  <li>
                    {numericMode
                      ? "8-bit quantization uses 0 for invalid values and maps valid values over −35 to +5 dB (about 0.157 dB per step). Sensitivity intervals reflect threshold ±1.5 dB, not a statistical confidence interval."
                      : "A future numerical edition uses 8-bit quantization and threshold sensitivity ranges. Neither is applied to these browse images."}
                  </li>
                  <li>
                    The 07:00 gauge reading is about 1.7 hours after the
                    acquisition. No radar products are available from 18 March
                    through 20 June 2026 (UTC product dates).
                  </li>
                </ul>
              </div>
            </div>
            <div className="method-source-links">
              <a
                href="https://nisar-docs.asf.alaska.edu/gcov/"
                target="_blank"
                rel="noreferrer"
              >
                NISAR GCOV guide ↗
              </a>
              <a
                href="https://fhy.wra.gov.tw/fhyv2/monitor/reservoir"
                target="_blank"
                rel="noreferrer"
              >
                WRA reservoir information ↗
              </a>
              <a
                href="https://github.com/Mephisto-000/taiwan-water-pulse/blob/main/docs/methods.md"
                target="_blank"
                rel="noreferrer"
              >
                Reproduce the methods ↗
              </a>
            </div>
          </section>
        )}
        <div className="science-note">
          <span aria-hidden="true">≈</span>
          <p>
            <strong>
              A surface tells a story. It does not tell the whole story.
            </strong>{" "}
            Water area is not storage volume.{" "}
            {numericMode
              ? "Wind, debris, exposed banks and radar geometry affect the estimate. Explore the threshold, the gauge record and the limitations together."
              : "Gauge samples provide context; they do not validate measurements from browse previews."}
          </p>
          <span className="edition-tag">
            v0.1 / {numericMode ? "CALIBRATED GCOV" : "BROWSE EDITION"}
          </span>
        </div>
      </main>
      <footer>
        <span className="footer-brand">
          <PulseIcon /> Taiwan’s Water Pulse
        </span>
        <p>
          NISAR · NASA/JPL & ISRO · ASF DAAC <span>/</span> © OpenStreetMap
          contributors <span>/</span> 經濟部水利署
        </p>
        <span>Open data. Visible limits.</span>
      </footer>
    </>
  );
}

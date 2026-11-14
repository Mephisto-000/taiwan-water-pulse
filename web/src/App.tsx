// SI-generated and SI-assisted code and copy. Scope: /si-usage.json.
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
    title: "滿庫的起點",
    date: "2025-11-05",
    reservoir: "baoshan2",
    text: "故事從滿庫開始。2025 年 11 月 6 日，寶山第二水庫的蓄水率為 100.0%。",
  },
  {
    number: "02",
    title: "乾旱的冬季",
    date: "2026-03-17",
    reservoir: "baoshan2",
    text: "到了 2026 年 3 月 18 日，寶山第二水庫蓄水率降至 28.2%。沿著官方觀測資料，回顧冬季的變化。",
  },
  {
    number: "03",
    title: "觀測的空白",
    date: "2026-03-17",
    reservoir: "liyutan",
    text: "這個影幅（Frame）在 2026 年 3 月 18 日至 6 月 20 日沒有 NISAR 產品（UTC 日期）。官方資料仍有取樣，雷達觀測則留白。",
  },
  {
    number: "04",
    title: "水又回來了",
    date: "2026-06-21",
    reservoir: "baoshan2",
    text: "2026 年 6 月 22 日，寶山第二水庫蓄水率回到 100.0%。雷達觀測也在缺口後恢復。",
  },
  {
    number: "05",
    title: "不同的節奏",
    date: "2026-08-20",
    reservoir: "feitsui",
    text: "翡翠水庫呈現不同節奏：2026 年 3 月 18 日蓄水率為 91.9%，8 月 21 日為 74.1%。差異的成因仍是假說（Hypothesis），有待查證。",
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
          setError(e instanceof Error ? e.message : "無法載入資料。");
      });
    return () => controller.abort();
  }, [retry]);
  if (error)
    return (
      <main className="boot">
        <PulseIcon />
        <h1>無法載入歷史資料</h1>
        <p role="alert">{error}</p>
        <button onClick={() => setRetry((n) => n + 1)}>重新載入</button>
      </main>
    );
  if (!index)
    return (
      <main className="boot" aria-live="polite">
        <PulseIcon />
        <h1>台灣水庫的旱澇節奏</h1>
        <p>正在載入水庫歷史資料…</p>
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
            e instanceof Error ? e.message : "無法載入官方觀測資料",
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
        跳至互動探索
      </a>
      <header className="site-header">
        <a className="brand" href={import.meta.env.BASE_URL}>
          <span className="brand-icon">
            <PulseIcon />
          </span>
          <span>
            台灣水庫的旱澇節奏
            <small>Taiwan’s Water Pulse</small>
            <small className="si-icon-label">SI-generated icon</small>
          </span>
        </a>
        <nav aria-label="主要導覽">
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
                ? "互動探索"
                : item === "story"
                  ? "水庫故事"
                  : "資料與方法"}
            </button>
          ))}
        </nav>
        <a
          className="github-link"
          href="https://github.com/Mephisto-000/taiwan-water-pulse"
          target="_blank"
          rel="noreferrer"
        >
          檢視原始碼 <span aria-hidden="true">↗</span>
        </a>
      </header>
      <main id="explorer">
        <aside className="si-disclosure" aria-label="SI 使用揭露">
          <strong>SI-assisted project · SI 使用揭露</strong>
          <p>
            OpenAI Codex 協助產生程式碼、介面文案、文件與資料整理流程。
            雷達預覽圖與官方觀測來自原始資料來源，並非 SI 生成。
          </p>
          <a href={dataUrl("si-usage.json")} target="_blank" rel="noreferrer">
            查看使用範圍與 metadata ↗
          </a>
        </aside>
        <section className="intro">
          <div>
            <div className="eyebrow">
              <span /> NISAR 首年歷史資料{" "}
              <span className="eyebrow-divider">/</span> 台灣
            </div>
            <h1>每座水庫，都有自己的節奏。</h1>
            <p>透過 L 波段雷達（L-band radar），回顧水庫一年間的退水與回補。</p>
          </div>
          <div className="archive-tag">
            <span>歷史觀測資料</span>
            <strong>
              2025 年 11 月 <span>—</span> 2026 年 10 月
            </strong>
            <small>
              {index.dates.length} 次通過 · {index.reservoirs.length} 座水庫 ·
              一段地景的變化
            </small>
          </div>
        </section>
        <div className="mode-notice">
          <span className="notice-label">
            {numericMode ? "校準資料（GCOV）" : "預覽圖版本（Browse）"}
          </span>
          <p>
            {numericMode
              ? "探索校準後的雷達後向散射（Backscatter），調整水體門檻，並與官方觀測資料比較。"
              : "使用真實雷達預覽圖與官方觀測資料。校準資料已成功讀取，但水面積估算未達獨立驗證標準，因此不予發布。"}
          </p>
          <button
            onClick={() => {
              setTab("methods");
              setDetails(true);
            }}
          >
            了解版本限制 <span aria-hidden="true">↗</span>
          </button>
        </div>
        {tab === "story" && (
          <section className="story-panel" aria-label="五幕故事導覽">
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
              離開故事導覽 <span aria-hidden="true">↗</span>
            </button>
          </section>
        )}
        <div className="workspace">
          <aside className="sidebar">
            <div className="section-label">
              01 <span>選擇水庫</span>
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
                    {r.name_zh}
                    <small>
                      {r.name} {r.key === "feitsui" ? "· 對照水庫" : ""}
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
                <span className="tiny-dot" /> 台灣北中部
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
              <span className="eyebrow">雷達如何看見水</span>
              <svg
                className="radar-diagram"
                viewBox="0 0 230 65"
                role="img"
                aria-label="平靜水面將雷達反射至別處；粗糙陸地將部分訊號散射回衛星"
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
                  水面
                </text>
                <text x="174" y="64" textAnchor="middle">
                  陸地
                </text>
              </svg>
              <p>
                平靜水面將雷達脈衝反射至衛星以外的方向，因此影像偏暗；陸地與植被將部分訊號散射回來，因此較亮。
              </p>
            </div>
          </aside>
          <div className="main-column">
            <section className="radar-card" aria-label="NISAR 雷達影像">
              <div className="card-heading">
                <div>
                  <span className="section-label">
                    02 <span>閱讀雷達影像</span>
                  </span>
                  <h2>
                    {reservoir.name_zh}
                    <span className="chinese-name">{reservoir.name}</span>
                  </h2>
                </div>
                <div
                  className="channel-control"
                  role="group"
                  aria-label="實際量測的雷達通道"
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
                  <span className="muted">· 台灣時間</span>
                </span>
                <span>
                  軌道（Track）111 ↑ <span className="muted">/</span>{" "}
                  影幅（Frame）014
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
                      alt={`NISAR ${polarization} 完整影幅預覽圖，取像時間為 ${acquisition.utc}。僅供目視判讀，並非具有地理定位的水庫疊圖。`}
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
                  <span className="scene-dot" /> L 波段 / {polarization}{" "}
                  <small>
                    {numericMode
                      ? "校準水庫格網 · EPSG:3857"
                      : "完整影幅預覽圖（Browse）"}
                  </small>
                </div>
                <span className="north-label">
                  {numericMode ? "N ↑" : "原始格網"}
                  <small>
                    {numericMode ? "北向上 · 固定格網" : "依產品格網方向"}
                  </small>
                </span>
                {(numericMode
                  ? !archive && !numerical.error
                  : imageState === "loading" && available) && (
                  <div className="scene-status" role="status">
                    <div className="loading-bar" />
                    正在載入雷達觀測…
                  </div>
                )}
                {(numericMode
                  ? !!numerical.error
                  : !available || imageState === "error") && (
                  <div className="scene-status" role="alert">
                    <strong>
                      {numericMode ? "無法載入數值資料" : "無法載入預覽圖"}
                    </strong>
                    <span>
                      {numericMode
                        ? numerical.error
                        : "無法顯示這筆觀測，仍可查看其他日期與官方資料。"}
                    </span>
                    {available && (
                      <button
                        onClick={() =>
                          numericMode
                            ? numerical.retry()
                            : setImageRetry((i) => i + 1)
                        }
                      >
                        重新載入影像
                      </button>
                    )}
                  </div>
                )}
                <div className="scene-bottom">
                  <span>
                    {numericMode
                      ? `γ⁰ · −35 至 +5 dB · 藍色為 ${classificationChannel} 候選水體`
                      : "γ⁰ 預覽圖 · 僅供目視判讀"}
                  </span>
                  <div className="zoom-controls">
                    <button
                      aria-label="縮小影像"
                      disabled={zoom <= 1}
                      onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
                    >
                      −
                    </button>
                    <button aria-label="重設縮放" onClick={() => setZoom(1)}>
                      {zoom.toFixed(1)}×
                    </button>
                    <button
                      aria-label="放大影像"
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
                  暗 ≈ 低回波 <span className="gray-scale" /> 亮 ≈ 高回波
                </span>
                <span>
                  {numericMode
                    ? `藍色遮罩以 ${classificationChannel} 判定，與顯示通道無關`
                    : "不從預覽圖推算 dB 或水面積"}
                </span>
              </div>
              <div className="channel-note">
                <span aria-hidden="true">ⓘ</span>{" "}
                {polarization === "HH"
                  ? "HH：水平極化發射、水平極化接收。"
                  : "HV：水平極化發射、垂直極化接收。"}{" "}
                切換極化（Polarization）是選擇既有量測通道，不會產生新的觀測。
              </div>
            </section>
            <section className="timeline-card" aria-label="取像時間軸">
              <div className="timeline-heading">
                <span className="section-label">
                  03 <span>探索時間變化</span>
                </span>
                <span className="observation-count">
                  觀測 {String(dateIndex + 1).padStart(2, "0")}{" "}
                  <span>/ {index.dates.length}</span>
                </span>
              </div>
              <div className="timeline-controls">
                <button
                  className={`play-button ${playing ? "playing" : ""}`}
                  aria-label={playing ? "暫停播放" : "播放觀測"}
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
                    <span>沒有可用產品</span>
                  </div>
                  {index.dates.map((d, i) => (
                    <button
                      key={d.utc_date}
                      aria-label={`選擇 ${formatDate(d.local.slice(0, 10))}`}
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
                    <span>2025/11</span>
                    <span>2026/01</span>
                    <span>3 月</span>
                    <span>5 月</span>
                    <span>7 月</span>
                    <span>9 月</span>
                    <span>10 月</span>
                  </div>
                </div>
                <div className="step-buttons">
                  <button
                    aria-label="上一筆觀測"
                    disabled={dateIndex === 0}
                    onClick={() => selectDate(dateIndex - 1)}
                  >
                    <Arrow left />
                  </button>
                  <button
                    aria-label="下一筆觀測"
                    disabled={dateIndex === index.dates.length - 1}
                    onClick={() => selectDate(dateIndex + 1)}
                  >
                    <Arrow />
                  </button>
                </div>
              </div>
              <div className="timeline-foot">
                <span>刻度依實際時間排列，可用 ← → 切換。</span>
                <span>產品缺口（UTC）：2026/03/18–06/20</span>
              </div>
            </section>
          </div>
          <aside className="gauge-sidebar">
            <div className="section-label">
              04 <span>對照官方資料</span>
            </div>
            <div className="gauge-date">
              {formatDate(acquisition.local.slice(0, 10), true)}{" "}
              <span>· 台灣時間 07:00</span>
            </div>
            <div className="metric-label">官方蓄水率</div>
            <div className="storage-metric">
              {current?.pct != null ? current.pct.toFixed(1) : "—"}
              <span>%</span>
            </div>
            <div className="storage-bar">
              <div style={{ width: `${current?.pct ?? 0}%` }} />
            </div>
            <div className="change-label">
              {change === null
                ? "無官方觀測值"
                : `${change > 0 ? "+" : ""}${change.toFixed(1)} 個百分點`}
              <span>
                相較於 {first ? formatDate(first.local_date, true) : "首筆觀測"}
              </span>
            </div>
            <div className="level-metric">
              <span>水位</span>
              <strong>
                {current?.level_m != null ? current.level_m.toFixed(2) : "—"}{" "}
                <small>m</small>
              </strong>
            </div>
            <div className="source-chip">水利署（WRA）· 官方觀測</div>
            <div className="area-unavailable">
              <span className="metric-label">雷達水面積</span>
              {numericMode ? (
                <div className="numeric-area">
                  {estimate?.area.toFixed(3) ?? "—"} <small>km²</small>
                </div>
              ) : (
                <strong>未提供估算</strong>
              )}
              <p>
                {numericMode
                  ? `在固定水庫遮罩內計算偏暗的有效 ${classificationChannel} 像素。水面積僅為估算，不是蓄水量。`
                  : "預覽圖僅供目視比較；可靠的水面積估算需要校準後的 GCOV 像素與通過驗證的分類方法。"}
              </p>
              {numericMode && estimate && (
                <div className="numeric-sensitivity">
                  敏感度範圍： {estimate.low.toFixed(3)}–
                  {estimate.high.toFixed(3)} km²
                  <br />
                  {classificationChannel} 門檻 ±1.5 dB
                </div>
              )}
              <label className={numericMode ? "threshold-control" : undefined}>
                {numericMode ? `${classificationChannel} 水體門檻` : "水體門檻"}{" "}
                <span>
                  {numericMode ? `${threshold.toFixed(1)} dB` : "未提供"}
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
                      ? `${classificationChannel} 水體門檻，單位 dB`
                      : "預覽圖版本不提供水體門檻"
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
                  重設為 Otsu 預設門檻
                </button>
              )}
              {!!areaObservation?.qa.length && (
                <div className="qa-notice">
                  QA: {areaObservation.qa.join(" · ")}
                </div>
              )}
              <small>
                {numericMode
                  ? `圖表與相關係數使用固定的 ${classificationChannel} 預設門檻；滑桿僅更新目前觀測與藍色疊圖。`
                  : "此版本停用門檻運算、敏感度範圍與相關係數。"}
              </small>
            </div>
            <button
              className="provenance-button"
              onClick={() => {
                setDetails((p) => !p);
                setTab("methods");
              }}
            >
              來源與限制 <span aria-hidden="true">↗</span>
            </button>
          </aside>
        </div>
        <section className="chart-card">
          <div className="chart-heading">
            <div>
              <span className="section-label">放回一整年的脈絡</span>
              <h2>用官方觀測，看見水情變化</h2>
            </div>
            <div className="chart-legend">
              <span>
                <i /> 官方蓄水率（%）
              </span>
              {numericMode && (
                <span>
                  <i className="area-legend" /> 雷達 {classificationChannel}{" "}
                  面積（km²）
                </span>
              )}
              <span>
                <i className="hatch" /> NISAR 資料缺口
              </span>
            </div>
          </div>
          {gaugeError ? (
            <div className="inline-error" role="alert">
              {gaugeError}
              <button onClick={() => setGaugeRetry((i) => i + 1)}>
                重新載入官方資料
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
              正在載入官方取樣資料…
            </div>
          )}
          <div className="chart-footer">
            <p>
              {series?.source_kind === "live"
                ? `官方資料共取樣 ${series.records.length} 個日期。連線僅協助閱讀，不代表每日觀測。`
                : "附錄提供 25 個日期的官方取樣值；連線僅協助閱讀，不代表每日觀測。"}{" "}
              缺值保持留白。
            </p>
            <span>
              {archive
                ? `Spearman ρ = ${archive.series.stats.spearman_area_vs_level?.toFixed(3) ?? "未提供"} · n = ${archive.series.stats.n} · 固定預設 ${classificationChannel} 面積對水位`
                : "水面積相關係數：不予發布（未達驗證標準）"}
            </span>
          </div>
        </section>
        {(tab === "methods" || details) && (
          <section className="methods-panel" id="methods" ref={methodsRef}>
            <div className="methods-intro">
              <div className="eyebrow">追溯每筆觀測</div>
              <h2>看見證據，也看見限制。</h2>
              <p>
                水面積不等於蓄水量（Storage volume）。{" "}
                {numericMode
                  ? "以雷達估計的水面積對照水位，檢查方法是否合理，不用來推估蓄水量。"
                  : "此版本並列顯示影像與官方觀測，不量測水面積，也不推估蓄水量。"}
              </p>
            </div>
            <div className="method-columns">
              <div>
                <h3>目前觀測</h3>
                <dl>
                  <dt>產品</dt>
                  <dd>{index.collection} · 成熟度：Provisional</dd>
                  {numericMode && (
                    <>
                      <dt>處理流程</dt>
                      <dd>
                        排除無效像素 → 3×3 線性 power 平均 → EPSG:3857
                        固定格網雙線性重採樣 → 10·log10 → Uint8 量化（0
                        為無效值）。每座水庫使用固定 Otsu 門檻，敏感度範圍為
                        ±1.5 dB。
                      </dd>
                      <dt>目前 {classificationChannel} 門檻</dt>
                      <dd>
                        {threshold.toFixed(1)} dB · 像素面積{" "}
                        {archive?.meta.pixel_area_m2.toFixed(2) ?? "—"} m²
                      </dd>
                    </>
                  )}
                  <dt>資料產品識別碼（Granule）</dt>
                  <dd className="granule">{acquisition.granule}</dd>
                  <dt>取像時間 · UTC</dt>
                  <dd>{acquisition.utc}</dd>
                  <dt>取像時間 · 台灣（UTC+8）</dt>
                  <dd>{acquisition.local}</dd>
                  <dt>官方觀測時間 · 台灣</dt>
                  <dd>
                    {current &&
                    (current.pct !== null || current.level_m !== null)
                      ? `${current.local_date} 07:00:00 +08:00`
                      : "此日期無有效官方觀測值"}
                  </dd>
                  <dt>數值驗證</dt>
                  <dd>
                    研究區（AOI）認證讀取已通過；固定水體分類方法未達獨立驗證的相關性標準，因此本版不發布水面積結果。
                  </dd>
                  <dt>官方資料快取</dt>
                  <dd>
                    {series?.source_kind === "live"
                      ? "查詢端點觀測值"
                      : "附錄種子資料"}{" "}
                    · 擷取時間 {series?.retrieved_at || index.seed_retrieved_at}
                  </dd>
                </dl>
                <a
                  href={dataUrl("provenance.json")}
                  target="_blank"
                  rel="noreferrer"
                >
                  開啟資料來源紀錄（Provenance）↗
                </a>
                <br />
                <a
                  href="https://github.com/Mephisto-000/taiwan-water-pulse/blob/main/pipeline/assets/numeric-validation.json"
                  target="_blank"
                  rel="noreferrer"
                >
                  查看獨立驗證報告 ↗
                </a>
              </div>
              <div>
                <h3>判讀前，請先了解</h3>
                <ul>
                  <li>
                    SI 使用：OpenAI Codex 協助產生程式碼、文案與資料整理流程；
                    原始影像與官方觀測並非 SI 生成。自訂圖示已標記為
                    SI-generated。 自動檢查不代表獨立科學審查。
                  </li>
                  <li>
                    採用升軌（Ascending）Track 111、Frame 014、40+5
                    MHz、HH/HV；此資料不含 VV 或 VH 量測。
                  </li>
                  <li>
                    {numericMode
                      ? `雷達格網為北向上，所有日期使用同一格網。藍色候選水體以 ${classificationChannel} 判定，不受顯示中的 HH/HV 通道影響；放大不會增加真實細節。`
                      : "預覽圖（Browse）是顯示影像，不是校準後的 dB 格網。放大不會增加真實細節；定位地圖與雷達影像分開呈現。"}
                  </li>
                  <li>
                    GCOV 的 gamma-nought（γ⁰）功率（Power）
                    必須先在線性單位下濾波、重採樣，最後才轉為 dB。
                  </li>
                  <li>
                    風浪、降雨、漂流物、陡岸疊置（Layover）、雷達陰影（Shadow）與斑點雜訊（Speckle）都會影響判讀。
                  </li>
                  <li>
                    產品成熟度為
                    Provisional，重新處理可能改變校準值；軌道精度旗標為
                    near-real-time。像素間距不等於空間解析度。
                  </li>
                  <li>
                    {numericMode
                      ? "8-bit 量化以 0 表示無效值，有效值涵蓋 −35 至 +5 dB（每階約 0.157 dB）。敏感度範圍反映門檻 ±1.5 dB 的變動，不是統計信賴區間（Confidence interval）。"
                      : "後續數值版會使用 8-bit 量化（Quantization）與門檻敏感度範圍；本版預覽圖不套用這些計算。"}
                  </li>
                  <li>
                    官方 07:00 觀測約比取像晚 1.7 小時；2026/03/18–06/20
                    沒有雷達產品（UTC 日期）。
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
                NISAR GCOV 產品指南 ↗
              </a>
              <a
                href="https://fhy.wra.gov.tw/fhyv2/monitor/reservoir"
                target="_blank"
                rel="noreferrer"
              >
                水利署（WRA）水庫資訊 ↗
              </a>
              <a
                href="https://github.com/Mephisto-000/taiwan-water-pulse/blob/main/docs/methods.md"
                target="_blank"
                rel="noreferrer"
              >
                查看可重現的方法 ↗
              </a>
            </div>
          </section>
        )}
        <div className="science-note">
          <span aria-hidden="true">≈</span>
          <p>
            <strong>水面能說出故事，卻不是故事的全部。</strong>{" "}
            水面積不等於蓄水量。{" "}
            {numericMode
              ? "風浪、漂流物、裸露岸地與雷達幾何都會影響估算；請一併檢視門檻、官方紀錄與方法限制。"
              : "官方取樣值提供脈絡，不能用來宣稱預覽圖能量測水面積。"}
          </p>
          <span className="edition-tag">
            v0.1 / {numericMode ? "校準資料（GCOV）" : "預覽圖版本（Browse）"}
          </span>
        </div>
      </main>
      <footer>
        <span className="footer-brand">
          <PulseIcon /> 台灣水庫的旱澇節奏
        </span>
        <p>
          NISAR · NASA/JPL & ISRO · ASF DAAC <span>/</span> © OpenStreetMap
          contributors <span>/</span> 經濟部水利署
        </p>
        <span>開放資料，也揭露限制。</span>
      </footer>
    </>
  );
}

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { formatAcquisitionDate, type Polarization } from "../domain";
import type { Language } from "../i18n";
import { canPublishArea, type NumericalArchive } from "../numerical";
import { RadarCanvas } from "./RadarViewer";

export interface ComparisonProps {
  archive: NumericalArchive;
  date: string;
  compareDate: string;
  polarization: Polarization;
  lang: Language;
  mode?: "single" | "side-by-side" | "swipe";
  showWater?: boolean;
  showReferenceEdge?: boolean;
  referenceLabel?: string;
  selectedLabel?: string;
  onInteract?: () => void;
  frameErrors?: Record<string, string>;
  onRetry?: (date: string, polarization: Polarization) => void;
}
export default function Comparison({
  archive,
  date,
  compareDate,
  polarization,
  lang,
  mode = "swipe",
  showWater = false,
  showReferenceEdge = true,
  referenceLabel,
  selectedLabel,
  onInteract,
  frameErrors = {},
  onRetry,
}: ComparisonProps) {
  const [position, setPosition] = useState(50);
  const [mobileDate, setMobileDate] = useState<"reference" | "selected">(
    "selected",
  );
  const [narrow, setNarrow] = useState(false);
  const dragPointer = useRef<number | null>(null);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    setMobileDate("selected");
  }, [date, archive.meta]);
  const en = lang === "en";
  const eligible = canPublishArea(archive);
  const displayReady =
    !!archive.frames[date]?.[polarization] &&
    !!archive.frames[compareDate]?.[polarization];
  const reference = archive.series.records.find(
    (record) => record.utc.slice(0, 10) === compareDate,
  );
  const selected = archive.series.records.find(
    (record) => record.utc.slice(0, 10) === date,
  );
  const full = (reference?.official.pct ?? 0) >= 99.5;
  const referenceName = full ? (en ? "Full" : "滿庫") : en ? "Start" : "起點";
  const hasFlags = (observation: typeof reference) =>
    (
      observation?.qa_by_channel?.[polarization] ??
      (polarization === "HH" ? observation?.qa : []) ??
      []
    ).length > 0;
  const referenceCaption =
    referenceLabel ??
    `${reference ? formatAcquisitionDate(reference.utc, false, lang) : compareDate}　${referenceName}`;
  const selectedCaption =
    selectedLabel ??
    (selected ? formatAcquisitionDate(selected.utc, false, lang) : date);
  const label = en
    ? "Compare radar dates: move the divider"
    : "比較雷達日期：移動分隔線";
  const canvas = (referencePane: boolean) => {
    const target = referencePane ? compareDate : date;
    const observation = referencePane ? reference : selected;
    const parts = [
      referencePane ? referenceCaption : selectedCaption,
      polarization,
    ];
    if (observation?.official.pct != null)
      parts.push(
        `${en ? "Storage" : "蓄水率"} ${observation.official.pct.toFixed(1)}%`,
      );
    if (eligible && observation) {
      parts.push(
        `${en ? "HH water surface" : "HH 水面"} ${observation.area_km2.primary.toFixed(2)} km²`,
      );
      if (!referencePane && reference && reference.area_km2.primary > 0) {
        const change =
          (observation.area_km2.primary / reference.area_km2.primary - 1) * 100;
        parts.push(
          `${en ? "Change from reference" : "相較對照日變化"} ${change.toFixed(1).replace("-", "−")}%`,
        );
      }
    }
    return (
      <RadarCanvas
        archive={archive}
        date={target}
        polarization={polarization}
        lang={lang}
        label={parts.join(", ")}
        showWater={showWater}
        showOutline={!eligible && showReferenceEdge}
        showScale
        referenceDate={referencePane ? undefined : compareDate}
        showReferenceEdge={!referencePane && showReferenceEdge}
        error={frameErrors[`${target}:${polarization}`]}
        onRetry={() => onRetry?.(target, polarization)}
      />
    );
  };
  const legend = (referencePane = false) => {
    const parts: string[] = [];
    if (showWater && eligible)
      parts.push(en ? "Blue: HH-classified water" : "藍色：HH 分類水面");
    if (showReferenceEdge && (!referencePane || !eligible))
      parts.push(
        eligible
          ? full
            ? en
              ? "Line: full-pool HH edge"
              : "線：滿庫 HH 水面邊界"
            : en
              ? "Line: reference HH edge"
              : "線：對照日 HH 水面邊界"
          : en
            ? "Line: OSM reference outline"
            : "線：OSM 參考輪廓",
      );
    return parts.length ? (
      <span
        className="radar-image-legend"
        style={{
          position: "absolute",
          right: 12,
          top: 44,
          zIndex: 2,
          pointerEvents: "none",
        }}
      >
        {parts.map((text) => (
          <span key={text}>{text}</span>
        ))}
      </span>
    ) : null;
  };
  const pane = (referencePane: boolean) => (
    <div
      className={`comparison-pane ${referencePane ? "is-reference" : "is-selected"}`}
    >
      {canvas(referencePane)}
      {legend(referencePane)}
      <span className="comparison-date-label">
        {referencePane ? referenceCaption : selectedCaption}
        {hasFlags(referencePane ? reference : selected) && (
          <abbr
            title={
              en
                ? "Quality flag; see methods and sources"
                : "品質旗標；詳見方法與來源"
            }
          >
            {" "}
            †
          </abbr>
        )}
      </span>
    </div>
  );
  const moveDivider = (event: PointerEvent<HTMLInputElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width > 0)
      setPosition(
        Math.round(
          Math.max(
            0,
            Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100),
          ),
        ),
      );
  };
  const mobileCompare = narrow && mode !== "single";
  return (
    <figure
      className={`comparison comparison-${mode}`}
      style={{ margin: 0 }}
      onPointerDown={onInteract}
    >
      {mobileCompare && (
        <div
          className="comparison-mobile-switch"
          role="group"
          aria-label={en ? "Displayed date" : "顯示日期"}
        >
          <button
            type="button"
            aria-pressed={mobileDate === "reference"}
            onClick={() => {
              setMobileDate("reference");
              onInteract?.();
            }}
          >
            {referenceName}
          </button>
          <button
            type="button"
            aria-pressed={mobileDate === "selected"}
            onClick={() => {
              setMobileDate("selected");
              onInteract?.();
            }}
          >
            {en ? "Selected" : "這一天"}
          </button>
        </div>
      )}
      {mobileCompare ? (
        pane(mobileDate === "reference")
      ) : mode === "single" ? (
        pane(false)
      ) : mode === "side-by-side" ? (
        <div className="comparison-pair">
          {pane(true)}
          {pane(false)}
        </div>
      ) : (
        <div
          className="comparison-stage"
          style={{ position: "relative", overflow: "hidden" }}
        >
          {canvas(true)}
          <div
            style={{
              position: "absolute",
              inset: 0,
              clipPath: `inset(0 ${100 - position}% 0 0)`,
            }}
          >
            {canvas(false)}
          </div>
          <span className="compare-date compare-date-left">
            {selectedCaption}
            {hasFlags(selected) && (
              <abbr
                title={
                  en
                    ? "Quality flag; see methods and sources"
                    : "品質旗標；詳見方法與來源"
                }
              >
                {" "}
                †
              </abbr>
            )}
          </span>
          <span className="compare-date compare-date-right">
            {referenceCaption}
            {hasFlags(reference) && (
              <abbr
                title={
                  en
                    ? "Quality flag; see methods and sources"
                    : "品質旗標；詳見方法與來源"
                }
              >
                {" "}
                †
              </abbr>
            )}
          </span>
          <span
            className="compare-divider"
            style={{
              position: "absolute",
              left: `${position}%`,
              top: 0,
              bottom: 0,
              borderLeft: "2px solid white",
              pointerEvents: "none",
            }}
            aria-hidden="true"
          >
            <span>↔</span>
          </span>
          <input
            type="range"
            disabled={!displayReady}
            min={0}
            max={100}
            step={1}
            value={position}
            aria-label={label}
            aria-valuetext={
              en
                ? `${position}% selected date visible`
                : `選取日顯示 ${position}%`
            }
            onChange={(event) => {
              setPosition(Number(event.target.value));
              onInteract?.();
            }}
            onKeyDown={(event) => {
              if (
                ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              ) {
                event.stopPropagation();
                onInteract?.();
              }
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              event.currentTarget.focus({ preventScroll: true });
              event.currentTarget.setPointerCapture(event.pointerId);
              dragPointer.current = event.pointerId;
              moveDivider(event);
            }}
            onPointerMove={(event) => {
              if (dragPointer.current === event.pointerId) moveDivider(event);
            }}
            onPointerUp={(event) => {
              if (dragPointer.current !== event.pointerId) return;
              dragPointer.current = null;
              event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={() => {
              dragPointer.current = null;
            }}
            onLostPointerCapture={() => {
              dragPointer.current = null;
            }}
            className="comparison-drag"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              opacity: 0,
              margin: 0,
              cursor: "ew-resize",
              pointerEvents: displayReady ? "auto" : "none",
              touchAction: "pan-y",
            }}
          />
          {legend()}
        </div>
      )}
    </figure>
  );
}

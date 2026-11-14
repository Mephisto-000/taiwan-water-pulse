import { useRef, useState, type PointerEvent } from "react";
import type { Polarization } from "../domain";
import type { Language } from "../i18n";
import type { NumericalArchive } from "../numerical";
import { RadarCanvas } from "./RadarViewer";

export default function Comparison({
  archive,
  date,
  compareDate,
  polarization,
  lang,
}: {
  archive: NumericalArchive;
  date: string;
  compareDate: string;
  polarization: Polarization;
  lang: Language;
}) {
  const [position, setPosition] = useState(50);
  const dragPointer = useRef<number | null>(null);
  const en = lang === "en";
  const label = en
    ? "Compare radar dates: move the divider"
    : "比較雷達日期：移動分隔線";
  const groundWidth =
    archive.meta.grid.width * Math.sqrt(archive.meta.pixel_area_m2);
  const scale = groundWidth > 2500 ? 1000 : 500;
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
  return (
    <figure className="comparison" style={{ margin: 0 }}>
      <div
        className="comparison-stage"
        style={{ position: "relative", overflow: "hidden" }}
      >
        <RadarCanvas
          archive={archive}
          date={compareDate}
          polarization={polarization}
          label={`${compareDate} UTC · ${polarization}`}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            clipPath: `inset(0 ${100 - position}% 0 0)`,
          }}
        >
          <RadarCanvas
            archive={archive}
            date={date}
            polarization={polarization}
            label={`${date} UTC · ${polarization}`}
          />
        </div>
        <span
          className="compare-date compare-date-left"
          style={{ position: "absolute", top: 16, left: 16 }}
        >
          {date} UTC
        </span>
        <span
          className="compare-date compare-date-right"
          style={{ position: "absolute", top: 16, right: 16 }}
        >
          {compareDate} UTC
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
        <span
          className="radar-north"
          style={{ position: "absolute", bottom: 16, right: 16 }}
          aria-label={en ? "North" : "北方"}
        >
          ↑ N
        </span>
        <div
          className="radar-scale"
          style={{
            position: "absolute",
            bottom: 18,
            left: 18,
            width: `${(scale / groundWidth) * 100}%`,
          }}
        >
          <span>{scale >= 1000 ? `${scale / 1000} km` : `${scale} m`}</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={position}
          aria-label={label}
          aria-valuetext={
            en
              ? `${date} visible on ${position}% of the image`
              : `${date} 顯示於影像的 ${position}%`
          }
          onChange={(event) => setPosition(Number(event.target.value))}
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
            touchAction: "pan-y",
          }}
        />
      </div>
      <figcaption className="comparison-caption">
        <span>
          {en
            ? "Drag the divider, or focus and use ← →. Same grid and fixed dB scale."
            : "拖曳分隔線，或聚焦後使用 ← →。兩日期使用相同格網與固定 dB 色階。"}
        </span>
        <output>
          {position}% / {100 - position}%
        </output>
      </figcaption>
      <div className="radar-caption">
        <span>
          NISAR GCOV · {archive.meta.grid.pixel_side_m} m{" "}
          {en ? "output grid" : "輸出格網"} · {polarization}
        </span>
        <span className="outline-legend">
          {en ? "OpenStreetMap reference outline" : "OpenStreetMap 參考輪廓"}
        </span>
      </div>
      <div className="radar-colorbar">
        <span>−35</span>
        <span
          className="grayscale-ramp"
          style={{
            background: "linear-gradient(to right, #000, #fff)",
            height: 12,
            flex: 1,
            border: "1px solid #677977",
          }}
        />
        <span>+5 γ⁰ (dB)</span>
      </div>
      <p className="chart-note">
        {en
          ? "Checkerboard = no data. The reference outline is not an observed shoreline."
          : "棋盤格表示無資料；參考輪廓並非當次觀測的水岸線。"}
      </p>
    </figure>
  );
}

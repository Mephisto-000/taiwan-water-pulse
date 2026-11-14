// SI-assisted visualization code; radar observations are source data, not SI-generated.
import { useEffect, useRef, useState } from "react";
import { decodeDb, type Polarization } from "../domain";
import {
  canPublishArea,
  hasRelativeAnalysis,
  relativeThresholdDb,
  type NumericalArchive,
} from "../numerical";
import type { Language } from "../i18n";

export interface RadarCanvasProps {
  archive: NumericalArchive;
  date: string;
  polarization: Polarization;
  label: string;
  ratio?: number;
  showWater?: boolean;
  showOutline?: boolean;
  onPixel?: (index: number | null) => void;
}

/** All dates and polarizations share one fixed grid and the same −35…+5 dB scale. */
export function RadarCanvas({
  archive,
  date,
  polarization,
  label,
  ratio,
  showWater = false,
  showOutline = true,
  onPixel,
}: RadarCanvasProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { width, height } = archive.meta.grid;
  const frame = archive.frames[date];
  const analysis = archive.meta.analysis;
  const activeRatio = ratio ?? analysis?.threshold_ratio ?? 0.6;
  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context) return;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, width, height);
    if (!frame) return;
    const image = context.createImageData(width, height);
    for (let i = 0; i < width * height; i++) {
      const value = frame[polarization][i];
      const gray =
        value === 0
          ? (Math.floor((i % width) / 4) +
              Math.floor(Math.floor(i / width) / 4)) %
            2
            ? 208
            : 232
          : Math.round(((value - 1) / 254) * 255);
      image.data[i * 4] = gray;
      image.data[i * 4 + 1] = gray;
      image.data[i * 4 + 2] = gray;
      image.data[i * 4 + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    if (showWater && canPublishArea(archive) && hasRelativeAnalysis(archive)) {
      const analysis = archive.meta.analysis;
      const coarse = document.createElement("canvas");
      coarse.width = analysis.grid.width;
      coarse.height = analysis.grid.height;
      const coarseContext = coarse.getContext("2d");
      const pixels = archive.analysis.frames[date];
      if (coarseContext && pixels) {
        const maskImage = coarseContext.createImageData(
          coarse.width,
          coarse.height,
        );
        const threshold = relativeThresholdDb(
          activeRatio,
          analysis.land_median_db_by_date[date],
        );
        for (let i = 0; i < pixels.length; i++) {
          const db = decodeDb(pixels[i]);
          if (archive.analysis.mask[i] !== 1 || db === null || db >= threshold)
            continue;
          maskImage.data[i * 4] = 20;
          maskImage.data[i * 4 + 1] = 128;
          maskImage.data[i * 4 + 2] = 185;
          maskImage.data[i * 4 + 3] = 145;
        }
        coarseContext.putImageData(maskImage, 0, 0);
        context.save();
        context.setTransform(...analysis.display_transform);
        context.imageSmoothingEnabled = false;
        context.drawImage(coarse, 0, 0);
        context.restore();
      }
    }
  }, [
    archive,
    frame,
    polarization,
    date,
    analysis,
    activeRatio,
    showWater,
    width,
    height,
  ]);
  return (
    <div
      className="radar-canvas-wrap"
      style={{ position: "relative", width: "100%" }}
    >
      <canvas
        ref={canvas}
        width={width}
        height={height}
        role="img"
        aria-label={label}
        style={{
          display: "block",
          width: "100%",
          height: "auto",
          imageRendering: "pixelated",
        }}
        onPointerLeave={() => onPixel?.(null)}
        onPointerMove={(event) => {
          if (!onPixel) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          const x = Math.floor(
            ((event.clientX - bounds.left) / bounds.width) * width,
          );
          const y = Math.floor(
            ((event.clientY - bounds.top) / bounds.height) * height,
          );
          onPixel(
            x >= 0 && y >= 0 && x < width && y < height ? y * width + x : null,
          );
        }}
      />
      {showOutline && (archive.meta.outline_pixel_rings?.length ?? 0) > 0 && (
        <svg
          aria-hidden="true"
          viewBox={`0 0 ${width} ${height}`}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
        >
          {archive.meta.outline_pixel_rings?.map((ring, i) => (
            <path
              key={i}
              d={
                ring
                  .map(([x, y], j) => `${j === 0 ? "M" : "L"}${x},${y}`)
                  .join(" ") + " Z"
              }
              fill="none"
              stroke="#a6e9e0"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      )}
    </div>
  );
}

export default function RadarViewer({
  archive,
  date,
  polarization,
  lang,
  ratio,
  showWater = false,
  showOutline = true,
}: Omit<RadarCanvasProps, "label" | "onPixel"> & { lang: Language }) {
  const [pointer, setPointer] = useState<{
    archive: NumericalArchive;
    date: string;
    index: number;
  } | null>(null);
  const frame = archive.frames[date];
  const pixel =
    pointer?.archive === archive && pointer.date === date
      ? pointer.index
      : null;
  const hh = pixel !== null && frame ? decodeDb(frame.HH[pixel]) : null;
  const hv = pixel !== null && frame ? decodeDb(frame.HV[pixel]) : null;
  const scale =
    archive.meta.grid.width * Math.sqrt(archive.meta.pixel_area_m2) > 2500
      ? 1000
      : 500;
  const scalePercent =
    (scale /
      (archive.meta.grid.width * Math.sqrt(archive.meta.pixel_area_m2))) *
    100;
  const en = lang === "en";
  const label = `${date} · ${polarization} · ${en ? "calibrated NISAR radar, north up" : "NISAR 校準雷達影像，北方朝上"}`;
  return (
    <figure className="radar-viewer" style={{ margin: 0 }}>
      <div
        className="radar-stage"
        style={{
          position: "relative",
          overflow: "hidden",
          background: "#161e20",
        }}
      >
        <RadarCanvas
          archive={archive}
          date={date}
          polarization={polarization}
          ratio={ratio}
          showWater={showWater}
          showOutline={showOutline}
          label={label}
          onPixel={(index) =>
            setPointer(index === null ? null : { archive, date, index })
          }
        />
        <span
          className="radar-north"
          style={{ position: "absolute", top: 16, right: 16 }}
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
            width: `${scalePercent}%`,
          }}
        >
          <span>{scale >= 1000 ? `${scale / 1000} km` : `${scale} m`}</span>
        </div>
      </div>
      <figcaption className="radar-caption">
        <span>
          NISAR GCOV · {archive.meta.grid.pixel_side_m} m{" "}
          {en ? "output grid" : "輸出格網"} · {polarization}
        </span>
        {showOutline && (
          <span className="outline-legend">
            {en
              ? "Outline: OpenStreetMap reference boundary"
              : "輪廓：OpenStreetMap 參考邊界"}
          </span>
        )}
      </figcaption>
      <div
        className="radar-colorbar"
        aria-label={
          en
            ? "Fixed backscatter scale, gamma nought in decibels"
            : "固定後向散射色階，γ⁰，單位 dB"
        }
      >
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
      <p className="pixel-readout">
        {pixel === null
          ? en
            ? "Move over the image to inspect the calibrated HH and HV pixels."
            : "移至影像上，查看同一像素的 HH 與 HV 校準值。"
          : `HH ${hh?.toFixed(2) ?? "—"} dB · HV ${hv?.toFixed(2) ?? "—"} dB · ${archive.mask[pixel] ? (en ? "inside reference outline" : "參考輪廓內") : en ? "outside reference outline" : "參考輪廓外"}`}
      </p>
      {showWater && canPublishArea(archive) && hasRelativeAnalysis(archive) && (
        <p className="chart-note">
          {en
            ? `Blue cells: ${archive.meta.analysis.grid.pixel_side_m} m analysis classification, projected onto the display grid. They are not ${archive.meta.grid.pixel_side_m} m independent water estimates.`
            : `藍色格為 ${archive.meta.analysis.grid.pixel_side_m} m 分析格網的分類結果，投影至顯示影像；並非 ${archive.meta.grid.pixel_side_m} m 獨立水體估算。`}
        </p>
      )}
      <p className="chart-note">
        {en
          ? "Checkerboard = no data. The reference outline is not an observed shoreline."
          : "棋盤格表示無資料；參考輪廓並非當次觀測的水岸線。"}
      </p>
    </figure>
  );
}

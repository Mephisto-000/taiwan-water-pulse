// SI-assisted visualization code; radar observations are source data, not SI-generated.
import { useEffect, useMemo, useRef, useState } from "react";
import { decodeDb, formatAcquisitionDate, type Polarization } from "../domain";
import {
  canPublishArea,
  relativeThresholdDb,
  type NumericalArchive,
  type NumericMeta,
} from "../numerical";
import {
  classifyWaterMask,
  DISPLAY_RANGES,
  displayGray,
  traceWaterBoundaries,
  transformBoundary,
} from "../radar-display";
import type { Language } from "../i18n";

export interface RadarCanvasProps {
  archive: NumericalArchive;
  date: string;
  polarization: Polarization;
  label: string;
  ratio?: number;
  showWater?: boolean;
  showOutline?: boolean;
  showScale?: boolean;
  referenceDate?: string;
  showReferenceEdge?: boolean;
  error?: string;
  onRetry?: () => void;
  lang?: Language;
  onPixel?: (index: number | null) => void;
}

/** Display contrast does not alter the encoded powers or the independent HH classification. */
export function RadarCanvas({
  archive,
  date,
  polarization,
  label,
  ratio,
  showWater = false,
  showOutline = true,
  showScale = false,
  referenceDate,
  showReferenceEdge = !!referenceDate,
  error,
  onRetry,
  lang = "zh-TW",
  onPixel,
}: RadarCanvasProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { width, height } = archive.meta.grid;
  const pixels = archive.frames[date]?.[polarization];
  const displayRange =
    archive.meta.display_ranges_db?.[polarization] ??
    DISPLAY_RANGES[polarization];
  const analysis = archive.meta.analysis;
  const analysisPixels = archive.analysis?.frames[date];
  const referencePixels = referenceDate
    ? archive.analysis?.frames[referenceDate]
    : undefined;
  const analysisMask = archive.analysis?.mask;
  const activeRatio = ratio ?? analysis?.threshold_ratio ?? 0.6;
  const eligible = canPublishArea(archive);
  const en = lang === "en";
  const edge = useMemo(() => {
    if (
      !showReferenceEdge ||
      !eligible ||
      !analysis ||
      !referenceDate ||
      !referencePixels ||
      !analysisMask
    )
      return [];
    const binary = classifyWaterMask(
      referencePixels,
      analysisMask,
      relativeThresholdDb(
        activeRatio,
        analysis.land_median_db_by_date[referenceDate],
      ),
    );
    return traceWaterBoundaries(
      binary,
      analysis.grid.width,
      analysis.grid.height,
    ).map((ring) => transformBoundary(ring, analysis.display_transform));
  }, [
    showReferenceEdge,
    eligible,
    analysis,
    referenceDate,
    referencePixels,
    analysisMask,
    activeRatio,
  ]);
  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context) return;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, width, height);
    if (!pixels) return;
    const image = context.createImageData(width, height);
    for (let i = 0; i < pixels.length; i++) {
      const gray =
        displayGray(pixels[i], polarization, displayRange) ??
        ((Math.floor((i % width) / 4) + Math.floor(Math.floor(i / width) / 4)) %
        2
          ? 208
          : 232);
      image.data[i * 4] = gray;
      image.data[i * 4 + 1] = gray;
      image.data[i * 4 + 2] = gray;
      image.data[i * 4 + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    if (showWater && eligible && analysis && analysisPixels && analysisMask) {
      const coarse = document.createElement("canvas");
      coarse.width = analysis.grid.width;
      coarse.height = analysis.grid.height;
      const coarseContext = coarse.getContext("2d");
      if (coarseContext) {
        const binary = classifyWaterMask(
          analysisPixels,
          analysisMask,
          relativeThresholdDb(
            activeRatio,
            analysis.land_median_db_by_date[date],
          ),
        );
        const overlay = coarseContext.createImageData(
          coarse.width,
          coarse.height,
        );
        for (let i = 0; i < binary.length; i++) {
          if (!binary[i]) continue;
          overlay.data[i * 4] = 47;
          overlay.data[i * 4 + 1] = 111;
          overlay.data[i * 4 + 2] = 237;
          overlay.data[i * 4 + 3] = 120;
        }
        coarseContext.putImageData(overlay, 0, 0);
        context.save();
        context.setTransform(...analysis.display_transform);
        context.imageSmoothingEnabled = false;
        context.drawImage(coarse, 0, 0);
        context.restore();
      }
    }
  }, [
    pixels,
    polarization,
    displayRange,
    date,
    analysis,
    analysisPixels,
    analysisMask,
    activeRatio,
    showWater,
    eligible,
    width,
    height,
  ]);
  const groundWidth = width * Math.sqrt(archive.meta.pixel_area_m2);
  const scale = groundWidth > 2500 ? 1000 : 500;
  const osm =
    !pixels ||
    (showReferenceEdge && !eligible) ||
    (showOutline && !showReferenceEdge)
      ? archive.meta.outline_pixel_rings
      : [];
  return (
    <div
      className={`radar-canvas-wrap${pixels ? " is-ready" : " is-loading"}`}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: `${width} / ${height}`,
      }}
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
          if (!onPixel || !pixels) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          const fittedScale = Math.min(
            bounds.width / width,
            bounds.height / height,
          );
          const insetX = (bounds.width - width * fittedScale) / 2;
          const insetY = (bounds.height - height * fittedScale) / 2;
          const x = Math.floor(
            (event.clientX - bounds.left - insetX) / fittedScale,
          );
          const y = Math.floor(
            (event.clientY - bounds.top - insetY) / fittedScale,
          );
          onPixel(
            x >= 0 && y >= 0 && x < width && y < height ? y * width + x : null,
          );
        }}
      />
      {(osm.length > 0 || edge.length > 0 || (showScale && pixels)) && (
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
          {showScale && pixels && (
            <g
              className="radar-geographic-scale"
              fill="white"
              stroke="#0009"
              strokeWidth="2"
              paintOrder="stroke"
            >
              <path
                d={`M14 ${height - 14} h${(scale / groundWidth) * width}`}
                fill="none"
                stroke="white"
                strokeWidth="3"
                vectorEffect="non-scaling-stroke"
                style={{ filter: "drop-shadow(0 0 1px #000)" }}
              />
              <text
                x="14"
                y={height - 21}
                fontSize={Math.max(10, width / 60)}
                fontFamily="system-ui, sans-serif"
              >
                {scale >= 1000 ? `${scale / 1000} km` : `${scale} m`}
              </text>
              <path
                d={`M${width - 18} ${height - 18} v-18 m-4 4 l4 -4 l4 4`}
                fill="none"
                stroke="white"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={width - 18}
                y={height - 40}
                textAnchor="middle"
                fontSize={Math.max(10, width / 60)}
                fontFamily="system-ui, sans-serif"
              >
                N
              </text>
            </g>
          )}
          {(edge.length ? edge : osm).map((ring, index) => (
            <path
              key={index}
              d={
                ring.map(([x, y], j) => `${j ? "L" : "M"}${x},${y}`).join(" ") +
                " Z"
              }
              fill="none"
              stroke={
                edge.length
                  ? "var(--edge-on-image, #ffffff)"
                  : "var(--outline-on-image, #888888)"
              }
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              style={{ filter: "drop-shadow(0 0 1px #0008)" }}
            />
          ))}
        </svg>
      )}
      {!pixels &&
        (error ? (
          <div
            className="radar-error"
            role="alert"
            style={{ position: "absolute", zIndex: 3, inset: 0 }}
          >
            <p>
              {en ? "This image could not be loaded." : "這張影像沒有載入成功"}
            </p>
            {onRetry && (
              <button type="button" onClick={onRetry}>
                {en ? "Try again" : "再試一次"}
              </button>
            )}
          </div>
        ) : (
          <div className="radar-loading" role="status">
            {en ? "Loading radar image…" : "正在載入雷達影像…"}
          </div>
        ))}
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
  referenceDate,
  showReferenceEdge,
  error,
  onRetry,
}: Omit<RadarCanvasProps, "label" | "onPixel"> & { lang: Language }) {
  const [pointer, setPointer] = useState<{
    meta: NumericMeta;
    date: string;
    index: number;
  } | null>(null);
  const pixels = archive.frames[date];
  const pixel =
    pointer?.date === date && pointer.meta === archive.meta
      ? pointer.index
      : null;
  const hh = pixel !== null && pixels?.HH ? decodeDb(pixels.HH[pixel]) : null;
  const hv = pixel !== null && pixels?.HV ? decodeDb(pixels.HV[pixel]) : null;
  const en = lang === "en";
  const observation = archive.series.records.find(
    (record) => record.utc.slice(0, 10) === date,
  );
  const dateLabel = observation
    ? formatAcquisitionDate(observation.utc, false, lang)
    : date;
  const [low, high] =
    archive.meta.display_ranges_db?.[polarization] ??
    DISPLAY_RANGES[polarization];
  return (
    <figure className="radar-viewer" style={{ margin: 0 }}>
      <div
        className="radar-stage"
        style={{ position: "relative", overflow: "hidden" }}
      >
        <RadarCanvas
          archive={archive}
          date={date}
          polarization={polarization}
          ratio={ratio}
          showWater={showWater}
          showOutline={showOutline}
          showScale
          referenceDate={referenceDate}
          showReferenceEdge={showReferenceEdge}
          error={error}
          onRetry={onRetry}
          lang={lang}
          label={`${dateLabel}, ${polarization}, ${en ? "calibrated NISAR radar, north up" : "NISAR 校準雷達影像，北方朝上"}`}
          onPixel={(index) =>
            setPointer(
              index === null ? null : { meta: archive.meta, date, index },
            )
          }
        />
      </div>
      <figcaption className="radar-caption">
        <span>
          {polarization}　{archive.meta.grid.pixel_side_m} m
        </span>
        <span>
          {showWater && canPublishArea(archive)
            ? en
              ? "Blue: HH water classification"
              : "藍色：HH 水面分類"
            : showOutline
              ? en
                ? "OSM reference outline"
                : "OSM 參考輪廓"
              : ""}
        </span>
        <span>
          {low}…{high} dB
        </span>
      </figcaption>
      {pixel !== null && (
        <output className="pixel-readout">
          HH {hh?.toFixed(2) ?? "—"} dB　HV {hv?.toFixed(2) ?? "—"} dB
        </output>
      )}
    </figure>
  );
}

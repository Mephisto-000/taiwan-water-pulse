import { useEffect, useRef, useState } from "react";
import { decodeDb, type Polarization } from "../domain";
import type { NumericalArchive } from "../numerical";

export default function NumericScene({
  archive,
  date,
  polarization,
  threshold,
  zoom,
}: {
  archive: NumericalArchive;
  date: string;
  polarization: Polarization;
  threshold: number;
  zoom: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pixel, setPixel] = useState<{
    hh: number | null;
    hv: number | null;
    water: boolean;
  } | null>(null);
  const [displayWidth, setDisplayWidth] = useState(0);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) =>
      setDisplayWidth(entries[0]?.contentRect.width ?? 0),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const frame = archive.frames[date];
  const classifier = archive.meta.classification_channel;
  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context || !frame) return;
    const { width, height } = archive.meta.grid;
    const image = context.createImageData(width, height);
    for (let i = 0; i < width * height; i++) {
      const db = decodeDb(frame[polarization][i]);
      const candidate = decodeDb(frame[classifier][i]);
      const water =
        archive.mask[i] !== 0 && candidate !== null && candidate < threshold;
      const gray =
        db === null
          ? 24
          : Math.round(Math.max(0, Math.min(1, (db + 35) / 40)) * 255);
      image.data[i * 4] = water ? Math.round(gray * 0.35 + 19) : gray;
      image.data[i * 4 + 1] = water ? Math.round(gray * 0.35 + 98) : gray;
      image.data[i * 4 + 2] = water ? Math.round(gray * 0.35 + 148) : gray;
      image.data[i * 4 + 3] = 255;
    }
    context.putImageData(image, 0, 0);
  }, [archive, frame, polarization, threshold, classifier]);
  return (
    <>
      <canvas
        ref={canvas}
        className="numeric-canvas"
        width={archive.meta.grid.width}
        height={archive.meta.grid.height}
        style={{ transform: `scale(${zoom})` }}
        aria-label={`校準後的 ${polarization} gamma-nought 後向散射。藍色像素為水庫遮罩內低於 ${classifier} 門檻 ${threshold} dB 的候選水體。`}
        onPointerLeave={() => setPixel(null)}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const x = Math.floor(
              ((event.clientX - rect.left) / rect.width) *
                archive.meta.grid.width,
            ),
            y = Math.floor(
              ((event.clientY - rect.top) / rect.height) *
                archive.meta.grid.height,
            );
          if (
            x < 0 ||
            y < 0 ||
            x >= archive.meta.grid.width ||
            y >= archive.meta.grid.height
          ) {
            setPixel(null);
            return;
          }
          const i = y * archive.meta.grid.width + x;
          const hh = decodeDb(frame.HH[i]),
            hv = decodeDb(frame.HV[i]);
          const candidate = classifier === "HH" ? hh : hv;
          setPixel({
            hh,
            hv,
            water:
              !!archive.mask[i] && candidate !== null && candidate < threshold,
          });
        }}
      />
      {displayWidth > 0 && (
        <div
          className="numeric-scale"
          style={{
            width: `${(((500 / Math.sqrt(archive.meta.pixel_area_m2)) * displayWidth) / archive.meta.grid.width) * zoom}px`,
          }}
        >
          <span>500 m</span>
        </div>
      )}
      {pixel && (
        <div className="pixel-inspector">
          HH {pixel.hh?.toFixed(2) ?? "無效值"} dB · HV{" "}
          {pixel.hv?.toFixed(2) ?? "無效值"} dB ·{" "}
          {pixel.water ? "候選水體" : "未判定為水體"}
        </div>
      )}
    </>
  );
}

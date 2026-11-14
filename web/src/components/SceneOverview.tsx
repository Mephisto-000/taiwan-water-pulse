import { dataUrl } from "../domain";
import type { Language } from "../i18n";
import type { NumericalArchive } from "../numerical";

export default function SceneOverview({
  archive,
  browsePath,
  lang,
}: {
  archive: NumericalArchive;
  browsePath: string;
  lang: Language;
}) {
  const overview = archive.meta.overview;
  if (!overview) return null;
  const [left, top, width, height] = overview.crop_pixels;
  const en = lang === "en";
  return (
    <figure className="scene-overview">
      <div style={{ position: "relative", width: "100%", maxWidth: 240 }}>
        <img
          src={dataUrl(browsePath)}
          alt={
            en
              ? "Full scene browse, reservoir crop outlined"
              : "全幅雷達預覽圖，框線為目前水庫裁切範圍"
          }
          loading="lazy"
          style={{
            width: "100%",
            height: "auto",
            maxHeight: "none",
            display: "block",
          }}
        />
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: `${(left / overview.source_width) * 100}%`,
            top: `${(top / overview.source_height) * 100}%`,
            width: `${(width / overview.source_width) * 100}%`,
            height: `${(height / overview.source_height) * 100}%`,
            border: "2px solid #b9fff1",
            outline: "1px solid #0c2422",
            boxSizing: "border-box",
          }}
        />
      </div>
      <figcaption>
        {en ? "Full scene · crop location only" : "全幅影像 · 僅供裁切定位"}
      </figcaption>
    </figure>
  );
}

import { useRef } from "react";
import type { Acquisition, Polarization } from "../domain";
import type { Language } from "../i18n";
import type { NumericalArchive } from "../numerical";
import { RadarCanvas } from "./RadarViewer";

export default function Filmstrip({
  archive,
  dates,
  selectedDate,
  polarization,
  lang,
  gap,
  onSelect,
}: {
  archive: NumericalArchive;
  dates: Acquisition[];
  selectedDate: string;
  polarization: Polarization;
  lang: Language;
  gap: { start: string; end: string };
  onSelect: (index: number) => void;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const en = lang === "en";
  const selectedIndex = Math.max(
    0,
    dates.findIndex((date) => date.utc_date === selectedDate),
  );
  return (
    <div
      className="filmstrip-scroll"
      role="group"
      aria-label={
        en
          ? "Radar observations, use arrow keys to select a date"
          : "雷達觀測影格列，使用方向鍵選擇日期"
      }
    >
      <div
        className="filmstrip-track"
        style={{ display: "flex", gap: 12, minWidth: "max-content" }}
      >
        {dates.map((date, index) => (
          <div key={date.utc_date} style={{ display: "flex", gap: 16 }}>
            {index > 0 &&
              dates[index - 1].utc_date < gap.start &&
              date.utc_date > gap.end && (
                <div
                  className="filmstrip-gap"
                  style={{
                    width: 180,
                    display: "grid",
                    placeContent: "center",
                  }}
                >
                  <strong>{en ? "Observation gap" : "觀測缺口"}</strong>
                  <span>{gap.start}</span>
                  <span>— {gap.end}</span>
                </div>
              )}
            <button
              type="button"
              ref={(element) => {
                buttons.current[index] = element;
              }}
              className={`filmstrip-frame${index === selectedIndex ? " is-selected" : ""}`}
              style={{ width: 144 }}
              aria-pressed={index === selectedIndex}
              aria-label={`${date.utc_date} UTC · ${polarization}`}
              tabIndex={index === selectedIndex ? 0 : -1}
              onClick={() => onSelect(index)}
              onKeyDown={(event) => {
                let next: number | null = null;
                if (event.key === "ArrowRight")
                  next = Math.min(dates.length - 1, index + 1);
                if (event.key === "ArrowLeft") next = Math.max(0, index - 1);
                if (event.key === "Home") next = 0;
                if (event.key === "End") next = dates.length - 1;
                if (next === null) return;
                event.preventDefault();
                onSelect(next);
                buttons.current[next]?.focus({ preventScroll: true });
                buttons.current[next]?.scrollIntoView({
                  block: "nearest",
                  inline: "nearest",
                });
              }}
            >
              <span aria-hidden="true">
                <RadarCanvas
                  archive={archive}
                  date={date.utc_date}
                  polarization={polarization}
                  label=""
                  showOutline={false}
                />
              </span>
              <span>{date.utc_date}</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

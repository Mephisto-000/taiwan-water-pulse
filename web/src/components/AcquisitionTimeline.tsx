import { useMemo, useRef, useState, type PointerEvent } from "react";
import { formatAcquisitionDate, type Acquisition } from "../domain";
import type { Language } from "../i18n";
import { buildAcquisitionSlots, timelinePointerSelection } from "../timeline";

export interface AcquisitionTimelineProps {
  dates: Acquisition[];
  selectedIndex: number;
  lang: Language;
  onSelect: (index: number) => void;
  playing?: boolean;
  onTogglePlay?: () => void;
}
export default function AcquisitionTimeline({
  dates,
  selectedIndex,
  lang,
  onSelect,
  playing = false,
  onTogglePlay,
}: AcquisitionTimelineProps) {
  const schedule = useMemo(() => buildAcquisitionSlots(dates), [dates]);
  const buttons = useRef(new Map<number, HTMLButtonElement>());
  const drag = useRef<{ id: number; x: number; moved: boolean } | null>(null);
  const [notice, setNotice] = useState("");
  const en = lang === "en";
  const longGap = schedule.gaps.find((gap) => gap.lastSlot > gap.firstSlot);
  const select = (index: number) => {
    setNotice("");
    onSelect(index);
  };
  const applyPointer = (
    event: PointerEvent<HTMLDivElement>,
    dragging: boolean,
    focus = false,
  ) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const choice = timelinePointerSelection(
      schedule.slots,
      event.clientX,
      bounds.left,
      bounds.width,
      dragging,
    );
    if (choice?.kind === "observation") {
      select(choice.acquisitionIndex);
      if (focus)
        buttons.current
          .get(choice.acquisitionIndex)
          ?.focus({ preventScroll: true });
    } else if (choice?.kind === "missing") {
      setNotice(
        `${formatAcquisitionDate(choice.slot.localTimestamp, true, lang)}${en ? ": no product" : "：沒有產品"}`,
      );
      if (focus)
        buttons.current.get(selectedIndex)?.focus({ preventScroll: true });
    }
  };
  return (
    <div className="acquisition-timeline">
      <div className="acquisition-timeline-controls">
        <button
          type="button"
          onClick={() => select(Math.max(0, selectedIndex - 1))}
          disabled={selectedIndex <= 0}
          aria-label={en ? "Previous observation" : "上一筆觀測"}
        >
          ‹
        </button>
        {onTogglePlay && (
          <button
            type="button"
            className="timeline-play"
            onClick={onTogglePlay}
            aria-label={
              playing
                ? en
                  ? "Pause"
                  : "暫停"
                : en
                  ? "Play observations"
                  : "播放觀測"
            }
          >
            {playing ? "Ⅱ" : "▶"}
          </button>
        )}
        <button
          type="button"
          onClick={() => select(Math.min(dates.length - 1, selectedIndex + 1))}
          disabled={selectedIndex >= dates.length - 1}
          aria-label={en ? "Next observation" : "下一筆觀測"}
        >
          ›
        </button>
      </div>
      <div className="acquisition-timeline-body">
        <div
          className="acquisition-slot-track"
          role="group"
          aria-label={
            en
              ? "Observation dates; arrow keys skip missing products"
              : "觀測日期；方向鍵跳過沒有產品的時段"
          }
          style={{ touchAction: "pan-y" }}
          onPointerDown={(event) => {
            if (event.button !== 0 || drag.current) return;
            drag.current = {
              id: event.pointerId,
              x: event.clientX,
              moved: false,
            };
            // The track owns pointer selection; individual buttons remain keyboard targets.
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!drag.current || drag.current.id !== event.pointerId) return;
            if (event.buttons === 0) {
              drag.current = null;
              return;
            }
            if (Math.abs(event.clientX - drag.current.x) > 4)
              drag.current.moved = true;
            if (drag.current.moved) applyPointer(event, true);
          }}
          onPointerUp={(event) => {
            if (drag.current?.id !== event.pointerId) return;
            applyPointer(event, drag.current.moved, true);
            drag.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
        >
          {schedule.slots.map((slot, slotIndex) => {
            const index = slot.acquisitionIndex;
            const label = `${formatAcquisitionDate(slot.localTimestamp, true, lang)}${index === null ? (en ? ": no product" : "：沒有產品") : ""}`;
            return (
              <button
                type="button"
                key={slot.utcDate}
                ref={(element) => {
                  if (index !== null) {
                    if (element) buttons.current.set(index, element);
                    else buttons.current.delete(index);
                  }
                }}
                className={`acquisition-slot${index === null ? " is-missing" : ""}${index === selectedIndex ? " is-selected" : ""}`}
                style={{
                  left: `${schedule.slots.length > 1 ? (slotIndex / (schedule.slots.length - 1)) * 100 : 0}%`,
                }}
                title={label}
                aria-label={label}
                aria-disabled={index === null}
                aria-pressed={index === selectedIndex}
                tabIndex={index === selectedIndex ? 0 : -1}
                onClick={(event) => {
                  // Pointer taps were handled by track coordinates, including missing slots.
                  // detail=0 retains keyboard and assistive-technology activation.
                  if (event.detail !== 0) return;
                  if (index === null) setNotice(label);
                  else select(index);
                }}
                onKeyDown={(event) => {
                  const next =
                    event.key === "ArrowRight"
                      ? Math.min(dates.length - 1, selectedIndex + 1)
                      : event.key === "ArrowLeft"
                        ? Math.max(0, selectedIndex - 1)
                        : event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? dates.length - 1
                            : null;
                  if (next === null) return;
                  event.preventDefault();
                  event.stopPropagation();
                  select(next);
                  buttons.current.get(next)?.focus({ preventScroll: true });
                }}
              >
                <span />
              </button>
            );
          })}
        </div>
        <div className="acquisition-timeline-labels">
          <span>
            {dates[0] ? formatAcquisitionDate(dates[0], true, lang) : ""}
          </span>
          <span>
            {selectedIndex + 1} / {dates.length}{" "}
            {en ? "observed passes" : "次觀測"}
          </span>
          <span>
            {dates.at(-1)
              ? formatAcquisitionDate(dates.at(-1)!, true, lang)
              : ""}
          </span>
        </div>
        <p className="acquisition-gap-note" aria-live="polite">
          {notice ||
            (longGap
              ? en
                ? `No radar products for these ${longGap.days} days`
                : `這 ${longGap.days} 天沒有雷達產品`
              : en
                ? "Hollow marks indicate no product"
                : "空心刻度表示沒有產品")}
        </p>
      </div>
    </div>
  );
}

import { useEffect, useRef } from "react";
import { formatDate } from "../domain";
import type { ContextEvent } from "../events";
import type { Language } from "../i18n";

export default function EventDialog({
  event,
  onClose,
  lang,
}: {
  event: ContextEvent | null;
  onClose: () => void;
  lang: Language;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const open = Boolean(event);
  const en = lang === "en";
  useEffect(() => {
    const element = dialog.current;
    if (open && element && !element.open) element.showModal();
    else if (!open && element?.open) element.close();
    return () => {
      if (element?.open) element.close();
    };
  }, [open]);
  return (
    <dialog
      ref={dialog}
      id="weather-events-dialog"
      className="event-dialog"
      aria-labelledby="weather-events-title"
      onCancel={onClose}
      onClose={onClose}
      onClick={(click) => {
        const rect = click.currentTarget.getBoundingClientRect();
        if (
          click.target === click.currentTarget &&
          (click.clientX < rect.left ||
            click.clientX > rect.right ||
            click.clientY < rect.top ||
            click.clientY > rect.bottom)
        )
          onClose();
      }}
    >
      <div className="event-dialog-header">
        <h2 id="weather-events-title">
          {en ? "Weather & water events" : "氣象與水情事件"}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={en ? "Close event details" : "關閉事件詳情"}
          autoFocus
        >
          ×
        </button>
      </div>
      {event && (
        <>
          <p className="event-date">
            <time dateTime={event.start_local_date}>
              {formatDate(event.start_local_date, false, lang)}
            </time>
            {event.start_local_date !== event.end_local_date && (
              <>
                {" "}
                –{" "}
                <time dateTime={event.end_local_date}>
                  {formatDate(event.end_local_date, false, lang)}
                </time>
              </>
            )}
            {en ? " · Taiwan dates" : " · 台灣日期"}
          </p>
          <h3>{event.title[lang]}</h3>
          <p>{event.summary[lang]}</p>
          {event.in_long_radar_gap && (
            <p className="chart-note">
              {en ? "Within the radar-product gap" : "位於雷達產品缺口期間"}
            </p>
          )}
          <div className="event-sources">
            {event.sources.map((source) => (
              <a
                key={source.url}
                href={source.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`${source.label} ${en ? "(opens a new tab)" : "（另開分頁）"}`}
              >
                {source.label}
              </a>
            ))}
          </div>
          <p className="chart-note">
            {en
              ? "Reported context, with sources. These events do not establish the cause of radar changes."
              : "附有來源的事件背景；並未據此認定雷達變化的成因。"}
          </p>
        </>
      )}
    </dialog>
  );
}

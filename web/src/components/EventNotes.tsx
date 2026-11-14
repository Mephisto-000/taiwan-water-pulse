import { useEffect, useState } from "react";
import { dataUrl, formatDate } from "../domain";
import type { Language } from "../i18n";
interface ContextEvent {
  id: string;
  start_local_date: string;
  end_local_date: string;
  reservoirs: string[];
  title: Record<Language, string>;
  summary: Record<Language, string>;
  in_long_radar_gap: boolean;
  sources: { url: string; label: string }[];
}
function parseEvents(value: unknown): ContextEvent[] {
  if (
    !value ||
    typeof value !== "object" ||
    !("events" in value) ||
    !Array.isArray(value.events)
  )
    throw new Error("Invalid events");
  return value.events.filter(
    (item): item is ContextEvent =>
      !!item &&
      typeof item === "object" &&
      typeof item.id === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(item.start_local_date) &&
      /^\d{4}-\d{2}-\d{2}$/.test(item.end_local_date) &&
      Array.isArray(item.reservoirs) &&
      ["en", "zh-TW"].every(
        (lang) =>
          typeof item.title?.[lang] === "string" &&
          typeof item.summary?.[lang] === "string",
      ) &&
      Array.isArray(item.sources) &&
      item.sources.every(
        (source: { url?: unknown; label?: unknown }) =>
          typeof source.url === "string" &&
          source.url.startsWith("https://") &&
          typeof source.label === "string",
      ),
  );
}
export default function EventNotes({
  reservoirKey,
  lang,
}: {
  reservoirKey: string;
  lang: Language;
}) {
  const [events, setEvents] = useState<ContextEvent[]>([]),
    [error, setError] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    void fetch(dataUrl("events.json"), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Events unavailable");
        return response.json() as Promise<unknown>;
      })
      .then(parseEvents)
      .then(setEvents)
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [retry]);
  const selected = events.filter((event) =>
    event.reservoirs.includes(reservoirKey),
  );
  if (!error && !selected.length) return null;
  return (
    <section className="event-notes">
      <h2>
        {lang === "en"
          ? "What happened between observations?"
          : "觀測之間，發生了什麼？"}
      </h2>
      <p>
        {lang === "en"
          ? "Reported context, with sources. These events do not establish the cause of radar changes."
          : "以下是附有來源的事件背景；並未據此認定雷達變化的成因。"}
      </p>
      {error ? (
        <button onClick={() => setRetry((n) => n + 1)}>
          {lang === "en" ? "Retry event sources" : "重新載入事件來源"}
        </button>
      ) : (
        <ol>
          {selected.map((event) => (
            <li key={event.id}>
              <time>
                {formatDate(event.start_local_date, true, lang)}
                {event.start_local_date !== event.end_local_date
                  ? `–${formatDate(event.end_local_date, true, lang)}`
                  : ""}
              </time>
              <div>
                <h3>{event.title[lang]}</h3>
                <p>{event.summary[lang]}</p>
                {event.in_long_radar_gap && (
                  <small>
                    {lang === "en"
                      ? "Within the radar-product gap"
                      : "位於雷達產品缺口期間"}
                  </small>
                )}
                <div className="event-sources">
                  {event.sources.map((source) => (
                    <a
                      key={source.url}
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`${source.label} ${lang === "en" ? "(opens a new tab)" : "（另開分頁）"}`}
                    >
                      {source.label}
                    </a>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

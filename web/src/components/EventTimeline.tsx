import { formatDate } from "../domain";
import type { ContextEvent } from "../events";
import type { Language } from "../i18n";

interface EventMarker {
  event: ContextEvent;
  start: number;
  end: number;
  center: number;
  lane: number;
}

/** Keep every dated event, including events without a SAR acquisition. */
export function layoutEventMarkers(
  events: ContextEvent[],
  first: string,
  last: string,
  x: (date: string) => number,
): EventMarker[] {
  const laneEnds: number[] = [];
  return events
    .filter(
      (event) =>
        event.end_local_date >= first && event.start_local_date <= last,
    )
    .sort((a, b) => a.start_local_date.localeCompare(b.start_local_date))
    .map((event) => {
      const start = x(
        event.start_local_date < first ? first : event.start_local_date,
      );
      const end = x(event.end_local_date > last ? last : event.end_local_date);
      const center = (start + end) / 2;
      const left = Math.min(start, center - 22);
      let lane = laneEnds.findIndex((previousEnd) => left >= previousEnd + 8);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = Math.max(end, center + 22);
      return { event, start, end, center, lane };
    });
}

export function eventTimelineHeight(markers: EventMarker[]): number {
  return markers.length
    ? 64 + Math.max(...markers.map((marker) => marker.lane)) * 44
    : 0;
}

export default function EventTimeline({
  markers,
  top,
  left,
  right,
  onSelect,
  lang,
}: {
  markers: EventMarker[];
  top: number;
  left: number;
  right: number;
  onSelect?: (event: ContextEvent) => void;
  lang: Language;
}) {
  if (!markers.length) return null;
  const en = lang === "en";
  return (
    <g
      className="event-timeline"
      aria-label={
        en
          ? "Weather and water events on the date axis"
          : "日期軸上的氣象與水情事件"
      }
    >
      <text x={left} y={top} fill="var(--muted)" fontSize="14">
        {en ? "Events · select a marker" : "事件 · 點選標記查看詳情"}
      </text>
      {Array.from(
        { length: Math.max(...markers.map((marker) => marker.lane)) + 1 },
        (_, lane) => (
          <line
            key={lane}
            x1={left}
            x2={right}
            y1={top + 28 + lane * 44}
            y2={top + 28 + lane * 44}
            stroke="var(--line)"
          />
        ),
      )}
      {markers.map(({ event, start, end, center, lane }, index) => {
        const y = top + 28 + lane * 44;
        const label = `${formatDate(event.start_local_date, false, lang)}${event.start_local_date !== event.end_local_date ? ` – ${formatDate(event.end_local_date, false, lang)}` : ""}: ${event.title[lang]}`;
        return (
          <g
            key={event.id}
            className="event-marker"
            role="button"
            tabIndex={0}
            aria-label={label}
            aria-haspopup="dialog"
            aria-controls="weather-events-dialog"
            onClick={() => onSelect?.(event)}
            onKeyDown={(eventKey) => {
              if (eventKey.key === "Enter" || eventKey.key === " ") {
                eventKey.preventDefault();
                onSelect?.(event);
              }
            }}
          >
            <title>{label}</title>
            <rect
              x={Math.min(start, center - 22)}
              y={y - 22}
              width={Math.max(end, center + 22) - Math.min(start, center - 22)}
              height="44"
              fill="transparent"
            />
            <line
              className="event-duration"
              x1={start}
              x2={end}
              y1={y}
              y2={y}
              stroke="var(--data)"
              strokeWidth="5"
            />
            <circle
              className="event-symbol"
              cx={center}
              cy={y}
              r="12"
              fill="var(--bg)"
              stroke="var(--data)"
              strokeWidth="2"
            />
            <text
              x={center}
              y={y + 5}
              textAnchor="middle"
              fill="var(--data)"
              fontSize="14"
              fontWeight="600"
            >
              {index + 1}
            </text>
          </g>
        );
      })}
    </g>
  );
}

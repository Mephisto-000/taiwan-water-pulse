import type { Language } from "./i18n";

export interface ContextEvent {
  id: string;
  start_local_date: string;
  end_local_date: string;
  reservoirs: string[];
  title: Record<Language, string>;
  summary: Record<Language, string>;
  in_long_radar_gap: boolean;
  sources: { url: string; label: string }[];
}

const validDate = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;

export function parseEvents(value: unknown): ContextEvent[] {
  if (
    !value ||
    typeof value !== "object" ||
    !("events" in value) ||
    !Array.isArray(value.events)
  )
    throw new Error("Invalid events");
  const events = value.events;
  if (
    !events.every(
      (item) =>
        !!item &&
        typeof item === "object" &&
        typeof item.id === "string" &&
        validDate(item.start_local_date) &&
        validDate(item.end_local_date) &&
        item.start_local_date <= item.end_local_date &&
        Array.isArray(item.reservoirs) &&
        item.reservoirs.every((key: unknown) => typeof key === "string") &&
        ["en", "zh-TW"].every(
          (lang) =>
            typeof item.title?.[lang] === "string" &&
            typeof item.summary?.[lang] === "string",
        ) &&
        typeof item.in_long_radar_gap === "boolean" &&
        Array.isArray(item.sources) &&
        item.sources.length > 0 &&
        item.sources.every(
          (source: { url?: unknown; label?: unknown } | null) =>
            !!source &&
            typeof source.url === "string" &&
            source.url.startsWith("https://") &&
            typeof source.label === "string",
        ),
    ) ||
    new Set(events.map((event) => event.id)).size !== events.length
  )
    throw new Error("Invalid event records");
  return events;
}

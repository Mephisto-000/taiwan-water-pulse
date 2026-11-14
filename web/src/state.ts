import {
  nearestAcquisition,
  type DataIndex,
  type Polarization,
} from "./domain";
import { resolveLanguage, type Language } from "./i18n";

export interface ExplorerState {
  reservoirKey: string;
  dateIndex: number;
  polarization: Polarization;
  lang: Language;
  demo: boolean;
  compareDateIndex: number;
}

function safeDateIndex(
  index: DataIndex,
  value: string | null,
  fallback: string,
) {
  const valid =
    value !== null &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
  return nearestAcquisition(index.dates, valid ? value : fallback);
}

/** Parse shared links without permitting invalid selections into application state. */
export function parseExplorerState(
  search: string,
  index: DataIndex,
  browserLanguage = "en",
): ExplorerState {
  if (!index.dates.length || !index.reservoirs.length)
    throw new Error("Explorer state requires a nonempty archive.");
  const query = new URLSearchParams(search);
  const demo = query.get("demo") === "1";
  const requestedReservoir = query.get("reservoir");
  return {
    reservoirKey: index.reservoirs.some(
      (item) => item.key === requestedReservoir,
    )
      ? requestedReservoir!
      : index.reservoirs[0].key,
    dateIndex: safeDateIndex(index, query.get("date"), "2026-03-17"),
    polarization: query.get("pol") === "HV" ? "HV" : "HH",
    lang: resolveLanguage(query.get("lang"), browserLanguage, demo),
    demo,
    compareDateIndex: safeDateIndex(
      index,
      query.get("compareDate"),
      "2025-11-05",
    ),
  };
}

/** Preserve unrelated URL parameters while replacing all application-owned state. */
export function explorerSearch(
  state: ExplorerState,
  index: DataIndex,
  existingSearch = "",
): string {
  const date = index.dates[state.dateIndex];
  const compare = index.dates[state.compareDateIndex];
  if (
    !date ||
    !compare ||
    !index.reservoirs.some((item) => item.key === state.reservoirKey)
  )
    throw new Error("Cannot serialize a selection outside this archive.");
  const query = new URLSearchParams(existingSearch);
  query.set("reservoir", state.reservoirKey);
  query.set("date", date.utc_date);
  query.set("pol", state.polarization);
  query.set("lang", state.demo ? "en" : state.lang);
  query.set("compareDate", compare.utc_date);
  if (state.demo) query.set("demo", "1");
  else query.delete("demo");
  return `?${query.toString()}`;
}

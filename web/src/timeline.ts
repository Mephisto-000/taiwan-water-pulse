import type { Acquisition } from "./domain";

const DAY_MS = 86_400_000;
export interface AcquisitionSlot {
  utcDate: string;
  localTimestamp: string;
  acquisitionIndex: number | null;
  cycle: string | null;
}
export interface AcquisitionSchedule {
  slots: AcquisitionSlot[];
  regular: boolean;
  gaps: { firstSlot: number; lastSlot: number; days: number }[];
}

/** Scheduled slots describe missing products, never fabricated acquisitions. */
export function buildAcquisitionSlots(
  dates: Acquisition[],
  cadenceDays = 12,
): AcquisitionSchedule {
  if (!dates.length) return { slots: [], regular: true, gaps: [] };
  if (!Number.isInteger(cadenceDays) || cadenceDays <= 0)
    throw new Error("Invalid acquisition cadence.");
  const first = Date.parse(dates[0].utc_date);
  const step = cadenceDays * DAY_MS;
  const offsets = dates.map(
    (date) => (Date.parse(date.utc_date) - first) / step,
  );
  const regular = offsets.every(
    (offset, i) =>
      Number.isInteger(offset) &&
      offset >= 0 &&
      (i === 0 || offset > offsets[i - 1]),
  );
  const byDate = new Map(dates.map((date, i) => [date.utc_date, i]));
  const count = regular ? offsets.at(-1)! + 1 : dates.length;
  const slots = Array.from({ length: count }, (_, slot) => {
    const utcDate = regular
      ? new Date(first + slot * step).toISOString().slice(0, 10)
      : dates[slot].utc_date;
    const acquisitionIndex = byDate.get(utcDate) ?? null;
    const observation =
      acquisitionIndex === null ? null : dates[acquisitionIndex];
    return {
      utcDate,
      localTimestamp:
        observation?.local ??
        new Date(
          Date.parse(`${utcDate}T${dates[0].utc.slice(11)}`) + 8 * 3_600_000,
        )
          .toISOString()
          .replace("Z", "+08:00"),
      acquisitionIndex,
      cycle: observation?.granule.match(/_GCOV_(\d{3})_/)?.[1] ?? null,
    };
  });
  const gaps: AcquisitionSchedule["gaps"] = [];
  let start = -1;
  slots.forEach((slot, i) => {
    if (slot.acquisitionIndex === null && start < 0) start = i;
    if (slot.acquisitionIndex !== null && start >= 0) {
      gaps.push({
        firstSlot: start,
        lastSlot: i - 1,
        days: Math.max(
          0,
          Math.round(
            (Date.parse(slot.utcDate) -
              Date.parse(slots[start - 1]?.utcDate ?? slots[start].utcDate)) /
              DAY_MS,
          ) - 1,
        ),
      });
      start = -1;
    }
  });
  return { slots, regular, gaps };
}

/** Dragging selects the closest real observation; empty slots stay unselectable. */
export function nearestAvailableSlot(
  slots: AcquisitionSlot[],
  position: number,
): number | null {
  if (!slots.length || !Number.isFinite(position)) return null;
  const target =
    Math.max(0, Math.min(1, position)) * Math.max(0, slots.length - 1);
  let best: AcquisitionSlot | null = null;
  let distance = Infinity;
  slots.forEach((slot, index) => {
    if (
      slot.acquisitionIndex !== null &&
      Math.abs(index - target) < distance - 1e-9
    ) {
      best = slot;
      distance = Math.abs(index - target);
    }
  });
  return (best as AcquisitionSlot | null)?.acquisitionIndex ?? null;
}

export type TimelinePointerSelection =
  | { kind: "observation"; acquisitionIndex: number }
  | { kind: "missing"; slot: AcquisitionSlot }
  | null;

/** Resolve coordinates against scheduled marks, independent of overlapping button hitboxes. */
export function timelinePointerSelection(
  slots: AcquisitionSlot[],
  clientX: number,
  trackLeft: number,
  trackWidth: number,
  dragging: boolean,
): TimelinePointerSelection {
  if (
    !slots.length ||
    ![clientX, trackLeft, trackWidth].every(Number.isFinite) ||
    trackWidth <= 0
  )
    return null;
  const position = Math.max(0, Math.min(1, (clientX - trackLeft) / trackWidth));
  if (dragging) {
    const acquisitionIndex = nearestAvailableSlot(slots, position);
    return acquisitionIndex === null
      ? null
      : { kind: "observation", acquisitionIndex };
  }
  const slot = slots[Math.round(position * Math.max(0, slots.length - 1))];
  return slot.acquisitionIndex === null
    ? { kind: "missing", slot }
    : { kind: "observation", acquisitionIndex: slot.acquisitionIndex };
}

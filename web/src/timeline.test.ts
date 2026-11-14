import { describe, expect, it } from "vitest";
import manifest from "../public/data/index.json";
import { parseIndex } from "./domain";
import {
  buildAcquisitionSlots,
  nearestAvailableSlot,
  timelinePointerSelection,
} from "./timeline";
const dates = parseIndex(manifest).dates;
describe("scheduled acquisition slots", () => {
  it("represents 30 slots, 21 real passes and nine missing products without fabricating cycles", () => {
    const schedule = buildAcquisitionSlots(dates);
    expect(schedule.regular).toBe(true);
    expect(schedule.slots).toHaveLength(30);
    expect(
      schedule.slots.filter((slot) => slot.acquisitionIndex !== null),
    ).toHaveLength(21);
    const missing = schedule.slots.filter(
      (slot) => slot.acquisitionIndex === null,
    );
    expect(missing).toHaveLength(9);
    expect(missing[0].localTimestamp.slice(0, 10)).toBe("2026-01-05");
    expect(missing.every((slot) => slot.cycle === null)).toBe(true);
    expect(schedule.slots[0].cycle).toBe("004");
    expect(schedule.gaps.find((gap) => gap.days === 95)).toMatchObject({
      firstSlot: 12,
      lastSlot: 18,
    });
  });
  it("falls back to actual observations when an acquisition is off cadence", () => {
    const changed = dates.map((date, index) =>
      index === 1 ? { ...date, utc_date: "2025-11-18" } : date,
    );
    const schedule = buildAcquisitionSlots(changed);
    expect(schedule.regular).toBe(false);
    expect(schedule.slots).toHaveLength(21);
    expect(schedule.slots.every((slot) => slot.acquisitionIndex !== null)).toBe(
      true,
    );
  });
  it("dragging skips missing slots and clamps outside the track", () => {
    const schedule = buildAcquisitionSlots(dates);
    expect(nearestAvailableSlot(schedule.slots, -2)).toBe(0);
    expect(nearestAvailableSlot(schedule.slots, 2)).toBe(20);
    expect(nearestAvailableSlot(schedule.slots, 15 / 29)).toBe(10);
    expect(nearestAvailableSlot(schedule.slots, 18 / 29)).toBe(11);
    expect(nearestAvailableSlot([], 0.5)).toBeNull();
  });
});

it("uses narrow-track coordinates for taps instead of overlapping button hitboxes", () => {
  const { slots } = buildAcquisitionSlots(dates);
  const left = 120,
    width = 240;
  expect(timelinePointerSelection(slots, left, left, width, false)).toEqual({
    kind: "observation",
    acquisitionIndex: 0,
  });
  expect(
    timelinePointerSelection(slots, left + width / 29, left, width, false),
  ).toEqual({ kind: "observation", acquisitionIndex: 1 });
  const missingX = left + (width * 5) / 29;
  expect(
    timelinePointerSelection(slots, missingX, left, width, false),
  ).toMatchObject({
    kind: "missing",
    slot: { utcDate: "2026-01-04", acquisitionIndex: null },
  });
  expect(timelinePointerSelection(slots, missingX, left, width, true)).toEqual({
    kind: "observation",
    acquisitionIndex: 4,
  });
  expect(
    timelinePointerSelection(slots, left + width, left, width, false),
  ).toEqual({ kind: "observation", acquisitionIndex: 20 });
  expect(timelinePointerSelection(slots, left, left, 0, false)).toBeNull();
});

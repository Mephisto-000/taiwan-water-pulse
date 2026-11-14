import { describe, expect, it } from "vitest";
import manifest from "../public/data/index.json";
import baoshan from "../public/data/official/baoshan2.json";
import feitsui from "../public/data/official/feitsui.json";
import {
  datePosition,
  formatDate,
  decodeDb,
  localGaugeDate,
  nearestAcquisition,
  parseIndex,
  parseOfficial,
  waterAreaKm2,
} from "./domain";

describe("exported archive contract", () => {
  const index = parseIndex(manifest);
  it("preserves 21 real acquisitions and four reservoir selections", () => {
    expect(index.dates).toHaveLength(21);
    expect(index.reservoirs.map((r) => r.key)).toEqual([
      "baoshan2",
      "liyutan",
      "shimen",
      "feitsui",
    ]);
    expect(new Set(index.dates.map((d) => d.utc_date)).size).toBe(21);
    for (const date of index.dates) {
      expect(localGaugeDate(date.utc)).toBe(date.local.slice(0, 10));
      expect(date.granule).toContain("_111_A_014_4005_DHDH_A_");
      for (const channel of ["HH", "HV"] as const) {
        expect(date.available[channel]).toBe(true);
        expect(date.browse[channel]).toMatch(/^browse\/\d{8}_(HH|HV)\.png$/);
      }
    }
  });
  it("aligns Taiwan gauge observations to the acquisition rather than the UTC calendar date", () => {
    const series = parseOfficial(baoshan);
    const selected = series.records.find(
      (r) => r.nisar_utc_date === "2026-03-17",
    );
    expect(selected?.local_date).toBe("2026-03-18");
    expect(selected?.pct?.toFixed(1)).toBe("28.2");
    expect(selected?.level_m?.toFixed(2)).toBe("130.81");
  });
  it("keeps missing gauge observations as null", () => {
    const series = parseOfficial(feitsui);
    expect(
      series.records.find((r) => r.local_date === "2026-10-20"),
    ).toMatchObject({ pct: null, level_m: null });
  });
  it("does not manufacture acquisition dates inside the observation gap", () => {
    expect(
      index.dates.filter(
        (d) => d.utc_date > "2026-03-17" && d.utc_date < "2026-06-21",
      ),
    ).toHaveLength(0);
    expect(nearestAcquisition(index.dates, "2026-05-30")).toBe(11);
  });
  it("rejects malformed payloads instead of rendering unknown measurements", () => {
    expect(() => parseIndex({ mode: "numeric" })).toThrow();
    expect(() =>
      parseOfficial({ ...baoshan, records: [{ local_date: "x", pct: NaN }] }),
    ).toThrow();
  });
  it("permits calibrated C-grade images without claiming published area", () => {
    expect(
      parseIndex({
        ...manifest,
        mode: "mixed",
        image_reservoirs: ["baoshan2"],
        numeric_reservoirs: [],
      }).image_reservoirs,
    ).toEqual(["baoshan2"]);
    expect(() =>
      parseIndex({
        ...manifest,
        mode: "mixed",
        image_reservoirs: [],
        numeric_reservoirs: ["baoshan2"],
      }),
    ).toThrow();
  });
  it("rejects duplicate acquisitions, inconsistent local timestamps and asset path traversal", () => {
    expect(() =>
      parseIndex({
        ...manifest,
        dates: [manifest.dates[0], manifest.dates[0]],
      }),
    ).toThrow();
    expect(() =>
      parseIndex({
        ...manifest,
        dates: [{ ...manifest.dates[0], local: "2025-11-06T06:16:41+08:00" }],
      }),
    ).toThrow();
    expect(() =>
      parseIndex({
        ...manifest,
        dates: [
          {
            ...manifest.dates[0],
            browse: { HH: "../../token.md", HV: "browse/20251105_HV.png" },
          },
        ],
      }),
    ).toThrow();
  });
});
describe("time and scientific primitives", () => {
  it("handles Taiwan midnight across year/month boundaries", () => {
    expect(localGaugeDate("2025-12-31T21:16:40Z")).toBe("2026-01-01");
    expect(localGaugeDate("2026-01-31T21:16:40Z")).toBe("2026-02-01");
    expect(() => localGaugeDate("unknown")).toThrow();
  });
  it("uses elapsed days instead of equally spacing observations", () => {
    expect(datePosition("2026-01-11", "2026-01-01", "2026-01-21")).toBe(50);
    expect(datePosition("2026-01-01", "2026-01-01", "2026-01-01")).toBe(0);
    expect(datePosition("invalid", "2026-01-01", "2026-01-21")).toBe(0);
  });
  it("decodes Uint8 sentinel and calibration endpoints", () => {
    expect(decodeDb(0)).toBeNull();
    expect(decodeDb(1)).toBe(-35);
    expect(decodeDb(255)).toBe(5);
    expect(() => decodeDb(256)).toThrow();
  });
  it("counts dark valid pixels only inside the mask with latitude correction", () => {
    const q = new Uint8Array([1, 0, 1, 255]);
    const mask = new Uint8Array([1, 1, 0, 1]);
    expect(waterAreaKm2(q, mask, -18, 20, 60)).toBeCloseTo(0.0001, 12);
    expect(() => waterAreaKm2(q, new Uint8Array(0), -18, 20, 60)).toThrow();
  });
});

it("formats display dates in Taiwan Traditional Chinese", () => {
  expect(formatDate("2026-03-18")).toBe("2026年3月18日");
  expect(formatDate("2026-03-18", true)).toBe("3月18日");
  expect(formatDate("2026-03-18", false, "en")).toBe("18 March 2026");
  expect(formatDate("2026-03-18", true, "en")).toBe("18 Mar");
});

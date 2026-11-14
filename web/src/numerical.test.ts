import { describe, expect, it } from "vitest";
import { estimateArea, parseNumericMeta, parseAreaSeries } from "./numerical";

const quantize = (db: number) => Math.round(((db + 35) / 40) * 254) + 1;
describe("interactive HH classification", () => {
  it("uses one fixed HH mask for area and symmetric threshold sensitivity", () => {
    const pixels = new Uint8Array([
      quantize(-24),
      quantize(-18),
      quantize(-12),
      0,
      quantize(-28),
    ]);
    const mask = new Uint8Array([1, 1, 1, 1, 0]);
    const estimate = estimateArea(pixels, mask, -17, 100);
    expect(estimate.area).toBe(0.0002);
    expect(estimate.low).toBe(0.0001);
    expect(estimate.high).toBe(0.0002);
  });
  it("increases area monotonically when the threshold is relaxed", () => {
    const pixels = new Uint8Array(
      Array.from({ length: 50 }, (_, i) => quantize(-30 + i * 0.4)),
    );
    const mask = new Uint8Array(50).fill(1);
    let previous = 0;
    for (let threshold = -30; threshold <= -8; threshold += 0.5) {
      const next = estimateArea(pixels, mask, threshold, 100);
      expect(next.low).toBeLessThanOrEqual(next.area);
      expect(next.area).toBeLessThanOrEqual(next.high);
      expect(next.area).toBeGreaterThanOrEqual(previous);
      previous = next.area;
    }
  });
  it("rejects corrupted grids and nonfinite area inputs", () => {
    expect(() =>
      estimateArea(new Uint8Array(2), new Uint8Array(1), -18, 100),
    ).toThrow();
    expect(() =>
      estimateArea(new Uint8Array(2), new Uint8Array(2), NaN, 100),
    ).toThrow();
  });
});

describe("numerical asset boundary validation", () => {
  const validMeta = {
    grid: {
      width: 2,
      height: 2,
      bounds: [0, 0, 20, 20],
      bounds_wgs84: [120, 24, 121, 25],
      pixel_side_m: 10,
      epsg: 3857,
    },
    pixel_area_m2: 100,
    classification_channel: "HH",
    thresholds: { HH: -18, HV: -21 },
  };
  it("rejects zero/negative pixel area before it can reach rendering", () => {
    expect(() =>
      parseNumericMeta({ ...validMeta, pixel_area_m2: 0 }),
    ).toThrow();
    expect(() =>
      parseNumericMeta({ ...validMeta, pixel_area_m2: -1 }),
    ).toThrow();
    expect(parseNumericMeta(validMeta).pixel_area_m2).toBe(100);
  });
  it("rejects malformed area records and correlation statistics", () => {
    expect(() =>
      parseAreaSeries({ records: [{ area_km2: null }], stats: { n: 1 } }, []),
    ).toThrow();
    expect(() =>
      parseAreaSeries(
        {
          records: [],
          stats: {
            n: 0,
            spearman_area_hh_vs_level: 2,
            pearson_area_hh_vs_level: null,
          },
        },
        [],
      ),
    ).toThrow();
  });
});

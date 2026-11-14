import { describe, expect, it } from "vitest";
import { niceAxis, readScientificStats } from "./science";

describe("scientific display evidence", () => {
  it("discards malformed optional evidence while preserving valid sections", () => {
    expect(readScientificStats(null)).toEqual({});
    const result = readScientificStats({
      review_version: "v2",
      volume_closure: {
        eligible: true,
        available: true,
        radar_million_m3: Infinity,
      },
    });
    expect(result.review_version).toBe("v2");
    expect(result.volume_closure).toBeUndefined();
  });
  it("does not create zero volume results for missing evidence", () => {
    expect(readScientificStats({})).not.toHaveProperty("volume_closure");
  });
});
describe("data-aware chart axes", () => {
  it("fits the observed area instead of forcing the origin", () => {
    const axis = niceAxis([1.11, 1.161, 1.312, 1.36]);
    expect(axis.minimum).toBeGreaterThan(1);
    expect(axis.minimum).toBeLessThanOrEqual(1.11);
    expect(axis.maximum).toBeGreaterThanOrEqual(1.36);
    expect(axis.ticks.length).toBeLessThanOrEqual(3);
    expect(
      axis.ticks.every((tick) => tick >= axis.minimum && tick <= axis.maximum),
    ).toBe(true);
  });
  it("handles constant, negative, empty and invalid data without division by zero", () => {
    for (const values of [[5, 5], [-2, -1], [], [Number.NaN, Infinity]]) {
      const axis = niceAxis(values);
      expect(Number.isFinite(axis.minimum)).toBe(true);
      expect(axis.maximum).toBeGreaterThan(axis.minimum);
    }
  });
});

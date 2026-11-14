import { describe, expect, it } from "vitest";
import {
  classifyWaterMask,
  displayGray,
  traceWaterBoundaries,
  transformBoundary,
} from "./radar-display";
const quantize = (db: number) => Math.round(((db + 35) / 40) * 254) + 1;
const signedArea = (ring: [number, number][]) =>
  ring
    .slice(0, -1)
    .reduce(
      (sum, point, i) =>
        sum + point[0] * ring[i + 1][1] - ring[i + 1][0] * point[1],
      0,
    ) / 2;
describe("presentation contrast and classified reference boundaries", () => {
  it("clips display contrast without treating nodata as dark water", () => {
    expect(displayGray(0, "HH")).toBeNull();
    expect(displayGray(quantize(-25), "HH")).toBe(0);
    expect(displayGray(quantize(0), "HH")).toBe(255);
    expect(displayGray(quantize(-25), "HV")).toBe(0);
    expect(displayGray(quantize(-3), "HV")).toBe(255);
    expect(
      classifyWaterMask(
        new Uint8Array([0, quantize(-20), quantize(-20), quantize(-5)]),
        new Uint8Array([1, 1, 0, 1]),
        -10,
      ),
    ).toEqual(new Uint8Array([0, 1, 0, 0]));
  });
  it("traces holes and independent diagonal components without changing cell area", () => {
    const rings = traceWaterBoundaries(
      new Uint8Array([1, 1, 1, 1, 0, 1, 1, 1, 1]),
      3,
      3,
    );
    expect(rings).toHaveLength(2);
    expect(rings.reduce((sum, ring) => sum + signedArea(ring), 0)).toBe(8);
    expect(
      traceWaterBoundaries(new Uint8Array([1, 0, 0, 1]), 2, 2),
    ).toHaveLength(2);
    expect(traceWaterBoundaries(new Uint8Array(4), 2, 2)).toEqual([]);
  });
  it("maps analysis pixel edges using every affine coefficient", () => {
    expect(
      transformBoundary(
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
        [3, 0.1, -0.2, 3.2, 10, 20],
      ),
    ).toEqual([
      [10, 20],
      [13, 20.1],
      [12.8, 23.3],
      [10, 20],
    ]);
    expect(() => traceWaterBoundaries(new Uint8Array(3), 2, 2)).toThrow();
  });
});

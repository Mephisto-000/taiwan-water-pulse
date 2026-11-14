import { describe, expect, it } from "vitest";
import { candidateFrequency } from "./radar-analysis";

describe("candidate-water frequency", () => {
  it("excludes no-data pixels and pixels outside the fixed OSM mask", () => {
    const result = candidateFrequency(
      [new Uint8Array([85, 100, 0, 0]), new Uint8Array([90, 0, 84, 0])],
      new Uint8Array([1, 1, 0, 1]),
      [
        { nominal: -20, low: -21.5, high: -18.5 },
        { nominal: -20, low: -21.5, high: -18.5 },
      ],
    );
    expect(result.observationCount).toBe(2);
    expect([...result.validCounts]).toEqual([2, 1, 0, 0]);
    expect([...result.frequency]).toEqual([1, 0, NaN, NaN]);
    expect([...result.low]).toEqual([0.5, 0, NaN, NaN]);
    expect([...result.high]).toEqual([1, 1, NaN, NaN]);
  });
  it("has monotonic threshold sensitivity and keeps missing-only pixels unknown", () => {
    const frames = [new Uint8Array([1, 80, 100, 200, 255, 0])];
    const mask = new Uint8Array([1, 1, 1, 1, 1, 1]);
    const result = candidateFrequency(frames, mask, [
      { nominal: -20, low: -21.5, high: -18.5 },
    ]);
    for (let i = 0; i < 5; i++) {
      expect(result.low[i]).toBeLessThanOrEqual(result.frequency[i]);
      expect(result.frequency[i]).toBeLessThanOrEqual(result.high[i]);
    }
    expect(Number.isNaN(result.frequency[5])).toBe(true);
  });
  it("uses each date's image-only reference rather than one absolute threshold", () => {
    const result = candidateFrequency(
      [new Uint8Array([90]), new Uint8Array([90])],
      new Uint8Array([1]),
      [
        { nominal: -20, low: -21.5, high: -18.5 },
        { nominal: -23, low: -24, high: -22 },
      ],
    );
    expect(result.frequency[0]).toBe(0.5);
    expect(result.low[0]).toBe(0);
    expect(result.high[0]).toBe(0.5);
  });
  it("rejects different grids, invalid masks and nonfinite thresholds", () => {
    const thresholds = [{ nominal: -20, low: -21.5, high: -18.5 }];
    expect(() =>
      candidateFrequency([], new Uint8Array([1]), thresholds),
    ).toThrow();
    expect(() =>
      candidateFrequency([new Uint8Array(2)], new Uint8Array([1]), thresholds),
    ).toThrow();
    expect(() =>
      candidateFrequency(
        [new Uint8Array([1])],
        new Uint8Array([2]),
        thresholds,
      ),
    ).toThrow();
    expect(() =>
      candidateFrequency([new Uint8Array([1])], new Uint8Array([1]), [
        { nominal: NaN, low: -21.5, high: -18.5 },
      ]),
    ).toThrow();
    expect(() =>
      candidateFrequency([new Uint8Array([1])], new Uint8Array([1]), [
        { nominal: -20, low: -18.5, high: -21.5 },
      ]),
    ).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { fitStoragePrediction, predictionSegments } from "./prediction";
import type { AreaObservation } from "./numerical";
import source from "../public/data/reservoirs/baoshan2/timeseries.json";
const real = source.records as AreaObservation[];
const fixture = (): AreaObservation[] =>
  real.slice(0, 8).map((r, i) => ({
    ...r,
    area_km2: { ...r.area_km2, primary: 1 + i / 10 },
    official: { ...r.official, pct: 20 + 5 * i },
  }));
describe("chronological SAR storage calibration", () => {
  it("recovers a linear relation and evaluates only later pairs", () => {
    const model = fitStoragePrediction(fixture().reverse(), 4)!;
    expect(model.slope).toBeCloseTo(50);
    expect(model.evaluation.n).toBe(4);
    expect(model.evaluation.mae).toBeCloseTo(0);
    expect(model.points[4].extrapolated).toBe(true);
  });
  it("does not leak later official values into the fitted predictions", () => {
    const records = fixture(),
      original = fitStoragePrediction(records, 4)!;
    records[7].official.pct = 0;
    const changed = fitStoragePrediction(records, 4)!;
    expect(changed.points.map((p) => p.predicted)).toEqual(
      original.points.map((p) => p.predicted),
    );
    expect(changed.evaluation.mae).toBeGreaterThan(original.evaluation.mae!);
  });
  it("rejects degenerate fits and preserves at least three evaluation pairs", () => {
    expect(fitStoragePrediction(fixture(), 6)).toBeNull();
    expect(
      fitStoragePrediction(
        fixture().map((r) => ({
          ...r,
          area_km2: { ...r.area_km2, primary: 1 },
        })),
        4,
      ),
    ).toBeNull();
  });
  it("predicts missing official values without silently clipping out-of-range results", () => {
    const records = fixture();
    records[7].official.pct = null;
    records[7].area_km2.primary = 4;
    const model = fitStoragePrediction(records, 4)!;
    expect(model.points[7].predicted).toBeGreaterThan(100);
    expect(model.evaluation.n).toBe(3);
  });
  it("splits the actual archive at the long acquisition gap", () => {
    const model = fitStoragePrediction(real, 6)!;
    expect(predictionSegments(model.points)).toHaveLength(2);
    expect(model.evaluation.n).toBe(15);
  });
});

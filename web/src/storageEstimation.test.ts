import { describe, expect, it } from "vitest";
import {
  matchingEstimation,
  parseStorageEstimation,
} from "./storageEstimation";
import type { NumericalArchive } from "./numerical";
import realReport from "../public/data/storage-estimation.json";

const fixture = () => structuredClone(realReport);

describe("offline two-stage report guard", () => {
  it("accepts a completed evaluation and preserves high-water abstention", () => {
    const report = parseStorageEstimation(fixture());
    expect(report.reservoirs.baoshan2.points[0].estimate_pct).toBeNull();
  });
  it("rejects incomplete or failed evaluation including individual gate checks", () => {
    expect(() =>
      parseStorageEstimation({ ...fixture(), evaluation_status: "pending" }),
    ).toThrow();
    expect(() =>
      parseStorageEstimation({ ...fixture(), gate: { passed: false } }),
    ).toThrow();
    const data = fixture();
    data.gate.checks[0].passed = false;
    expect(() => parseStorageEstimation(data)).toThrow();
    expect(() =>
      parseStorageEstimation({
        ...fixture(),
        gate: { passed: true, checks: [] },
      }),
    ).toThrow();
  });
  it("rejects high-water numeric estimates and non-finite numbers", () => {
    const data = fixture();
    Object.assign(data.reservoirs.baoshan2.points[0], { estimate_pct: 90 });
    expect(() => parseStorageEstimation(data)).toThrow();
    const other = fixture();
    other.reservoirs.baoshan2.full_pool.sample_sd_area_km2 = NaN;
    expect(() => parseStorageEstimation(other)).toThrow();
  });
  it("rejects B/C estimates and insufficient full-pool samples", () => {
    for (const grade of ["B", "C"]) {
      const data = fixture();
      data.reservoirs.baoshan2.grade = grade;
      expect(() => parseStorageEstimation(data)).toThrow();
    }
    const data = fixture();
    data.reservoirs.baoshan2.full_pool.n = 2;
    expect(() => parseStorageEstimation(data)).toThrow();
  });
  it("rejects a left-out date included in its own calibration", () => {
    const data = fixture();
    const fold = data.reservoirs.baoshan2.evaluation.numeric.folds[0];
    fold.calibration_utc.push(fold.utc);
    expect(() => parseStorageEstimation(data)).toThrow();
  });
  it("requires every low calibration date once, with exactly the remaining calibration", () => {
    const data = fixture();
    data.reservoirs.baoshan2.evaluation.numeric.folds.splice(1);
    data.reservoirs.baoshan2.evaluation.numeric.n = 1;
    expect(() => parseStorageEstimation(data)).toThrow();
    const other = fixture();
    other.reservoirs.baoshan2.evaluation.numeric.folds[0].calibration_utc.splice(
      1,
    );
    expect(() => parseStorageEstimation(other)).toThrow();
  });
  it("fails closed when the report differs from the published area or grade", () => {
    const report = parseStorageEstimation(fixture());
    const archive = {
      meta: { validation: { grade: "A" } },
      series: {
        records: report.reservoirs.baoshan2.points.map((p) => ({
          utc: p.utc,
          local: p.local,
          area_km2: { primary: p.area_km2 },
          official: { pct: p.actual_pct },
        })),
      },
    } as NumericalArchive;
    expect(matchingEstimation(report, "baoshan2", archive)).not.toBeNull();
    const area = archive.series.records[0].area_km2.primary;
    archive.series.records[0].area_km2.primary += 1;
    expect(matchingEstimation(report, "baoshan2", archive)).toBeNull();
    archive.series.records[0].area_km2.primary = area;
    archive.meta.validation.grade = "B";
    expect(matchingEstimation(report, "baoshan2", archive)).toBeNull();
  });
});

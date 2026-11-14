import type { NumericalArchive } from "./numerical";
import type {
  ReservoirEstimation,
  StorageEstimationReport,
} from "./storageEstimationTypes";

export function parseStorageEstimation(
  value: unknown,
): StorageEstimationReport {
  const object = (v: unknown) =>
    !!v && typeof v === "object" && !Array.isArray(v);
  const finite = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v);
  const pct = (v: unknown) => finite(v) && v >= 0 && v <= 100;
  const count = (v: unknown) => finite(v) && Number.isInteger(v) && v >= 0;
  const date = (v: unknown) =>
    typeof v === "string" && Number.isFinite(Date.parse(v));
  const require = (condition: unknown) => {
    if (!condition) throw new Error("Invalid or incomplete storage evaluation");
  };
  require(object(value));
  const report = value as StorageEstimationReport;
  require(
    report.schema_version === 1 && report.method === "two_stage_storage_v1",
  );
  require(
    report.evaluation_status === "complete" && report.gate?.passed === true,
  );
  require(
    Array.isArray(report.gate.checks) &&
      report.gate.checks.length > 0 &&
      report.gate.checks.every(
        (check) => typeof check?.name === "string" && check.passed === true,
      ),
  );
  require(
    object(report.definitions) &&
      object(report.reservoirs) &&
      object(report.source),
  );
  require(
    /^[a-f0-9]{40}$/.test(report.source.commit) &&
      Array.isArray(report.source.files),
  );
  for (const [key, result] of Object.entries(report.reservoirs)) {
    require(
      object(result) &&
        result.reservoir === key &&
        ["A", "B", "C"].includes(result.grade),
    );
    require(
      typeof result.eligible === "boolean" && Array.isArray(result.points),
    );
    if (!result.eligible) {
      require(
        typeof result.reason === "string" &&
          result.points.length === 0 &&
          result.evaluation === null,
      );
      continue;
    }
    require(result.grade === "A" && result.reason === null);
    const pool = result.full_pool;
    require(
      pool &&
        count(pool.n) &&
        pool.n >= 3 &&
        Array.isArray(pool.utc_dates) &&
        pool.utc_dates.length === pool.n,
    );
    require(
      pool &&
        [
          pool.mean_area_km2,
          pool.sample_sd_area_km2,
          pool.lower_2sigma_km2,
          pool.lower_3sigma_km2,
        ].every(finite),
    );
    require(
      pool &&
        pool.sample_sd_area_km2 >= 0 &&
        pool.lower_3sigma_km2 <= pool.lower_2sigma_km2,
    );
    require(Array.isArray(result.calibration) && result.calibration.length > 0);
    for (const pair of result.calibration) {
      require(
        date(pair.utc) &&
          date(pair.local) &&
          finite(pair.area_km2) &&
          pct(pair.storage_pct) &&
          typeof pair.anchor === "boolean",
      );
    }
    let previous = "";
    for (const p of result.points) {
      require(
        date(p.utc) && date(p.local) && p.utc > previous && finite(p.area_km2),
      );
      require(
        (p.actual_pct === null || pct(p.actual_pct)) &&
          Array.isArray(p.qa) &&
          p.qa.every((q) => typeof q === "string"),
      );
      require(
        typeof p.extrapolated === "boolean" &&
          typeof p.clamped === "boolean" &&
          typeof p.calibration === "boolean",
      );
      if (p.kind === "high") {
        require(
          p.estimate_pct === null &&
            p.raw_estimate_pct === null &&
            p.range_pct === null &&
            pct(p.high_lower_pct),
        );
        require(
          !p.extrapolated && !p.clamped && p.area_km2 >= pool!.lower_2sigma_km2,
        );
      } else {
        require(
          p.kind === "numeric" &&
            pct(p.estimate_pct) &&
            finite(p.raw_estimate_pct) &&
            p.high_lower_pct === null,
        );
        require(
          p.area_km2 < pool!.lower_2sigma_km2 &&
            Array.isArray(p.range_pct) &&
            p.range_pct.length === 2 &&
            p.range_pct.every(pct),
        );
        require(
          p.range_pct![0] <= p.estimate_pct! &&
            p.range_pct![1] >= p.estimate_pct!,
        );
      }
      previous = p.utc;
    }
    const evaluation = result.evaluation;
    require(
      object(evaluation) &&
        object(evaluation?.high) &&
        object(evaluation?.numeric),
    );
    const { high, numeric } = evaluation!;
    require(
      [
        high.n,
        high.correct_count,
        high.false_high_count,
        high.false_low_count,
      ].every(count) && pct(high.actual_min_pct),
    );
    require(
      high.n === result.points.filter((p) => p.kind === "high").length &&
        high.correct_count + high.false_high_count === high.n,
    );
    require(
      Array.isArray(high.misclassified) &&
        high.misclassified.length ===
          high.false_high_count + high.false_low_count,
    );
    require(
      count(numeric.n) &&
        numeric.n > 0 &&
        finite(numeric.mae_pp) &&
        numeric.mae_pp >= 0 &&
        finite(numeric.max_abs_error_pp) &&
        numeric.max_abs_error_pp >= numeric.mae_pp,
    );
    require(Array.isArray(numeric.folds) && numeric.folds.length === numeric.n);
    const calibrationDates = new Set(
      result.calibration.map((pair) => pair.utc),
    );
    const lowDates = new Set(
      result.calibration.filter((pair) => !pair.anchor).map((pair) => pair.utc),
    );
    const foldDates = new Set(numeric.folds.map((fold) => fold.utc));
    require(
      calibrationDates.size === result.calibration.length &&
        lowDates.size === numeric.n &&
        foldDates.size === numeric.n &&
        [...lowDates].every((utc) => foldDates.has(utc)),
    );
    require(date(result.drawdown?.start_utc) && date(result.drawdown?.end_utc));
    const expectedLowDates = result.points.filter(
      (p) =>
        p.kind === "numeric" &&
        p.actual_pct !== null &&
        p.utc >= result.drawdown.start_utc &&
        p.utc <= result.drawdown.end_utc,
    );
    require(
      expectedLowDates.length === lowDates.size &&
        expectedLowDates.every((p) => lowDates.has(p.utc)),
    );
    for (const fold of numeric.folds) {
      require(
        date(fold.utc) &&
          date(fold.local) &&
          pct(fold.actual_pct) &&
          pct(fold.predicted_pct),
      );
      require(
        finite(fold.raw_predicted_pct) &&
          finite(fold.abs_error_pp) &&
          fold.abs_error_pp >= 0,
      );
      require(
        Array.isArray(fold.calibration_utc) &&
          !fold.calibration_utc.includes(fold.utc),
      );
      require(
        fold.calibration_utc.length === calibrationDates.size - 1 &&
          new Set(fold.calibration_utc).size === fold.calibration_utc.length &&
          fold.calibration_utc.every((utc) => calibrationDates.has(utc)),
      );
    }
    require(
      object(evaluation!.baselines) &&
        Array.isArray(evaluation!.linear_comparison),
    );
    for (const baseline of Object.values(evaluation!.baselines)) {
      require(
        object(baseline) &&
          count(baseline.n) &&
          typeof baseline.cohort === "string",
      );
      require(
        baseline.mae_pp === null ||
          (finite(baseline.mae_pp) && baseline.mae_pp >= 0),
      );
    }
    for (const row of evaluation!.linear_comparison) {
      require(
        count(row.n) &&
          count(row.evaluation_n) &&
          typeof row.available === "boolean",
      );
      if (row.available)
        require(
          [row.mae_pp, row.rmse_pp, row.calibration_mean_mae_pp].every(
            (v) => finite(v) && v >= 0,
          ),
        );
    }
    require(object(result.first_detection));
    for (const detection of [
      result.first_detection.two_sigma,
      result.first_detection.three_sigma,
    ]) {
      require(
        detection === null ||
          (date(detection.utc) &&
            date(detection.local) &&
            pct(detection.storage_pct) &&
            finite(detection.area_km2)),
      );
    }
  }
  return report;
}

export function matchingEstimation(
  report: StorageEstimationReport | null,
  key: string,
  archive: NumericalArchive | null,
): ReservoirEstimation | null {
  const result = report?.reservoirs[key];
  if (!archive || !result || result.grade !== archive.meta.validation.grade)
    return null;
  if (!result.eligible) return result;
  if (result.points.length !== archive.series.records.length) return null;
  const points = new Map(result.points.map((p) => [p.utc, p]));
  return archive.series.records.every((r) => {
    const p = points.get(r.utc);
    return (
      p &&
      p.local === r.local &&
      p.area_km2 === r.area_km2.primary &&
      p.actual_pct === r.official.pct
    );
  })
    ? result
    : null;
}

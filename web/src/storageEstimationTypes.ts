/** Offline DEF-06/07/11/12 report; measured area and published grades stay unchanged. */
export type EstimationMethod = "two-stage" | "linear";
export interface EstimationPoint {
  utc: string;
  local: string;
  area_km2: number;
  actual_pct: number | null;
  qa: string[];
  kind: "high" | "numeric";
  estimate_pct: number | null;
  raw_estimate_pct: number | null;
  high_lower_pct: number | null;
  extrapolated: boolean;
  clamped: boolean;
  range_pct: [number, number] | null;
  calibration: boolean;
}
export interface DetectionPoint {
  utc: string;
  local: string;
  storage_pct: number;
  area_km2: number;
}
export interface EstimationFold {
  utc: string;
  local: string;
  actual_pct: number;
  predicted_pct: number;
  raw_predicted_pct: number;
  abs_error_pp: number;
  extrapolated: boolean;
  clamped: boolean;
  calibration_utc: string[];
}
export interface EstimationBaseline {
  n: number;
  mae_pp: number | null;
  max_abs_error_pp: number | null;
  cohort: string;
}
export interface LinearComparison {
  n: number;
  evaluation_n: number;
  available: boolean;
  mae_pp: number | null;
  rmse_pp: number | null;
  calibration_mean_mae_pp: number | null;
  extrapolated_n: number;
  outside_0_100_n: number;
}
export interface ReservoirEstimation {
  reservoir: string;
  grade: "A" | "B" | "C";
  eligible: boolean;
  reason: string | null;
  full_pool: null | {
    n: number;
    mean_area_km2: number;
    sample_sd_area_km2: number;
    lower_2sigma_km2: number;
    lower_3sigma_km2: number;
    utc_dates: string[];
  };
  drawdown: { start_utc: string; end_utc: string; rule: string };
  calibration: {
    utc: string;
    local: string;
    area_km2: number;
    storage_pct: number;
    anchor: boolean;
  }[];
  points: EstimationPoint[];
  evaluation: null | {
    high: {
      n: number;
      actual_min_pct: number;
      correct_count: number;
      false_high_count: number;
      false_low_count: number;
      misclassified: {
        utc: string;
        local: string;
        actual_pct: number;
        kind: "high" | "numeric";
        qa: string[];
      }[];
    };
    numeric: {
      n: number;
      mae_pp: number;
      max_abs_error_pp: number;
      folds: EstimationFold[];
    };
    baselines: Record<string, EstimationBaseline>;
    linear_comparison: LinearComparison[];
  };
  first_detection: {
    two_sigma: DetectionPoint | null;
    three_sigma: DetectionPoint | null;
  };
  reference_comparison: Record<string, unknown>;
}
export interface StorageEstimationReport {
  schema_version: 1;
  method: "two_stage_storage_v1";
  evaluation_status: "complete";
  gate: { passed: boolean; checks: { name: string; passed: boolean }[] };
  source: {
    commit: string;
    files: { path: string; sha256: string }[];
    advice_sha256: string;
  };
  definitions: Record<string, unknown>;
  reservoirs: Record<string, ReservoirEstimation>;
}

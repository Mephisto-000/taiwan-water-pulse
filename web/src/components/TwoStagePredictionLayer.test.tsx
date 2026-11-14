import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ReservoirEstimation } from "../storageEstimationTypes";
import TwoStagePredictionLayer, {
  canRenderTwoStage,
} from "./TwoStagePredictionLayer";
import AnalysisCharts from "./AnalysisCharts";
import { parseIndex, parseOfficial } from "../domain";
import {
  parseAreaSeries,
  parseNumericMeta,
  type NumericalArchive,
} from "../numerical";
import { fitStoragePrediction } from "../prediction";
import indexData from "../../public/data/index.json";
import officialData from "../../public/data/official/baoshan2.json";
import metaData from "../../public/data/reservoirs/baoshan2/meta.json";
import seriesData from "../../public/data/reservoirs/baoshan2/timeseries.json";

const report: ReservoirEstimation = {
  reservoir: "example",
  grade: "A",
  eligible: true,
  reason: null,
  full_pool: {
    n: 3,
    mean_area_km2: 10,
    sample_sd_area_km2: 1,
    lower_2sigma_km2: 8,
    lower_3sigma_km2: 7,
    utc_dates: ["2026-01-01", "2026-06-01", "2026-06-13"],
  },
  drawdown: { start_utc: "2026-01-01", end_utc: "2026-01-13", rule: "fixture" },
  calibration: [],
  points: [
    {
      utc: "2026-01-01T00:00:00Z",
      local: "2026-01-01T08:00:00+08:00",
      area_km2: 10,
      actual_pct: 95,
      qa: [],
      kind: "high",
      estimate_pct: null,
      raw_estimate_pct: null,
      high_lower_pct: 70,
      extrapolated: false,
      clamped: false,
      range_pct: null,
      calibration: false,
    },
    {
      utc: "2026-01-13T00:00:00Z",
      local: "2026-01-13T08:00:00+08:00",
      area_km2: 6,
      actual_pct: 48,
      qa: ["fixture_quality_flag"],
      kind: "numeric",
      estimate_pct: 44,
      raw_estimate_pct: 44,
      high_lower_pct: null,
      extrapolated: true,
      clamped: false,
      range_pct: [34, 54],
      calibration: true,
    },
    {
      utc: "2026-06-01T00:00:00Z",
      local: "2026-06-01T08:00:00+08:00",
      area_km2: 10,
      actual_pct: 100,
      qa: [],
      kind: "high",
      estimate_pct: null,
      raw_estimate_pct: null,
      high_lower_pct: 70,
      extrapolated: false,
      clamped: false,
      range_pct: null,
      calibration: false,
    },
  ],
  evaluation: {
    high: {
      n: 2,
      actual_min_pct: 70,
      correct_count: 2,
      false_high_count: 0,
      false_low_count: 0,
      misclassified: [],
    },
    numeric: {
      n: 1,
      mae_pp: 10,
      max_abs_error_pp: 10,
      folds: [
        {
          utc: "2026-01-13T00:00:00Z",
          local: "2026-01-13T08:00:00+08:00",
          actual_pct: 48,
          predicted_pct: 38,
          raw_predicted_pct: 38,
          abs_error_pp: 10,
          extrapolated: true,
          clamped: false,
          calibration_utc: [],
        },
      ],
    },
    baselines: {},
    linear_comparison: [],
  },
  first_detection: { two_sigma: null, three_sigma: null },
  reference_comparison: {},
};
const props = {
  report,
  x: (day: string) =>
    50 + (Date.parse(day) - Date.parse("2026-01-01")) / 86400000,
  y: (value: number) => 100 - value,
  left: 50,
  right: 220,
  lang: "zh-TW" as const,
};
const render = (value = report) =>
  renderToStaticMarkup(
    <svg>
      <TwoStagePredictionLayer {...props} report={value} />
    </svg>,
  );

describe("two-stage storage chart", () => {
  it("shows high-water date bands with a range but no point estimate", () => {
    expect(canRenderTwoStage(report)).toBe(true);
    const html = render();
    expect(html.match(/class="storage-high-band"/g)).toHaveLength(2);
    expect(html).toContain("偏高，分不出更細");
    expect(html).toContain("70.0–100.0%");
    expect(html.match(/class="storage-estimate-point"/g)).toHaveLength(1);
    expect(html).not.toContain("95.0%");
    expect(html).not.toContain("prediction-overflow");
    expect(html).not.toContain("<polygon");
  });

  it("draws numeric error bars and distinguishes extrapolation and quality flags", () => {
    const html = render();
    expect(html).toContain('class="storage-estimate-range"');
    expect(html).toContain('y1="66" y2="46"');
    expect(html).toContain("44.0%");
    expect(html).toContain("34.0–54.0%");
    expect(html).toContain("外插");
    expect(html).toContain("校正點");
    expect(html).toContain("品質旗標");
    expect(html).toContain("fixture_quality_flag");
    expect(html).toContain("非信賴區間");
  });

  it("uses date-local short bands instead of filling the long unobserved interval", () => {
    const html = render();
    const bands = [
      ...html.matchAll(
        /class="storage-high-band"[^>]*x="([^"]+)"[^>]*width="([^"]+)"/g,
      ),
    ];
    expect(bands).toHaveLength(2);
    expect(Number(bands[0][1]) + Number(bands[0][2])).toBeLessThan(60);
    expect(Number(bands[1][1])).toBeGreaterThan(195);
    expect(html).not.toContain("<path");
    expect(html).not.toMatch(/NaN|Infinity/);
  });

  it("fails closed for B/C grades and incomplete evaluations", () => {
    for (const grade of ["B", "C"] as const) {
      expect(canRenderTwoStage({ ...report, grade })).toBe(false);
      expect(render({ ...report, grade })).toBe("<svg></svg>");
    }
    for (const value of [
      { ...report, eligible: false },
      { ...report, evaluation: null },
      { ...report, full_pool: { ...report.full_pool!, n: 2 } },
      {
        ...report,
        evaluation: {
          ...report.evaluation!,
          numeric: { ...report.evaluation!.numeric, folds: [] },
        },
      },
    ]) {
      expect(canRenderTwoStage(value)).toBe(false);
      expect(render(value)).toBe("<svg></svg>");
    }
  });

  it("rejects non-finite estimates and high classifications containing a numeric estimate", () => {
    const invalid = structuredClone(report);
    invalid.points[1].estimate_pct = NaN;
    expect(canRenderTwoStage(invalid)).toBe(false);
    expect(render(invalid)).toBe("<svg></svg>");
    invalid.points[1].estimate_pct = 44;
    invalid.points[0].estimate_pct = 95;
    expect(canRenderTwoStage(invalid)).toBe(false);
  });

  it("provides English descriptions with the same quantitative meaning", () => {
    const html = renderToStaticMarkup(
      <svg>
        <TwoStagePredictionLayer {...props} lang="en" />
      </svg>,
    );
    expect(html).toContain("High; finer levels unresolved");
    expect(html).toContain("Extrapolation");
    expect(html).toContain("Calibration point");
    expect(html).toContain("not a confidence interval");
    expect(html).toContain("44.0%");
  });
});

describe("two-stage chart integration", () => {
  const index = parseIndex(indexData);
  const archive: NumericalArchive = {
    meta: parseNumericMeta(metaData),
    series: parseAreaSeries(seriesData, index.dates),
    mask: new Uint8Array(),
    frames: {},
    analysis: { mask: new Uint8Array(), frames: {} },
  };
  const chartProps = {
    archive,
    records: parseOfficial(officialData).records,
    dates: index.dates,
    selected: index.dates[10],
    onSelect: () => {},
    gap: index.gap,
    lang: "zh-TW" as const,
    showArea: true,
    prediction: fitStoragePrediction(archive.series.records, 6),
  };

  it("prefers two-stage bands and keeps the official curve and fixed axis unchanged", () => {
    const off = renderToStaticMarkup(
      <AnalysisCharts {...chartProps} prediction={null} />,
    );
    const on = renderToStaticMarkup(
      <AnalysisCharts {...chartProps} twoStage={report} />,
    );
    expect(on).toContain('class="two-stage-prediction"');
    expect(on).not.toContain('class="prediction-overflow"');
    expect(on).not.toContain('stroke-dasharray="5 4"');
    expect(on).toContain("逐一留出最大絕對誤差");
    expect(on.match(/<path[^>]*stroke="var\(--ink, #18181a\)"[^>]*>/g)).toEqual(
      off.match(/<path[^>]*stroke="var\(--ink, #18181a\)"[^>]*>/g),
    );
    expect(on.match(/<text x="44"[^>]*>[^<]*<\/text>/g)).toEqual(
      off.match(/<text x="44"[^>]*>[^<]*<\/text>/g),
    );
  });

  it("renders neither estimation mode for B and C even when a caller supplies models", () => {
    for (const grade of ["B", "C"] as const) {
      const input = {
        ...archive,
        meta: {
          ...archive.meta,
          validation: { ...archive.meta.validation, grade },
        },
      };
      const html = renderToStaticMarkup(
        <AnalysisCharts {...chartProps} archive={input} twoStage={report} />,
      );
      expect(html).not.toContain('class="two-stage-prediction"');
      expect(html).not.toContain('class="prediction-overflow"');
      expect(html).not.toContain('stroke-dasharray="5 4"');
    }
  });
});

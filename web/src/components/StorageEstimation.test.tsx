import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import reportData from "../../public/data/storage-estimation.json";
import indexData from "../../public/data/index.json";
import metaData from "../../public/data/reservoirs/baoshan2/meta.json";
import seriesData from "../../public/data/reservoirs/baoshan2/timeseries.json";
import feitsuiMeta from "../../public/data/reservoirs/feitsui/meta.json";
import officialData from "../../public/data/official/baoshan2.json";
import { parseIndex, parseOfficial } from "../domain";
import {
  parseAreaSeries,
  parseNumericMeta,
  type NumericalArchive,
} from "../numerical";
import {
  parseStorageEstimation,
  matchingEstimation,
} from "../storageEstimation";
import StorageExplanation from "./StorageExplanation";
import StorageEstimateDetail from "./StorageEstimateDetail";
import TwoStageEvaluation from "./TwoStageEvaluation";
import PredictionSettings from "./PredictionSettings";
import ChartsWorkspace from "./ChartsWorkspace";

const report = parseStorageEstimation(reportData);
const index = parseIndex(indexData);
const archive: NumericalArchive = {
  meta: parseNumericMeta(metaData),
  series: parseAreaSeries(seriesData, index.dates),
  mask: new Uint8Array(),
  frames: {},
  analysis: { mask: new Uint8Array(), frames: {} },
};

describe("two-stage evaluation and explanation", () => {
  it("hides report-derived claims when published inputs no longer match", () => {
    const changed = structuredClone(archive);
    changed.series.records[0].area_km2.primary += 0.1;
    const html = renderToStaticMarkup(
      <ChartsWorkspace
        archive={changed}
        official={parseOfficial(officialData)}
        gaugeError={false}
        onRetry={() => {}}
        reservoirKey="baoshan2"
        dates={index.dates}
        selected={index.dates[0]}
        onSelect={() => {}}
        gap={index.gap}
        lang="zh-TW"
        onReturnToImage={() => {}}
        estimationReport={report}
      />,
    );
    expect(html).toContain("與目前觀測資料不一致");
    expect(html).not.toContain("68.1–71.4%");
    expect(html).not.toContain("63.9–65.7%");
    expect(html).not.toContain("橘色陰影是校正期");
  });
  it("loads the real report and matches every original published point", () => {
    expect(matchingEstimation(report, "baoshan2", archive)).toBe(
      report.reservoirs.baoshan2,
    );
    expect(report.reservoirs.baoshan2.evaluation!.numeric.mae_pp).toBeCloseTo(
      5.17436426849,
      9,
    );
    expect(
      report.reservoirs.liyutan.evaluation!.numeric.max_abs_error_pp,
    ).toBeCloseTo(10.3903621556, 9);
  });
  it("shows no numerical estimate or percent sign in the high-water selected-day card", () => {
    for (const lang of ["zh-TW", "en"] as const) {
      const html = renderToStaticMarkup(
        <StorageEstimateDetail
          point={report.reservoirs.baoshan2.points[0]}
          lang={lang}
        />,
      );
      expect(html).toContain(
        lang === "en" ? "High; finer levels unresolved" : "偏高，分不出更細",
      );
      expect(html).not.toContain("%");
      expect(html).not.toContain("100.0");
    }
  });
  it("distinguishes calibration, extrapolation and descriptive ranges for numeric points", () => {
    const point = report.reservoirs.baoshan2.points.find(
      (p) => p.kind === "numeric",
    )!;
    const html = renderToStaticMarkup(
      <StorageEstimateDetail
        point={{
          ...point,
          extrapolated: true,
          clamped: true,
          raw_estimate_pct: -5,
        }}
        lang="zh-TW"
      />,
    );
    expect(html).toContain("校正點");
    expect(html).toContain("外插");
    expect(html).toContain("非信賴區間");
    expect(html).toContain("原始值");
  });
  it("renders recalculated bilingual claims without turning MAE into a guarantee", () => {
    for (const lang of ["zh-TW", "en"] as const) {
      const html = renderToStaticMarkup(
        <StorageExplanation
          report={report}
          lang={lang}
          onMethods={() => {}}
          onEstimate={() => {}}
          canEstimate
        />,
      );
      for (const value of ["68.1–71.4%", "63.9–65.7%", "4.6", "10.4"])
        expect(html).toContain(value);
      expect(html).toContain(
        lang === "en" ? "not independent validation" : "並非獨立驗證",
      );
    }
    const pending = renderToStaticMarkup(
      <StorageExplanation
        report={null}
        lang="zh-TW"
        onMethods={() => {}}
        onEstimate={() => {}}
        canEstimate={false}
      />,
    );
    expect(pending).not.toContain("4.6");
  });
  it("reports separate categorical and LOO results, actual folds and all predeclared N", () => {
    const html = renderToStaticMarkup(
      <TwoStageEvaluation result={report.reservoirs.baoshan2} lang="zh-TW" />,
    );
    for (const text of [
      "DEF-06",
      "ddof=1",
      "DEF-11",
      "DEF-12",
      "5.2",
      "9.2",
      "2026-07-04",
      "100.0",
      "2026-01-29",
      "2026-02-10",
      "2026-03-18",
      "嚴格相隔 12 天",
      "不能當成獨立",
    ])
      expect(html).toContain(text);
    expect(html.match(/<tr>/g)?.length).toBe(22);
    expect(html).toContain("storage-estimation.json");
  });
  it("lets B/C users read the reason while disabling both estimation modes", () => {
    for (const grade of ["B", "C"]) {
      const html = renderToStaticMarkup(
        <PredictionSettings
          open={false}
          onClose={() => {}}
          lang="zh-TW"
          pairCount={21}
          calibrationCount={6}
          onSampleCountChange={() => {}}
          prediction={null}
          grade={grade}
          method="two-stage"
          estimation={report.reservoirs.feitsui}
        />,
      );
      expect(html).toContain("兩段式與直線校正都不提供估計");
      expect(html).not.toContain("<select");
    }
    const html = renderToStaticMarkup(
      <ChartsWorkspace
        archive={{ ...archive, meta: parseNumericMeta(feitsuiMeta) }}
        official={parseOfficial(officialData)}
        gaugeError={false}
        onRetry={() => {}}
        reservoirKey="feitsui"
        dates={index.dates}
        selected={index.dates[0]}
        onSelect={() => {}}
        gap={index.gap}
        lang="zh-TW"
        onReturnToImage={() => {}}
        estimationReport={report}
      />,
    );
    expect(html).toMatch(/type="checkbox" disabled=""/);
    expect(html).toContain("B 級不做蓄水率估計");
    expect(html).toMatch(
      /class="text-button chart-method-button" aria-haspopup="dialog"/,
    );
  });
  it("defaults the workspace to two-stage and retains first-N as an explicit comparison", () => {
    const html = renderToStaticMarkup(
      <ChartsWorkspace
        archive={archive}
        official={parseOfficial(officialData)}
        gaugeError={false}
        onRetry={() => {}}
        reservoirKey="baoshan2"
        dates={index.dates}
        selected={index.dates[0]}
        onSelect={() => {}}
        gap={index.gap}
        lang="zh-TW"
        onReturnToImage={() => {}}
        estimationReport={report}
      />,
    );
    expect(html).toContain('value="two-stage" selected=""');
    expect(html).toContain("前 N 筆直線校正（對照）");
    expect(html).not.toContain('value="linear" selected=""');
  });
});

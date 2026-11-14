import indexData from "../../public/data/index.json";
import shimenMeta from "../../public/data/reservoirs/shimen/meta.json";
import shimenSeries from "../../public/data/reservoirs/shimen/timeseries.json";
import baoshanMeta from "../../public/data/reservoirs/baoshan2/meta.json";
import baoshanSeries from "../../public/data/reservoirs/baoshan2/timeseries.json";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import WorkspaceInspector from "./WorkspaceInspector";
import ThresholdExperiment from "./ThresholdExperiment";
import { parseIndex } from "../domain";
import {
  parseAreaSeries,
  parseNumericMeta,
  type NumericalArchive,
} from "../numerical";
import { readScientificStats } from "../science";

const index = parseIndex(indexData);
const archiveFor = (key: string): NumericalArchive => ({
  meta: parseNumericMeta(key === "shimen" ? shimenMeta : baoshanMeta),
  series: parseAreaSeries(
    key === "shimen" ? shimenSeries : baoshanSeries,
    index.dates,
  ),
  mask: new Uint8Array(),
  frames: {},
  analysis: { mask: new Uint8Array(), frames: {} },
});

describe("published scientific controls", () => {
  it("shows the selected polarization's QA and one plain-language status", () => {
    const archive = archiveFor("baoshan2");
    const acquisition = index.dates.find(
      (date) => date.utc_date === "2025-11-17",
    )!;
    const props = {
      index,
      reservoirKey: "baoshan2",
      archive,
      official: null,
      acquisition,
      referenceDate: index.dates[0].utc_date,
      lang: "zh-TW" as const,
      summaries: [],
      tab: "day" as const,
      onTabChange: () => {},
    };
    const hh = renderToStaticMarkup(
      <WorkspaceInspector {...props} polarization="HH" />,
    );
    const hv = renderToStaticMarkup(
      <WorkspaceInspector {...props} polarization="HV" />,
    );
    expect(hh).not.toContain('class="inspector-qa"');
    expect(hv).toContain('class="inspector-qa"');
    expect(hv.match(/雷達面積跟得上水位/g)).toHaveLength(1);
  });
  it("does not publish a C-grade area in the day inspector", () => {
    const archive = archiveFor("shimen");
    expect(archive.meta.validation.grade).toBe("C");
    const html = renderToStaticMarkup(
      <WorkspaceInspector
        index={index}
        reservoirKey="shimen"
        archive={archive}
        official={null}
        acquisition={index.dates[10]}
        referenceDate={index.dates[0].utc_date}
        lang="zh-TW"
        summaries={[]}
        tab="day"
        onTabChange={() => {}}
      />,
    );
    expect(html).not.toContain("km²");
    expect(html).toContain("未能分辨");
    expect(
      renderToStaticMarkup(
        <ThresholdExperiment
          archive={archive}
          date={index.dates[10].utc_date}
          lang="zh-TW"
        />,
      ),
    ).toBe("");
  });
  it("waits for native analysis frames instead of showing a zero trial area", () => {
    const archive = archiveFor("baoshan2");
    const html = renderToStaticMarkup(
      <ThresholdExperiment
        archive={archive}
        date={index.dates[10].utc_date}
        lang="zh-TW"
      />,
    );
    expect(html).toContain("正在載入當日原生分析格網");
    expect(html).not.toContain("0.000 km²");
  });
  it("calculates a trial from native pixels without changing published records", () => {
    const archive = archiveFor("baoshan2");
    const date = index.dates[10].utc_date;
    const published = JSON.stringify(archive.series);
    archive.analysis = {
      mask: new Uint8Array([1]),
      frames: { [date]: new Uint8Array([100]) },
    };
    const html = renderToStaticMarkup(
      <ThresholdExperiment archive={archive} date={date} lang="zh-TW" />,
    );
    expect(html).toContain("0.001 km²");
    expect(html).toContain("不會更新發布面積");
    expect(JSON.stringify(archive.series)).toBe(published);
  });
  it("accepts the released review evidence and keeps quantitative checks traceable", () => {
    const archive = archiveFor("baoshan2");
    const science = readScientificStats(archive.series.stats);
    expect(science.effect_size?.passes).toBe(true);
    expect(science.volume_closure?.available).toBe(true);
    expect(
      science.polarization_comparison?.channels.HV.flagged_dates.length,
    ).toBeGreaterThan(0);
    expect(
      science.threshold_sensitivity?.definitions.length,
    ).toBeGreaterThanOrEqual(6);
    const html = renderToStaticMarkup(
      <WorkspaceInspector
        index={index}
        reservoirKey="baoshan2"
        archive={archive}
        official={null}
        acquisition={index.dates[10]}
        referenceDate={index.dates[0].utc_date}
        lang="zh-TW"
        summaries={[
          { key: "baoshan2", meta: archive.meta, series: archive.series },
        ]}
        tab="methods"
        onTabChange={() => {}}
      />,
    );
    expect(html).toContain("水量變化能對得上嗎");
    expect(html).toContain("25.74");
    expect(html).toContain("24.28");
    expect(html).toContain("並非獨立驗證");
    expect(html).not.toContain("Infinity");
  });
});

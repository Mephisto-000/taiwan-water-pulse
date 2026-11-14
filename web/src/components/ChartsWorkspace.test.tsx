import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ChartsWorkspace from "./ChartsWorkspace";
import AnalysisCharts from "./AnalysisCharts";
import PredictionSettings from "./PredictionSettings";
import { datePosition, parseIndex, parseOfficial } from "../domain";
import { parseWeather } from "../weather";
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
import shimenMeta from "../../public/data/reservoirs/shimen/meta.json";
import weatherData from "../../public/data/weather/baoshan2.json";

const index = parseIndex(indexData);
const official = parseOfficial(officialData);
const archive: NumericalArchive = {
  meta: parseNumericMeta(metaData),
  series: parseAreaSeries(seriesData, index.dates),
  mask: new Uint8Array(),
  frames: {},
  analysis: { mask: new Uint8Array(), frames: {} },
};
const chartProps = {
  archive,
  records: official.records,
  dates: index.dates,
  selected: index.dates[10],
  onSelect: () => {},
  gap: index.gap,
  lang: "zh-TW" as const,
  showArea: true,
};
const workspaceProps = {
  archive,
  official,
  gaugeError: false,
  onRetry: () => {},
  reservoirKey: "baoshan2",
  dates: index.dates,
  selected: index.dates[10],
  onSelect: () => {},
  gap: index.gap,
  lang: "zh-TW" as const,
  onReturnToImage: () => {},
};

describe("compact comparable charts", () => {
  it("starts with four unchecked options and separate relationship and prediction dialogs", () => {
    const html = renderToStaticMarkup(<ChartsWorkspace {...workspaceProps} />);
    expect(html.match(/type="checkbox"/g)).toHaveLength(4);
    expect(html).toContain("面積與水位關係圖");
    expect(html).not.toContain('checked=""');
    expect(html).toContain("雷達水面積（km²）");
    expect(html).toContain("官方蓄水率（%）");
    expect(html).not.toContain('class="weather-context"');
    expect(html).not.toContain('class="event-notes"');
    expect(html).not.toContain('class="scatter-plot"');
    expect(html).not.toContain('aria-label="官方水位時間序列"');
    const plot = html.slice(
      html.indexOf('class="chart-stack"'),
      html.indexOf("<dialog"),
    );
    expect(plot).not.toContain("前幾個有效配對用於校正");
    expect(plot).not.toContain("HH 水面積線性校正");
    expect(html).toContain('viewBox="0 0 640 356"');
    expect(html).toContain("<dialog");
    expect(html).toContain('aria-controls="area-level-dialog"');
    expect(html).toContain('id="area-level-dialog" class="scatter-dialog"');
    expect(html).not.toMatch(/<dialog[^>]* open/);
  });
  it("disables C-grade prediction and scatter while keeping the other controls usable", () => {
    const html = renderToStaticMarkup(
      <ChartsWorkspace
        {...workspaceProps}
        archive={{ ...archive, meta: parseNumericMeta(shimenMeta) }}
      />,
    );
    expect(html.match(/type="checkbox" disabled=""/g)).toHaveLength(1);
    expect(html).toContain(
      'disabled="" aria-haspopup="dialog" aria-controls="area-level-dialog"',
    );
    expect(html).not.toContain("雷達水面積（km²）");
    expect(html).toContain("此水庫不提供定量 SAR 面積與預估");
  });
  it("adds a separate metre axis only when water level is requested, retaining missing-value gaps", () => {
    const records = official.records
      .slice(0, 5)
      .map((r, i) => ({ ...r, level_m: i === 2 ? null : r.level_m }));
    const html = renderToStaticMarkup(
      <AnalysisCharts {...chartProps} records={records} showLevel />,
    );
    const panel = html.slice(html.indexOf('aria-label="官方水位時間序列"'));
    expect(panel.match(/<path /g)).toHaveLength(2);
    expect(panel).toContain("官方水位（m）");
    expect(html).toContain('viewBox="0 0 640 512"');
    expect(html).not.toMatch(/NaN|Infinity/);
    const missing = renderToStaticMarkup(
      <AnalysisCharts
        {...chartProps}
        records={official.records.map((r) => ({ ...r, level_m: null }))}
        showLevel
      />,
    );
    expect(missing).toContain("尚無水位觀測");
    expect(missing).not.toMatch(/NaN|Infinity/);
  });
  it("shows the same calibrated predictions without putting settings between plots", () => {
    const prediction = fitStoragePrediction(archive.series.records, 6)!;
    const html = renderToStaticMarkup(
      <AnalysisCharts {...chartProps} prediction={prediction} />,
    );
    expect(html).toContain('stroke-dasharray="5 4"');
    expect(html).toContain("外插");
    expect(html).not.toContain("<fieldset");
    expect(html).not.toMatch(/NaN|Infinity/);
  });
  it("adds rainfall to the same SVG and date scale without moving the existing observations", () => {
    const weather = parseWeather(weatherData, "baoshan2");
    const selectedDate = chartProps.selected.local.slice(0, 10);
    const expectedX =
      54 +
      (datePosition(
        selectedDate,
        official.records[0].local_date,
        official.records.at(-1)!.local_date,
      ) /
        100) *
        (640 - 54 - 18);
    for (const showLevel of [false, true]) {
      for (const showArea of [false, true]) {
        const off = renderToStaticMarkup(
          <AnalysisCharts
            {...chartProps}
            showLevel={showLevel}
            showArea={showArea}
          />,
        );
        const on = renderToStaticMarkup(
          <AnalysisCharts
            {...chartProps}
            showLevel={showLevel}
            showArea={showArea}
            weather={weather}
          />,
        );
        expect(on.match(/<svg /g)).toHaveLength(1);
        expect(on.match(/class="shared-date-axis"/g)).toHaveLength(1);
        expect(on.match(/class="rainfall-bar"/g)).toHaveLength(349);
        expect(on).toContain(
          `class="weather-selected" x1="${expectedX}" x2="${expectedX}"`,
        );
        expect(
          on.match(/<path[^>]*stroke="var\(--ink, #18181a\)"[^>]*>/g),
        ).toEqual(off.match(/<path[^>]*stroke="var\(--ink, #18181a\)"[^>]*>/g));
        expect(on.match(/<circle[^>]*>/g)).toEqual(off.match(/<circle[^>]*>/g));
        const height = (html: string) =>
          Number(html.match(/viewBox="0 0 640 (\d+)"/)![1]);
        expect(height(on) - height(off)).toBe(176);
        expect(on).not.toMatch(/NaN|Infinity/);
      }
    }
  });
  it("keeps the summary on the selected SAR day while inspecting another weather day", () => {
    const weather = parseWeather(weatherData, "baoshan2");
    const day = weather.records.find(
      (row) => row.local_date === chartProps.selected.local.slice(0, 10),
    )!;
    const html = renderToStaticMarkup(
      <AnalysisCharts
        {...chartProps}
        weather={weather}
        weatherInspectionDate={weather.period.start}
      />,
    );
    const summary = html.slice(html.indexOf('<p class="chart-selection"'));
    expect(summary).toContain("測站雨量");
    expect(summary).toContain(`${day.rainfall_mm!.toFixed(1)} mm`);
    expect(html).toContain('stroke-dasharray="3 3"');
  });
  it("keeps official curves, ticks and point coordinates stable with prediction on or off", () => {
    const model = fitStoragePrediction(archive.series.records, 6)!;
    const extremes = {
      ...model,
      points: model.points.map((p, i) => ({
        ...p,
        predicted:
          i === 0 ? 145 : i === model.points.length - 1 ? -25 : p.predicted,
      })),
    };
    const render = (prediction: typeof model | null) =>
      renderToStaticMarkup(
        <AnalysisCharts {...chartProps} prediction={prediction} showLevel />,
      );
    const off = render(null);
    const officialPaths = (html: string) =>
      html.match(/<path[^>]*stroke="var\(--ink, #18181a\)"[^>]*>/g);
    const ticks = (html: string) =>
      html.match(/<text x="44"[^>]*>[^<]*<\/text>/g);
    const points = (html: string) => html.match(/<circle[^>]*>/g);
    for (const prediction of [
      model,
      extremes,
      fitStoragePrediction(archive.series.records, 10)!,
    ]) {
      const on = render(prediction);
      expect(officialPaths(on)).toEqual(officialPaths(off));
      expect(ticks(on)).toEqual(ticks(off));
      expect(points(on)).toEqual(points(off));
    }
  });
  it("marks overflow without changing raw predictions or leaking lines into adjacent panels", () => {
    const model = fitStoragePrediction(archive.series.records, 6)!;
    const prediction = {
      ...model,
      points: model.points
        .slice(0, 3)
        .map((p, i) => ({ ...p, predicted: [145, 50, -25][i] })),
    };
    const before = JSON.stringify(prediction);
    const html = renderToStaticMarkup(
      <AnalysisCharts {...chartProps} prediction={prediction} />,
    );
    expect(html).toContain("<clipPath");
    expect(html).toContain('clip-path="url(#');
    expect(html.match(/class="prediction-overflow"/g)).toHaveLength(2);
    expect(html).toContain("145.0%");
    expect(html).toContain("-25.0%");
    expect(html).toContain("超過 100%");
    expect(html).toContain("低於 0%");
    expect(JSON.stringify(prediction)).toBe(before);
  });
  it("keeps the sample bounds, metrics and calibration limitations in the dialog", () => {
    const html = renderToStaticMarkup(
      <PredictionSettings
        open={false}
        onClose={() => {}}
        lang="zh-TW"
        pairCount={21}
        calibrationCount={6}
        onSampleCountChange={() => {}}
        prediction={fitStoragePrediction(archive.series.records, 6)}
      />,
    );
    expect(html).toContain('value="3"');
    expect(html).toContain('value="18"');
    expect(html).not.toContain('value="19"');
    expect(html).toContain('value="6" selected=""');
    expect(html).toContain("MAE=");
    expect(html).toContain("並非獨立驗證");
  });
});

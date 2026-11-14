import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { parseWeather, rainIcon, rainLabel } from "./weather";
import { WeatherPlot } from "./components/WeatherContext";
import baoshan from "../public/data/weather/baoshan2.json";
import liyutan from "../public/data/weather/liyutan.json";
import shimen from "../public/data/weather/shimen.json";
import feitsui from "../public/data/weather/feitsui.json";
import index from "../public/data/index.json";
import type { Acquisition } from "./domain";

describe("CWA observations", () => {
  it("validates all real archives and their explicit calendar-day coverage", () => {
    for (const data of [baoshan, liyutan, shimen, feitsui]) {
      const series = parseWeather(data, data.reservoir);
      expect(series.records).toHaveLength(349);
      expect(series.records[0].local_date).toBe("2025-11-06");
      expect(series.records.at(-1)!.local_date).toBe("2026-10-20");
    }
    expect(
      parseWeather(shimen, "shimen").records.filter(
        (r) => r.condition === "missing",
      ),
    ).toHaveLength(3);
    expect(
      parseWeather(feitsui, "feitsui").records.filter(
        (r) => r.condition === "missing",
      ),
    ).toHaveLength(5);
  });
  it("rejects wrong-reservoir, negative rain and omitted day records", () => {
    expect(() => parseWeather(baoshan, "shimen")).toThrow();
    const changed = structuredClone(baoshan);
    changed.records[0].rainfall_mm = -1;
    expect(() => parseWeather(changed, "baoshan2")).toThrow();
    const missing = structuredClone(baoshan);
    missing.records.splice(10, 1);
    expect(() => parseWeather(missing, "baoshan2")).toThrow();
  });
  it("never calls zero rain sunny without a sunshine observation", () => {
    const row = {
      ...parseWeather(baoshan, "baoshan2").records[0],
      rainfall_mm: 0,
      rainfall_trace: false,
      condition: "no_measurable_rain" as const,
      sunshine_hours: null,
    };
    expect(rainIcon(row)).toBe("○");
    expect(rainLabel(row, true)).toContain("sky unknown");
    expect(rainIcon({ ...row, sunshine_hours: 2 })).toBe("☀");
    expect(rainIcon(undefined)).toBe("?");
  });
  it("renders daily bars and SAR-day markers without invalid SVG coordinates", () => {
    const series = parseWeather(baoshan, "baoshan2");
    const markup = renderToStaticMarkup(
      <WeatherPlot
        series={series}
        dates={index.dates as Acquisition[]}
        first={series.period.start}
        last={series.period.end}
        selectedDate="2026-03-18"
        onDateChange={() => {}}
        lang="zh-TW"
      />,
    );
    expect(markup).toContain("測站日雨量");
    expect(markup).toContain("2026-03-18");
    expect(markup).not.toMatch(/NaN|Infinity/);
    expect(markup.match(/<rect /g)!.length).toBe(349);
  });
});

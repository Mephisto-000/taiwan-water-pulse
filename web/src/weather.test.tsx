import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { parseWeather, rainIcon, rainLabel } from "./weather";
import WeatherPanel from "./components/WeatherPanel";
import WeatherContext from "./components/WeatherContext";
import baoshan from "../public/data/weather/baoshan2.json";
import liyutan from "../public/data/weather/liyutan.json";
import shimen from "../public/data/weather/shimen.json";
import feitsui from "../public/data/weather/feitsui.json";
import index from "../public/data/index.json";
import { datePosition, type Acquisition } from "./domain";

const series = parseWeather(baoshan, "baoshan2");
const selectedDate = index.dates[10].local.slice(0, 10);
const panelProps = {
  series,
  dates: index.dates as Acquisition[],
  first: series.period.start,
  last: series.period.end,
  top: 32,
  plotHeight: 112,
  selectedDate,
  lang: "zh-TW" as const,
};
const dateX = (width: number) => (day: string) =>
  54 +
  (datePosition(day, series.period.start, series.period.end) / 100) *
    (width - 72);

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
    const markup = renderToStaticMarkup(
      <svg>
        <WeatherPanel {...panelProps} x={dateX(640)} />
      </svg>,
    );
    expect(markup).toContain("氣象署日雨量");
    expect(markup).toContain("2026-03-18");
    expect(markup).not.toMatch(/NaN|Infinity/);
    expect(markup.match(/<rect /g)!.length).toBe(349);
  });
  it("keeps one spaced icon row and the selected day without dropping daily bars", () => {
    for (const width of [280, 360, 640]) {
      const markup = renderToStaticMarkup(
        <svg>
          <WeatherPanel {...panelProps} x={dateX(width)} />
        </svg>,
      );
      const icons = [
        ...markup.matchAll(
          /<text class="weather-icon" x="([^"]+)" y="([^"]+)"[^>]*><title>([^<]+)<\/title>/g,
        ),
      ];
      expect(icons.length).toBeGreaterThan(1);
      expect(new Set(icons.map((icon) => icon[2])).size).toBe(1);
      expect(icons.some((icon) => icon[3].startsWith(selectedDate))).toBe(true);
      for (let i = 1; i < icons.length; i++)
        expect(
          Number(icons[i][1]) - Number(icons[i - 1][1]),
        ).toBeGreaterThanOrEqual(20);
      expect(markup.match(/class="rainfall-bar"/g)).toHaveLength(349);
    }
  });
  it("distinguishes missing and trace days from measured zero rainfall", () => {
    const changed = structuredClone(series);
    changed.records[0] = {
      ...changed.records[0],
      rainfall_mm: 0,
      rainfall_trace: false,
      condition: "no_measurable_rain",
    };
    changed.records[1] = {
      ...changed.records[1],
      rainfall_mm: null,
      rainfall_trace: true,
      condition: "trace",
    };
    changed.records[2] = {
      ...changed.records[2],
      rainfall_mm: null,
      rainfall_trace: false,
      condition: "missing",
    };
    const markup = renderToStaticMarkup(
      <svg>
        <WeatherPanel {...panelProps} series={changed} x={dateX(640)} />
      </svg>,
    );
    expect(markup.match(/class="rainfall-bar"/g)).toHaveLength(347);
    expect(markup.match(/class="rainfall-trace"/g)).toHaveLength(1);
    expect(markup.match(/class="rainfall-missing"/g)).toHaveLength(1);
    expect(markup).toContain(
      `${changed.records[0].local_date}: 未測得雨（晴陰未知） · 0 mm`,
    );
    expect(markup).toContain(`${changed.records[1].local_date}: 雨跡 · —`);
    expect(markup).toContain(`${changed.records[2].local_date}: 缺值 · —`);
  });
  it("collapses daily lookup and station details while preserving error and loading states", () => {
    const props = {
      series,
      error: false,
      onRetry: () => {},
      selectedDate,
      onDateChange: () => {},
      open: false,
      onOpenChange: () => {},
      lang: "zh-TW" as const,
    };
    const markup = renderToStaticMarkup(<WeatherContext {...props} />);
    expect(markup).toContain("<details>");
    expect(markup).not.toContain("<details open");
    expect(markup).not.toContain("<svg");
    expect(markup).toContain('type="date"');
    expect(markup).toContain("CWA CODiS");
    expect(markup).toContain("不是集水區平均雨量");
    const error = renderToStaticMarkup(
      <WeatherContext {...props} series={null} error />,
    );
    expect(error).toContain('role="alert"');
    expect(error).toContain("重新載入氣象資料");
    const loading = renderToStaticMarkup(
      <WeatherContext {...props} series={null} />,
    );
    expect(loading).toContain('role="status"');
    expect(loading).not.toContain("0 mm");
  });
});

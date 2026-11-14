import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { datePosition, parseIndex, parseOfficial } from "../domain";
import { parseEvents } from "../events";
import {
  parseAreaSeries,
  parseNumericMeta,
  type NumericalArchive,
} from "../numerical";
import { parseWeather } from "../weather";
import AnalysisCharts from "./AnalysisCharts";
import EventDialog from "./EventDialog";
import EventTimeline, {
  eventTimelineHeight,
  layoutEventMarkers,
} from "./EventTimeline";
import eventData from "../../public/data/events.json";
import indexData from "../../public/data/index.json";
import officialData from "../../public/data/official/baoshan2.json";
import metaData from "../../public/data/reservoirs/baoshan2/meta.json";
import seriesData from "../../public/data/reservoirs/baoshan2/timeseries.json";
import weatherData from "../../public/data/weather/baoshan2.json";

const events = parseEvents(eventData);
const index = parseIndex(indexData);
const official = parseOfficial(officialData);
const archive: NumericalArchive = {
  meta: parseNumericMeta(metaData),
  series: parseAreaSeries(seriesData, index.dates),
  mask: new Uint8Array(),
  frames: {},
  analysis: { mask: new Uint8Array(), frames: {} },
};
const first = official.records[0].local_date;
const last = official.records.at(-1)!.local_date;
const scale = (width: number) => (date: string) =>
  54 + (datePosition(date, first, last) / 100) * (width - 72);

describe("weather and water events", () => {
  it("rejects invalid calendars, reversed ranges, duplicate IDs and unsafe source links", () => {
    expect(events).toHaveLength(3);
    for (const changes of [
      { start_local_date: "2026-02-30" },
      { end_local_date: "2026-04-01" },
      { sources: [{ url: "javascript:alert(1)", label: "Invalid" }] },
    ]) {
      expect(() =>
        parseEvents({ events: [{ ...events[0], ...changes }] }),
      ).toThrow();
    }
    expect(() => parseEvents({ events: [events[0], events[0]] })).toThrow();
  });

  it("preserves source dates through the SAR gap and separates crowded markers", () => {
    for (const width of [280, 360, 640]) {
      const x = scale(width);
      const markers = layoutEventMarkers(events, first, last, x);
      expect(markers.map((marker) => marker.event.id)).toEqual(
        events.map((event) => event.id),
      );
      expect(
        markers.filter((marker) => marker.event.in_long_radar_gap),
      ).toHaveLength(2);
      for (const marker of markers) {
        expect(marker.center).toBeCloseTo(
          (x(marker.event.start_local_date) + x(marker.event.end_local_date)) /
            2,
        );
        for (const other of markers.filter(
          (other) => other.lane === marker.lane && other.center > marker.center,
        )) {
          expect(
            Math.min(other.start, other.center - 22) -
              Math.max(marker.end, marker.center + 22),
          ).toBeGreaterThanOrEqual(8);
        }
      }
      expect(eventTimelineHeight(markers)).toBeLessThanOrEqual(108);
    }
    const overlapping = layoutEventMarkers(
      [events[0], { ...events[0], id: "second-source-event" }],
      first,
      last,
      scale(640),
    );
    expect(overlapping.map((marker) => marker.lane)).toEqual([0, 1]);
    expect(eventTimelineHeight([])).toBe(0);
  });

  it("clips intersecting periods and excludes events wholly outside the displayed dates", () => {
    const markers = layoutEventMarkers(
      [
        {
          ...events[0],
          id: "overlap-start",
          start_local_date: "2025-01-01",
          end_local_date: first,
        },
        {
          ...events[0],
          id: "overlap-end",
          start_local_date: last,
          end_local_date: "2027-01-01",
        },
        {
          ...events[0],
          id: "before",
          start_local_date: "2024-01-01",
          end_local_date: "2024-01-02",
        },
        {
          ...events[0],
          id: "after",
          start_local_date: "2027-01-01",
          end_local_date: "2027-01-02",
        },
      ],
      first,
      last,
      scale(640),
    );
    expect(markers.map((marker) => marker.event.id)).toEqual([
      "overlap-start",
      "overlap-end",
    ]);
    expect(markers[0].start).toBe(54);
    expect(markers[0].end).toBe(54);
    expect(markers[1].center).toBe(622);
  });

  it("keeps official curves, observation points and the date axis fixed when events are shown", () => {
    for (const showArea of [false, true]) {
      for (const showLevel of [false, true]) {
        for (const weather of [null, parseWeather(weatherData, "baoshan2")]) {
          const render = (withEvents: boolean) =>
            renderToStaticMarkup(
              <AnalysisCharts
                archive={archive}
                records={official.records}
                dates={index.dates}
                selected={index.dates[10]}
                onSelect={() => {}}
                gap={index.gap}
                lang="zh-TW"
                showArea={showArea}
                showLevel={showLevel}
                weather={weather}
                events={withEvents ? events : []}
              />,
            );
          const off = render(false),
            on = render(true);
          const beforeEvents = on.slice(
            0,
            on.indexOf('class="event-timeline"'),
          );
          expect(on.match(/class="event-marker"/g)).toHaveLength(3);
          expect(on.match(/class="shared-date-axis"/g)).toHaveLength(1);
          expect(on.match(/<g class="shared-date-axis">.*?<\/g>/)?.[0]).toEqual(
            off.match(/<g class="shared-date-axis">.*?<\/g>/)?.[0],
          );
          expect(beforeEvents.match(/<path[^>]*>/g)).toEqual(
            off.match(/<path[^>]*>/g),
          );
          expect(beforeEvents.match(/<circle[^>]*>/g)).toEqual(
            off.match(/<circle[^>]*>/g),
          );
          expect(on.match(/class="rainfall-bar"[^>]*>/g)).toEqual(
            off.match(/class="rainfall-bar"[^>]*>/g),
          );
          const height = (html: string) =>
            Number(html.match(/viewBox="0 0 640 (\d+)"/)![1]);
          expect(height(on) - height(off)).toBe(64);
          expect(on).not.toMatch(/NaN|Infinity/);
        }
      }
    }
  });

  it("labels each marker with its dates and title and exposes a keyboard focus target", () => {
    const html = renderToStaticMarkup(
      <svg>
        <EventTimeline
          markers={layoutEventMarkers(events, first, last, scale(640))}
          top={360}
          left={54}
          right={622}
          lang="zh-TW"
        />
      </svg>,
    );
    expect(html.match(/role="button" tabindex="0"/g)).toHaveLength(3);
    expect(html.match(/aria-controls="weather-events-dialog"/g)).toHaveLength(
      3,
    );
    for (const event of events) expect(html).toContain(event.title["zh-TW"]);
  });

  it("shows only the selected event with original sources and the contextual limitation", () => {
    for (const lang of ["en", "zh-TW"] as const) {
      const html = renderToStaticMarkup(
        <EventDialog event={events[0]} onClose={() => {}} lang={lang} />,
      );
      expect(html).toContain(events[0].title[lang]);
      expect(html).toContain(events[0].summary[lang]);
      expect(html).toContain(`href="${events[0].sources[0].url}"`);
      expect(html).toMatch(/<time datetime="2026-04-02"/i);
      expect(html).toContain(
        lang === "en" ? "do not establish the cause" : "並未據此認定",
      );
      expect(html).toContain(
        lang === "en" ? "Within the radar-product gap" : "位於雷達產品缺口期間",
      );
      expect(html).not.toContain(events[1].title[lang]);
      expect(html).not.toMatch(/<dialog[^>]* open/);
    }
    const closed = renderToStaticMarkup(
      <EventDialog event={null} onClose={() => {}} lang="zh-TW" />,
    );
    expect(closed).not.toContain(events[0].title["zh-TW"]);
  });
});

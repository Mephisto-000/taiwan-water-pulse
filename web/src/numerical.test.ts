import { afterEach, describe, expect, it, vi } from "vitest";
import {
  estimateArea,
  parseNumericMeta,
  parseAreaSeries,
  canPublishArea,
  loadNumericalArchive,
  loadNumericalMetadata,
  loadNumericalFrame,
  waitForBackgroundIdle,
  preloadNumericalArchive,
  relativeThresholdDb,
  estimateRelativeArea,
  hasRelativeAnalysis,
} from "./numerical";
import type { Acquisition } from "./domain";

const quantize = (db: number) => Math.round(((db + 35) / 40) * 254) + 1;
describe("relative-power analysis on the native grid", () => {
  it("uses a power ratio rather than multiplying dB values", () => {
    expect(relativeThresholdDb(0.6, -10)).toBeCloseTo(-12.218487496163565, 12);
    expect(relativeThresholdDb(1, -10)).toBe(-10);
    expect(() => relativeThresholdDb(0, -10)).toThrow();
    expect(() => relativeThresholdDb(1.1, -10)).toThrow();
    expect(() => relativeThresholdDb(0.6, NaN)).toThrow();
  });
  it("counts native analysis cells using ratio ±0.1 sensitivity", () => {
    const pixels = new Uint8Array(
      [-16, -12.8, -11.8, -10].map(quantize).concat([0, quantize(-20)]),
    );
    const mask = new Uint8Array([1, 1, 1, 1, 1, 0]);
    expect(estimateRelativeArea(pixels, mask, 0.6, -10, 900)).toEqual({
      area: 0.0018,
      low: 0.0009,
      high: 0.0027,
    });
    expect(estimateRelativeArea(pixels, mask, 0.6, -10, 28_900).area).toBe(
      0.0578,
    );
    expect(() =>
      estimateRelativeArea(pixels, new Uint8Array(2), 0.6, -10, 900),
    ).toThrow();
  });
  it("preserves monotonicity and handles a zero lower sensitivity bound", () => {
    const pixels = new Uint8Array([-30, -20, -12, -10].map(quantize));
    const mask = new Uint8Array(4).fill(1);
    let previous = 0;
    for (const ratio of [0.05, 0.1, 0.2, 0.5, 0.6, 0.7, 0.9, 1]) {
      const estimate = estimateRelativeArea(pixels, mask, ratio, -10, 900);
      expect(estimate.area).toBeGreaterThanOrEqual(previous);
      expect(estimate.low).toBeLessThanOrEqual(estimate.area);
      expect(estimate.high).toBeGreaterThanOrEqual(estimate.area);
      previous = estimate.area;
    }
    expect(estimateRelativeArea(pixels, mask, 0.05, -10, 900).low).toBe(0);
  });
});
describe("interactive HH classification", () => {
  it("uses one fixed HH mask for area and symmetric threshold sensitivity", () => {
    const pixels = new Uint8Array([
      quantize(-24),
      quantize(-18),
      quantize(-12),
      0,
      quantize(-28),
    ]);
    const mask = new Uint8Array([1, 1, 1, 1, 0]);
    const estimate = estimateArea(pixels, mask, -17, 100);
    expect(estimate.area).toBe(0.0002);
    expect(estimate.low).toBe(0.0001);
    expect(estimate.high).toBe(0.0002);
  });
  it("increases area monotonically when the threshold is relaxed", () => {
    const pixels = new Uint8Array(
      Array.from({ length: 50 }, (_, i) => quantize(-30 + i * 0.4)),
    );
    const mask = new Uint8Array(50).fill(1);
    let previous = 0;
    for (let threshold = -30; threshold <= -8; threshold += 0.5) {
      const next = estimateArea(pixels, mask, threshold, 100);
      expect(next.low).toBeLessThanOrEqual(next.area);
      expect(next.area).toBeLessThanOrEqual(next.high);
      expect(next.area).toBeGreaterThanOrEqual(previous);
      previous = next.area;
    }
  });
  it("rejects corrupted grids and nonfinite area inputs", () => {
    expect(() =>
      estimateArea(new Uint8Array(2), new Uint8Array(1), -18, 100),
    ).toThrow();
    expect(() =>
      estimateArea(new Uint8Array([1]), new Uint8Array([2]), -18, 100),
    ).toThrow();
    expect(() =>
      estimateArea(new Uint8Array(2), new Uint8Array(2), NaN, 100),
    ).toThrow();
  });
});

const date: Acquisition = {
  utc: "2026-03-17T21:16:41Z",
  local: "2026-03-18T05:16:41+08:00",
  utc_date: "2026-03-17",
  granule: "test-granule",
  browse: { HH: "browse/20260317_HH.png", HV: "browse/20260317_HV.png" },
  available: { HH: true, HV: true },
};
const summary = {
  n: 1,
  pearson_area_vs_level: null,
  spearman_area_vs_level: null,
  pearson_ci95: null,
  spearman_ci95: null,
};
const validation = {
  ...summary,
  grade: "C",
  publish_area: false,
  reason: "Insufficient paired observations",
  method: "pooled_otsu_v2",
  bootstrap_repetitions: 2000,
  below_95: summary,
  physical_checks: {
    passed: false,
    osm_area_km2: 1.4,
    full_storage_max_area_km2: 1.2,
    full_storage_within_1_1_osm: true,
    lowest_observed_utc: date.utc,
    full_reference_utc: date.utc,
    lowest_area_smaller_than_full: false,
    matched_level_tolerance_m: 0.5,
    matched_level_pairs: [],
  },
};
const meta = {
  grid: {
    width: 2,
    height: 2,
    bounds: [0, 0, 20, 20],
    bounds_wgs84: [120, 24, 121, 25],
    pixel_side_m: 10,
    epsg: 3857,
  },
  pixel_area_m2: 100,
  classification_channel: "HH",
  thresholds: { HH: -18, HV: -21 },
  outline_pixel_rings: [
    [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 0],
    ],
  ],
  overview: {
    source_width: 100,
    source_height: 100,
    crop_pixels: [20, 20, 5, 5],
  },
  validation,
};
const series = {
  records: [
    {
      utc: date.utc,
      local: date.local,
      granule: date.granule,
      area_km2: {
        hh: 0.0001,
        hh_lo: 0,
        hh_hi: 0.0002,
        hv: 0.0001,
        hv_lo: 0,
        hv_hi: 0.0002,
        primary: 0.0001,
        primary_lo: 0,
        primary_hi: 0.0002,
      },
      valid_fraction: 0.75,
      qa: [],
      official: { local: date.local, pct: 28.2, level_m: 130.81 },
    },
  ],
  stats: {
    ...validation,
    classification_channel: "HH",
    spearman_area_hh_vs_level: null,
    pearson_area_hh_vs_level: null,
  },
};
const analysis = {
  grid: {
    width: 1,
    height: 2,
    bounds: [0, 0, 30, 60],
    bounds_wgs84: [120, 24, 121, 25],
    pixel_side_m: 30,
    epsg: 32651,
  },
  pixel_area_m2: 900,
  threshold_ratio: 0.6,
  sensitivity_ratios: [0.5, 0.7],
  land_median_db_by_date: { [date.utc_date]: -10 },
  mask: "analysis/mask.bin",
  outline_pixel_rings: [
    [
      [0, 0],
      [1, 0],
      [1, 2],
      [0, 0],
    ],
  ],
  display_transform: [1, 0, 0, 0, 1, 0],
};
const relativeMeta = {
  ...meta,
  analysis,
  validation: { ...validation, method: "relative_power_v3" },
};
const relativeSeries = {
  ...series,
  records: [
    {
      ...series.records[0],
      threshold_db: relativeThresholdDb(0.6, -10),
      land_median_db: -10,
      threshold_ratio: 0.6,
    },
  ],
  stats: { ...series.stats, method: "relative_power_v3" },
};

describe("graded publication contracts", () => {
  it("enforces the reviewed signal-to-sensitivity and positive B confidence gates", () => {
    const review = {
      ...validation,
      n: 3,
      review_version: "2026-11-14-v2",
      pearson_area_vs_level: 0.9,
      pearson_ci95: [0.7, 0.99],
      effect_size: {
        n: 3,
        area_range_km2: 0.1,
        mean_sensitivity_width_km2: 0.1,
        range_to_sensitivity_ratio: 1,
        minimum_ratio: 2,
        passes: false,
        level_range_m: 10,
      },
    };
    expect(() =>
      parseNumericMeta({ ...meta, validation: { ...review, grade: "A" } }),
    ).toThrow("sensitivity");
    expect(() =>
      parseNumericMeta({
        ...meta,
        validation: {
          ...review,
          grade: "B",
          pearson_area_vs_level: 0.6,
          pearson_ci95: [-0.1, 0.8],
        },
      }),
    ).toThrow("positive");
    expect(
      parseNumericMeta({
        ...meta,
        validation: {
          ...review,
          grade: "B",
          pearson_area_vs_level: 0.6,
          pearson_ci95: [0.01, 0.8],
        },
      }).validation.grade,
    ).toBe("B");
    expect(() =>
      parseNumericMeta({
        ...meta,
        display_ranges_db: { HH: [-2, -18], HV: [-21, -6] },
      }),
    ).toThrow("display-only");
  });
  it("accepts a C-grade image archive without publishing water area", () => {
    const archive = {
      meta: parseNumericMeta(meta),
      series: parseAreaSeries(series, [date]),
      mask: new Uint8Array(4),
      frames: {},
    };
    expect(archive.meta.validation?.grade).toBe("C");
    expect(canPublishArea(archive)).toBe(false);
    const valid = {
      ...validation,
      grade: "A",
      publish_area: true,
      n: 3,
      pearson_area_vs_level: 0.9,
      pearson_ci95: [0.7, 0.99],
      physical_checks: {
        ...validation.physical_checks,
        passed: true,
        lowest_area_smaller_than_full: true,
      },
    };
    const dates = [15, 16, 17].map((day) => ({
      ...date,
      utc_date: `2026-03-${day}`,
      utc: `2026-03-${day}T21:16:41Z`,
      local: `2026-03-${day + 1}T05:16:41+08:00`,
      granule: `test-granule-${day}`,
    }));
    const a = {
      ...archive,
      meta: parseNumericMeta({ ...meta, validation: valid }),
      series: parseAreaSeries(
        {
          ...series,
          records: dates.map((item) => ({
            ...series.records[0],
            utc: item.utc,
            local: item.local,
            granule: item.granule,
          })),
          stats: { ...series.stats, ...valid },
        },
        dates,
      ),
    };
    expect(canPublishArea(a)).toBe(true);
    expect(canPublishArea({ ...a, series: archive.series })).toBe(false);
    expect(canPublishArea(null)).toBe(false);
  });
  it("rejects malformed C-grade publication, confidence intervals, and OSM rings", () => {
    expect(() =>
      parseNumericMeta({
        ...meta,
        validation: { ...validation, publish_area: true },
      }),
    ).toThrow();
    expect(() =>
      parseNumericMeta({
        ...meta,
        validation: { ...validation, pearson_ci95: [0.8, 0.2] },
      }),
    ).toThrow();
    expect(() =>
      parseNumericMeta({
        ...meta,
        outline_pixel_rings: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
          ],
        ],
      }),
    ).toThrow();
    expect(() =>
      parseNumericMeta({
        ...meta,
        overview: { ...meta.overview, crop_pixels: [99, 0, 5, 5] },
      }),
    ).toThrow();
  });
  it("rejects an inverted HV sensitivity range and mismatched local date", () => {
    const record = series.records[0];
    expect(() =>
      parseAreaSeries(
        {
          ...series,
          records: [{ ...record, area_km2: { ...record.area_km2, hv_lo: 4 } }],
        },
        [date],
      ),
    ).toThrow();
    expect(() =>
      parseAreaSeries(
        {
          ...series,
          records: [{ ...record, local: "2026-03-19T05:16:41+08:00" }],
        },
        [date],
      ),
    ).toThrow();
  });
  it("accepts missing-channel shoreline contrast and rejects nonfinite values", () => {
    const withContrast = {
      ...series,
      records: [
        {
          ...series.records[0],
          separation: { HH: 1.2, HV: null },
          separation_samples: {
            HH: { inside: 3, ring: 8 },
            HV: { inside: 0, ring: 0 },
          },
        },
      ],
    };
    expect(
      parseAreaSeries(withContrast, [date]).records[0].separation?.HV,
    ).toBeNull();
    expect(() =>
      parseAreaSeries(
        {
          ...withContrast,
          records: [
            {
              ...withContrast.records[0],
              separation: { HH: Infinity, HV: null },
            },
          ],
        },
        [date],
      ),
    ).toThrow();
  });
});

describe("validated binary archive loading", () => {
  afterEach(() => vi.unstubAllGlobals());
  const fixtureFetch = (overrides: Record<string, unknown> = {}) =>
    vi.fn(async (input: string) => {
      const name = input.split("/").at(-1)!;
      const relative = input.split("/").slice(4).join("/");
      const payload =
        overrides[relative] ??
        overrides[name] ??
        (name === "meta.json"
          ? meta
          : name === "timeseries.json"
            ? series
            : name === "mask.bin"
              ? new Uint8Array([1, 1, 1, 0])
              : new Uint8Array([1, 22, 0, 255]));
      return new Response(
        payload instanceof Uint8Array
          ? new Uint8Array(payload).buffer
          : JSON.stringify(payload),
      );
    });
  it("exposes validated metadata before fetching images and loads HV only on request", async () => {
    const fetch = fixtureFetch();
    vi.stubGlobal("fetch", fetch);
    const archive = await loadNumericalMetadata(
      "progressivetest",
      [date],
      new AbortController().signal,
    );
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(archive.frames).toEqual({});
    await loadNumericalFrame(
      "progressivetest",
      archive,
      date.utc_date,
      "HH",
      new AbortController().signal,
    );
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(archive.frames[date.utc_date]?.HH).toHaveLength(4);
    expect(archive.frames[date.utc_date]?.HV).toBeUndefined();
    expect(fetch.mock.calls.some(([path]) => path.endsWith("_HV.bin"))).toBe(
      false,
    );
    await loadNumericalFrame(
      "progressivetest",
      archive,
      date.utc_date,
      "HH",
      new AbortController().signal,
    );
    expect(fetch).toHaveBeenCalledTimes(4);
    await loadNumericalFrame(
      "progressivetest",
      archive,
      date.utc_date,
      "HV",
      new AbortController().signal,
    );
    expect(fetch).toHaveBeenCalledTimes(5);
  });
  it("retains a valid channel after another channel fails and permits a scoped retry", async () => {
    vi.stubGlobal(
      "fetch",
      fixtureFetch({ "20260317_HV.bin": new Uint8Array([1]) }),
    );
    const archive = await loadNumericalMetadata(
      "retrytest",
      [date],
      new AbortController().signal,
    );
    await loadNumericalFrame(
      "retrytest",
      archive,
      date.utc_date,
      "HH",
      new AbortController().signal,
    );
    const hh = archive.frames[date.utc_date]?.HH;
    await expect(
      loadNumericalFrame(
        "retrytest",
        archive,
        date.utc_date,
        "HV",
        new AbortController().signal,
      ),
    ).rejects.toThrow("grid size");
    expect(archive.frames[date.utc_date]?.HH).toBe(hh);
    expect(archive.frames[date.utc_date]?.HV).toBeUndefined();
    vi.stubGlobal("fetch", fixtureFetch());
    await loadNumericalFrame(
      "retrytest",
      archive,
      date.utc_date,
      "HV",
      new AbortController().signal,
    );
    expect(archive.frames[date.utc_date]?.HV).toHaveLength(4);
    await expect(
      loadNumericalFrame(
        "retrytest",
        archive,
        "2026-04-10",
        "HH",
        new AbortController().signal,
      ),
    ).rejects.toThrow("selection");
  });
  it("loads calibrated C-grade HH/HV imagery after validating exact binary dimensions", async () => {
    const fetch = fixtureFetch();
    vi.stubGlobal("fetch", fetch);
    const archive = await loadNumericalArchive(
      "baoshan2",
      [date],
      new AbortController().signal,
    );
    expect(archive.frames[date.utc_date].HH).toEqual(
      new Uint8Array([1, 22, 0, 255]),
    );
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(canPublishArea(archive)).toBe(false);
  });
  it("loads distinct display and native analysis grids without substituting their masks", async () => {
    const fetch = fixtureFetch({
      "meta.json": relativeMeta,
      "timeseries.json": relativeSeries,
      "analysis/mask.bin": new Uint8Array([1, 0]),
      "analysis/20260317_HH.bin": new Uint8Array([
        quantize(-16),
        quantize(-10),
      ]),
    });
    vi.stubGlobal("fetch", fetch);
    const archive = await loadNumericalArchive(
      "nativegridtest",
      [date],
      new AbortController().signal,
    );
    expect(hasRelativeAnalysis(archive)).toBe(true);
    expect(archive.mask.length).toBe(4);
    expect(archive.analysis?.mask).toEqual(new Uint8Array([1, 0]));
    expect(archive.analysis?.frames[date.utc_date]).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(7);
  });
  it("rejects relative methods without analysis metadata and mismatched image references", async () => {
    expect(() =>
      parseNumericMeta({ ...relativeMeta, analysis: undefined }),
    ).toThrow("analysis grid");
    expect(() =>
      parseNumericMeta({
        ...relativeMeta,
        analysis: { ...analysis, grid: { ...analysis.grid, epsg: 3857 } },
      }),
    ).toThrow("UTM");
    vi.stubGlobal(
      "fetch",
      fixtureFetch({
        "meta.json": relativeMeta,
        "timeseries.json": {
          ...relativeSeries,
          records: [
            {
              ...relativeSeries.records[0],
              land_median_db: -12,
              threshold_db: relativeThresholdDb(0.6, -12),
            },
          ],
        },
      }),
    );
    await expect(
      loadNumericalArchive(
        "badreference",
        [date],
        new AbortController().signal,
      ),
    ).rejects.toThrow("references");
  });
  it("reuses a fully validated preloaded tour stop without fetching its frames again", async () => {
    const fetch = fixtureFetch();
    vi.stubGlobal("fetch", fetch);
    const archive = await preloadNumericalArchive(
      "preloadtest",
      [date],
      new AbortController().signal,
    );
    expect(
      await preloadNumericalArchive(
        "preloadtest",
        [date],
        new AbortController().signal,
      ),
    ).toBe(archive);
    expect(fetch).toHaveBeenCalledTimes(5);
    const aborted = new AbortController();
    aborted.abort();
    await expect(
      preloadNumericalArchive("preloadtest", [date], aborted.signal),
    ).rejects.toThrow("Aborted");
  });
  it("rejects corrupted mask or channel bytes rather than showing a partial archive", async () => {
    vi.stubGlobal(
      "fetch",
      fixtureFetch({ "mask.bin": new Uint8Array([2, 1, 1, 0]) }),
    );
    await expect(
      loadNumericalArchive("baoshan2", [date], new AbortController().signal),
    ).rejects.toThrow("mask");
    vi.stubGlobal(
      "fetch",
      fixtureFetch({ "20260317_HH.bin": new Uint8Array([1]) }),
    );
    await expect(
      loadNumericalArchive("baoshan2", [date], new AbortController().signal),
    ).rejects.toThrow("grid size");
  });
  it("rejects path injection and a mismatched publication assessment", async () => {
    await expect(
      loadNumericalArchive("../private", [date], new AbortController().signal),
    ).rejects.toThrow("selection");
    vi.stubGlobal(
      "fetch",
      fixtureFetch({
        "timeseries.json": {
          ...series,
          stats: { ...series.stats, grade: "B", publish_area: false },
        },
      }),
    );
    await expect(
      loadNumericalArchive("baoshan2", [date], new AbortController().signal),
    ).rejects.toThrow("assessment");
  });
});

describe("numerical asset boundary validation", () => {
  const validMeta = {
    grid: {
      width: 2,
      height: 2,
      bounds: [0, 0, 20, 20],
      bounds_wgs84: [120, 24, 121, 25],
      pixel_side_m: 10,
      epsg: 3857,
    },
    pixel_area_m2: 100,
    classification_channel: "HH",
    thresholds: { HH: -18, HV: -21 },
  };
  it("rejects zero/negative pixel area before it can reach rendering", () => {
    expect(() =>
      parseNumericMeta({ ...validMeta, pixel_area_m2: 0 }),
    ).toThrow();
    expect(() =>
      parseNumericMeta({ ...validMeta, pixel_area_m2: -1 }),
    ).toThrow();
    expect(
      parseNumericMeta({
        ...validMeta,
        validation,
        outline_pixel_rings: meta.outline_pixel_rings,
        overview: meta.overview,
      }).pixel_area_m2,
    ).toBe(100);
  });
  it("rejects malformed area records and correlation statistics", () => {
    expect(() =>
      parseAreaSeries({ records: [{ area_km2: null }], stats: { n: 1 } }, []),
    ).toThrow();
    expect(() =>
      parseAreaSeries(
        {
          records: [],
          stats: {
            n: 0,
            spearman_area_hh_vs_level: 2,
            pearson_area_hh_vs_level: null,
          },
        },
        [],
      ),
    ).toThrow();
  });
});

describe("cancellable background image scheduling", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("waits for idle time before permitting optional image work", async () => {
    let idleCallback: (() => void) | undefined;
    const requestIdleCallback = vi.fn((callback: () => void) => {
      idleCallback = callback;
      return 7;
    });
    vi.stubGlobal("window", {
      requestIdleCallback,
      cancelIdleCallback: vi.fn(),
      clearTimeout: vi.fn(),
    });
    const controller = new AbortController();
    const ready = waitForBackgroundIdle(controller.signal);
    expect(requestIdleCallback).toHaveBeenCalledOnce();
    idleCallback!();
    await expect(ready).resolves.toBe(true);
  });
  it("cancels the queued idle callback when changing reservoir or date", async () => {
    const cancelIdleCallback = vi.fn();
    vi.stubGlobal("window", {
      requestIdleCallback: vi.fn(() => 12),
      cancelIdleCallback,
      clearTimeout: vi.fn(),
    });
    const controller = new AbortController();
    const ready = waitForBackgroundIdle(controller.signal);
    controller.abort();
    await expect(ready).resolves.toBe(false);
    expect(cancelIdleCallback).toHaveBeenCalledWith(12);
    await expect(waitForBackgroundIdle(controller.signal)).resolves.toBe(false);
  });
});

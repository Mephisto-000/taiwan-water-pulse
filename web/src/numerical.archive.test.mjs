import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it, vi } from "vitest";
import { parseIndex } from "./domain";
import {
  canPublishArea,
  estimateArea,
  estimateRelativeArea,
  hasRelativeAnalysis,
  loadNumericalArchive,
} from "./numerical";

const publicRoot = new URL("../public/", import.meta.url);
const index = parseIndex(
  JSON.parse(readFileSync(new URL("data/index.json", publicRoot), "utf8")),
);

afterEach(() => vi.unstubAllGlobals());

it.runIf(Boolean(index.image_reservoirs?.length))(
  "loads the released fixed grids and agrees with Python area calculations",
  async () => {
    vi.stubGlobal("fetch", async (path) => {
      const relative = path.replace(/^\//, "");
      if (!relative.startsWith("data/") || relative.includes(".."))
        throw new Error("Unexpected public data request.");
      const bytes = readFileSync(fileURLToPath(new URL(relative, publicRoot)));
      return new Response(new Uint8Array(bytes).buffer);
    });
    for (const key of index.image_reservoirs ?? []) {
      const archive = await loadNumericalArchive(
        key,
        index.dates,
        new AbortController().signal,
      );
      expect(canPublishArea(archive)).toBe(
        index.numeric_reservoirs?.includes(key) === true,
      );
      for (const record of archive.series.records) {
        const date = record.utc.slice(0, 10);
        const estimate = hasRelativeAnalysis(archive)
          ? estimateRelativeArea(
              archive.analysis.frames[date],
              archive.analysis.mask,
              archive.meta.analysis.threshold_ratio,
              archive.meta.analysis.land_median_db_by_date[date],
              archive.meta.analysis.pixel_area_m2,
            )
          : estimateArea(
              archive.frames[date][archive.meta.classification_channel],
              archive.mask,
              archive.meta.thresholds[archive.meta.classification_channel],
              archive.meta.pixel_area_m2,
            );
        expect(estimate.area).toBeCloseTo(record.area_km2.primary, 9);
        expect(estimate.low).toBeCloseTo(record.area_km2.primary_lo, 9);
        expect(estimate.high).toBeCloseTo(record.area_km2.primary_hi, 9);
      }
    }
  },
);

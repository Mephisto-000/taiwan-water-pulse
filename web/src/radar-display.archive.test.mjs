import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  classifyWaterMask,
  traceWaterBoundaries,
  transformBoundary,
} from "./radar-display";
import { relativeThresholdDb } from "./numerical";
const root = new URL("../public/data/reservoirs/", import.meta.url);
const bytes = (path) => new Uint8Array(readFileSync(new URL(path, root)));
const signedArea = (ring) =>
  ring
    .slice(0, -1)
    .reduce(
      (sum, point, i) =>
        sum + point[0] * ring[i + 1][1] - ring[i + 1][0] * point[1],
      0,
    ) / 2;
it("traces actual reservoir analysis boundaries on full, low and recovered dates", () => {
  for (const reservoir of ["baoshan2", "liyutan", "shimen", "feitsui"]) {
    const meta = JSON.parse(
      readFileSync(new URL(`${reservoir}/meta.json`, root), "utf8"),
    );
    const analysis = meta.analysis;
    const mask = bytes(`${reservoir}/analysis/mask.bin`);
    for (const date of ["2025-11-05", "2026-03-17", "2026-06-21"]) {
      const pixels = bytes(
        `${reservoir}/analysis/${date.replaceAll("-", "")}_HH.bin`,
      );
      const water = classifyWaterMask(
        pixels,
        mask,
        relativeThresholdDb(
          analysis.threshold_ratio,
          analysis.land_median_db_by_date[date],
        ),
      );
      const rings = traceWaterBoundaries(
        water,
        analysis.grid.width,
        analysis.grid.height,
      );
      expect(rings.length).toBeGreaterThan(0);
      expect(
        rings.every(
          (ring) =>
            ring.length <= 2000 &&
            JSON.stringify(ring[0]) === JSON.stringify(ring.at(-1)),
        ),
      ).toBe(true);
      const area = rings.reduce((sum, ring) => sum + signedArea(ring), 0);
      const cells = water.reduce((sum, value) => sum + value, 0);
      // Simplification affects only presentation; it must preserve its measured extent.
      expect(Math.abs(area - cells) / cells).toBeLessThan(0.015);
      expect(
        rings
          .flatMap((ring) =>
            transformBoundary(ring, analysis.display_transform),
          )
          .every((point) => point.every(Number.isFinite)),
      ).toBe(true);
    }
  }
});

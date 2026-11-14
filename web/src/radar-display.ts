import { decodeDb, type Polarization } from "./domain";

export const DISPLAY_RANGES: Record<Polarization, readonly [number, number]> = {
  HH: [-18, -2],
  HV: [-21, -6],
};
export function displayGray(
  value: number,
  polarization: Polarization,
  range: readonly [number, number] = DISPLAY_RANGES[polarization],
): number | null {
  const db = decodeDb(value);
  if (db === null) return null;
  const [min, max] = range;
  return Math.round(Math.max(0, Math.min(1, (db - min) / (max - min))) * 255);
}
export function classifyWaterMask(
  pixels: Uint8Array,
  mask: Uint8Array,
  thresholdDb: number,
): Uint8Array {
  if (pixels.length !== mask.length || !Number.isFinite(thresholdDb))
    throw new Error("Invalid water classification input.");
  return Uint8Array.from(pixels, (value, index) =>
    mask[index] === 1 && value !== 0 && decodeDb(value)! < thresholdDb ? 1 : 0,
  );
}
type Point = [number, number];
type Edge = { end: Point; direction: number };
const key = (point: Point) => `${point[0]},${point[1]}`;
function simplify(points: Point[], tolerance: number): Point[] {
  if (points.length <= 4) return points;
  const keep = new Set([0, points.length - 1]);
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    const a = points[first],
      b = points[last];
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const length = dx * dx + dy * dy;
    let farthest = -1,
      maxDistance = tolerance * tolerance;
    for (let i = first + 1; i < last; i++) {
      const p = points[i];
      const t = length
        ? Math.max(
            0,
            Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length),
          )
        : 0;
      const distance =
        (p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2;
      if (distance > maxDistance) {
        maxDistance = distance;
        farthest = i;
      }
    }
    if (farthest >= 0) {
      keep.add(farthest);
      stack.push([first, farthest], [farthest, last]);
    }
  }
  return points.filter((_, index) => keep.has(index));
}
/** Trace actual classified pixel edges, retaining holes and separate components. */
export function traceWaterBoundaries(
  mask: Uint8Array,
  width: number,
  height: number,
): Point[][] {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    mask.length !== width * height ||
    mask.some((value) => value > 1)
  )
    throw new Error("Invalid boundary raster.");
  const edges = new Map<string, Edge[]>();
  const add = (start: Point, end: Point, direction: number) => {
    const id = key(start);
    edges.set(id, [...(edges.get(id) ?? []), { end, direction }]);
  };
  const water = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (!water(x, y)) continue;
      if (!water(x, y - 1)) add([x, y], [x + 1, y], 0);
      if (!water(x + 1, y)) add([x + 1, y], [x + 1, y + 1], 1);
      if (!water(x, y + 1)) add([x + 1, y + 1], [x, y + 1], 2);
      if (!water(x - 1, y)) add([x, y + 1], [x, y], 3);
    }
  const rings: Point[][] = [];
  while (edges.size) {
    const startKey = edges.keys().next().value!;
    const start = startKey.split(",").map(Number) as Point;
    const points: Point[] = [start];
    let current = start,
      previousDirection: number | null = null;
    while (true) {
      const id = key(current),
        candidates = edges.get(id);
      if (!candidates?.length) throw new Error("Unclosed water boundary.");
      let chosen = 0;
      if (previousDirection !== null && candidates.length > 1) {
        const order = [1, 0, 3, 2];
        chosen = candidates.reduce(
          (best, edge, index) =>
            order.indexOf((edge.direction - previousDirection! + 4) % 4) <
            order.indexOf(
              (candidates[best].direction - previousDirection! + 4) % 4,
            )
              ? index
              : best,
          0,
        );
      }
      const edge = candidates.splice(chosen, 1)[0];
      if (!candidates.length) edges.delete(id);
      current = edge.end;
      previousDirection = edge.direction;
      points.push(current);
      if (key(current) === startKey) break;
    }
    let tolerance = 0.05;
    let ring = simplify(points, tolerance);
    while (ring.length > 2000) {
      tolerance *= 2;
      ring = simplify(points, tolerance);
    }
    if (ring.length >= 4) rings.push(ring);
  }
  return rings;
}
export function transformBoundary(
  ring: Point[],
  transform: readonly [number, number, number, number, number, number],
): Point[] {
  const [a, b, c, d, e, f] = transform;
  return ring.map(([x, y]) => [a * x + c * y + e, b * x + d * y + f]);
}

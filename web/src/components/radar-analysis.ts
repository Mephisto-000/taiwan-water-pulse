import { decodeDb } from "../domain";

export interface FrequencyResult {
  frequency: Float32Array;
  low: Float32Array;
  high: Float32Array;
  validCounts: Uint32Array;
  observationCount: number;
}

/** Count candidate-water occurrences, excluding missing pixels from the denominator. */
export function candidateFrequency(
  frames: Uint8Array[],
  mask: Uint8Array,
  thresholds: { nominal: number; low: number; high: number }[],
): FrequencyResult {
  if (
    !frames.length ||
    !mask.length ||
    thresholds.length !== frames.length ||
    frames.some((frame) => frame.length !== mask.length)
  )
    throw new Error("Frequency frames must share a non-empty analysis grid.");
  if (
    thresholds.some(
      ({ nominal, low, high }) =>
        ![nominal, low, high].every(Number.isFinite) ||
        low > nominal ||
        nominal > high,
    ) ||
    mask.some((value) => value !== 0 && value !== 1)
  )
    throw new Error("Invalid frequency threshold or analysis mask.");
  const validCounts = new Uint32Array(mask.length);
  const counts = new Uint32Array(mask.length);
  const lowCounts = new Uint32Array(mask.length);
  const highCounts = new Uint32Array(mask.length);
  const lookup = Array.from({ length: 256 }, (_, value) => decodeDb(value));
  for (const [index, frame] of frames.entries()) {
    const threshold = thresholds[index];
    for (let i = 0; i < frame.length; i++) {
      if (!mask[i] || frame[i] === 0) continue;
      const db = lookup[frame[i]]!;
      validCounts[i]++;
      if (db < threshold.nominal) counts[i]++;
      if (db < threshold.low) lowCounts[i]++;
      if (db < threshold.high) highCounts[i]++;
    }
  }
  const frequency = new Float32Array(mask.length).fill(NaN);
  const low = new Float32Array(mask.length).fill(NaN);
  const high = new Float32Array(mask.length).fill(NaN);
  for (let i = 0; i < mask.length; i++) {
    if (!validCounts[i]) continue;
    frequency[i] = counts[i] / validCounts[i];
    low[i] = lowCounts[i] / validCounts[i];
    high[i] = highCounts[i] / validCounts[i];
  }
  return { frequency, low, high, validCounts, observationCount: frames.length };
}

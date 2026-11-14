import { useEffect, useState } from "react";
import { loadJson } from "../domain";
import { parseStorageEstimation } from "../storageEstimation";
import type { StorageEstimationReport } from "../storageEstimationTypes";

/** One shared report for the chart and selected-day panel; errors disable estimates. */
export function useStorageEstimation() {
  const [report, setReport] = useState<StorageEstimationReport | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setReport(null);
    setError(false);
    void loadJson(
      "storage-estimation.json",
      parseStorageEstimation,
      controller.signal,
    )
      .then((value) => {
        if (!controller.signal.aborted) setReport(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [attempt]);
  return { report, error, retry: () => setAttempt((n) => n + 1) };
}

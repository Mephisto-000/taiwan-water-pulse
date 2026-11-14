import { useEffect, useState } from "react";
import { dataUrl } from "../domain";
import { parseWeather, type WeatherSeries } from "../weather";

export function useWeather(reservoirKey: string, enabled: boolean) {
  const [result, setResult] = useState<{
    key: string;
    series: WeatherSeries | null;
    error: boolean;
  }>({ key: reservoirKey, series: null, error: false });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setResult({ key: reservoirKey, series: null, error: false });
    void fetch(dataUrl(`weather/${reservoirKey}.json`), {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("Weather unavailable");
        return response.json() as Promise<unknown>;
      })
      .then((data) => {
        const series = parseWeather(data, reservoirKey);
        if (!controller.signal.aborted)
          setResult({ key: reservoirKey, series, error: false });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setResult({ key: reservoirKey, series: null, error: true });
      });
    return () => controller.abort();
  }, [reservoirKey, enabled, attempt]);
  const current = enabled && result.key === reservoirKey;
  return {
    series: current ? result.series : null,
    error: current && result.error,
    retry: () => setAttempt((n) => n + 1),
  };
}

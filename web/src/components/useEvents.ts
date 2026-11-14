import { useEffect, useState } from "react";
import { dataUrl } from "../domain";
import { parseEvents, type ContextEvent } from "../events";

export function useEvents(enabled: boolean) {
  const [events, setEvents] = useState<ContextEvent[] | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setEvents(null);
    setError(false);
    void fetch(dataUrl("events.json"), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Events unavailable");
        return response.json() as Promise<unknown>;
      })
      .then(parseEvents)
      .then((records) => {
        if (!controller.signal.aborted) setEvents(records);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [enabled, attempt]);
  return {
    events: enabled ? events : null,
    error: enabled && error,
    retry: () => setAttempt((n) => n + 1),
  };
}

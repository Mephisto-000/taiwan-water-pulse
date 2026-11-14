import { useEffect, useRef, useState } from "react";
import type { Reservoir } from "../domain";
import type { Map as MapLibreMap, GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

export default function Locator({ reservoir }: { reservoir: Reservoir }) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const bounds = reservoir.bbox;
  const latestBounds = useRef(bounds);
  latestBounds.current = bounds;
  useEffect(() => {
    let cancelled = false;
    void import("maplibre-gl")
      .then(({ Map, NavigationControl, ScaleControl, setWorkerUrl }) => {
        if (cancelled || !element.current) return;
        try {
          setWorkerUrl(workerUrl);
          const view = new Map({
            container: element.current,
            style: {
              version: 8,
              sources: {
                osm: {
                  type: "raster",
                  tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
                  tileSize: 256,
                  attribution: "© OpenStreetMap contributors",
                },
              },
              layers: [
                {
                  id: "osm",
                  type: "raster",
                  source: "osm",
                  paint: { "raster-saturation": -0.9, "raster-opacity": 0.8 },
                },
              ],
            },
            center: [
              (latestBounds.current[2] + latestBounds.current[3]) / 2,
              (latestBounds.current[0] + latestBounds.current[1]) / 2,
            ],
            zoom: 10,
            attributionControl: { compact: true },
          });
          map.current = view;
          view.addControl(
            new NavigationControl({ showCompass: false }),
            "top-right",
          );
          view.addControl(
            new ScaleControl({ maxWidth: 65, unit: "metric" }),
            "bottom-left",
          );
          let errors = 0;
          view.on("error", () => {
            if (++errors > 2) setUnavailable(true);
          });
          view.on("load", () => {
            if (cancelled) return;
            const bounds = latestBounds.current;
            view.jumpTo({
              center: [
                (bounds[2] + bounds[3]) / 2,
                (bounds[0] + bounds[1]) / 2,
              ],
            });
            view.addSource("selection", {
              type: "geojson",
              data: {
                type: "Feature",
                properties: {},
                geometry: {
                  type: "Point",
                  coordinates: [
                    (bounds[2] + bounds[3]) / 2,
                    (bounds[0] + bounds[1]) / 2,
                  ],
                },
              },
            });
            view.addLayer({
              id: "selection",
              type: "circle",
              source: "selection",
              paint: {
                "circle-radius": 7,
                "circle-color": "#1d6972",
                "circle-stroke-width": 3,
                "circle-stroke-color": "#ffffff",
              },
            });
          });
        } catch {
          setUnavailable(true);
        }
      })
      .catch(() => setUnavailable(true));
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // The map instance persists; selection changes are handled below.
  }, []);
  useEffect(() => {
    const view = map.current;
    if (!view) return;
    const center: [number, number] = [
      (bounds[2] + bounds[3]) / 2,
      (bounds[0] + bounds[1]) / 2,
    ];
    view.flyTo({ center, zoom: 10, duration: 900 });
    const source = view.getSource("selection") as GeoJSONSource | undefined;
    if (source)
      source.setData({
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: center },
      });
  }, [bounds]);
  return (
    <div className="locator-shell">
      <div
        ref={element}
        className="locator"
        aria-label={`Reservoir locator: ${reservoir.name}`}
      />
      {unavailable && (
        <div className="map-fallback">
          <span>Base map unavailable</span>
          <strong>
            {((bounds[0] + bounds[1]) / 2).toFixed(4)}° N<br />
            {((bounds[2] + bounds[3]) / 2).toFixed(4)}° E
          </strong>
          <small>The radar archive remains available.</small>
        </div>
      )}
      <span className="locator-caption">
        LOCATION ONLY · NOT A RADAR OVERLAY
      </span>
    </div>
  );
}

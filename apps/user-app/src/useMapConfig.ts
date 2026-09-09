import { useEffect, useState } from "react";
import { MAP_CONFIG_FALLBACK, mapConfig, type MapConfig } from "./api";

/**
 * v2.2.0: resolves the server-driven map provider once per app session.
 *
 * Starts on the safe OSM fallback so a map ALWAYS renders on first paint, then
 * swaps to whatever the server says (Google when a browser key is configured).
 * `mapConfig()` memoises the request, so mounting this on several screens costs
 * exactly one network call.
 */
export function useMapConfig(): MapConfig {
  const [cfg, setCfg] = useState<MapConfig>(MAP_CONFIG_FALLBACK);

  useEffect(() => {
    let alive = true;
    mapConfig().then((c) => {
      if (alive) setCfg(c);
    });
    return () => {
      alive = false;
    };
  }, []);

  return cfg;
}

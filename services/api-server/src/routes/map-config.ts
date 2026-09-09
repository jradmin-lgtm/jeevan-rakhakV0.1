import type { FastifyInstance } from "fastify";
import { config } from "@jr/config";

/**
 * v2.2.0 — server-driven map rendering config.
 *
 * WHY THIS EXISTS: until now every map surface hardcoded its own tile URL
 * (CartoDB Voyager) in five separate places, two of which are compiled into
 * the APKs on users' phones. On 2026-09-09 CARTO started stamping
 * "API KEY REQUIRED" across anonymous basemap tiles, which broke the live map
 * on every surface at once and could only be fixed by rebuilding and
 * redistributing both apps. Worse, CARTO serves the watermarked tile as a
 * normal HTTP 200 PNG, so no error handler anywhere could detect it: the map
 * failed silently and looked fine to every piece of code.
 *
 * Routing that through the server means the next provider change is an env var
 * and a redeploy, not four APKs and a redistribution cycle.
 *
 * PUBLIC (no auth), same reasoning as /api/v1/service-area: the address picker
 * renders a map before a token exists.
 */
export async function registerMapConfigRoutes(app: FastifyInstance) {
  app.get("/api/v1/map-config", async (_req: unknown, reply: any) => {
    const browserKey = config.maps.google.browserKey;

    // Fail SAFE, not silent. This is an ambulance app: a blank map on a live
    // ride is a real operational failure, so a missing/blank Google key
    // degrades to free OSM raster tiles rather than rendering nothing.
    // Deliberately NOT CartoDB: that is the provider that just broke.
    const provider = browserKey ? "google" : "osm";

    // Clients cache this; keep it short so a provider swap propagates within
    // minutes of the redeploy instead of hours.
    reply.header("Cache-Control", "public, max-age=300");

    return reply.send({
      provider,
      // Only ever the browser-scoped key. The server-side
      // config.maps.google.apiKey (Directions / Distance Matrix / Places) must
      // never leave the server.
      googleBrowserKey: browserKey,
      tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      tileAttribution: "© OpenStreetMap contributors"
    });
  });
}

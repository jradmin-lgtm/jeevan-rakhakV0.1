/**
 * Places search proxy (2026-08-17) — keeps the Google Maps API key
 * server-side always; the mobile app never sees it (Places Autocomplete +
 * Details would otherwise need the raw key embedded in the APK). Gated by
 * FLAG_GOOGLE_PLACES_ENABLED (default off); returns `available:false` when
 * off or on any Google-side failure so the client falls back to its
 * existing free Nominatim search — this must never break address search.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "@jr/config";
import { getPlaceDetails, getPlacesAutocomplete } from "../google-maps";

const autocompleteSchema = z.object({
  input: z.string().min(1).max(200),
  sessionToken: z.string().min(1).max(100)
});

const detailsSchema = z.object({
  placeId: z.string().min(1).max(300),
  sessionToken: z.string().min(1).max(100)
});

export async function registerPlacesRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/places/autocomplete",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      if (!config.googlePlacesEnabled) return reply.send({ available: false, predictions: [] });
      const parsed = autocompleteSchema.safeParse(req.query);
      if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });

      const predictions = await getPlacesAutocomplete(parsed.data.input, parsed.data.sessionToken);
      if (predictions == null) return reply.send({ available: false, predictions: [] });
      return reply.send({ available: true, predictions });
    }
  );

  app.get(
    "/api/v1/places/details",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      if (!config.googlePlacesEnabled) return reply.send({ available: false });
      const parsed = detailsSchema.safeParse(req.query);
      if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });

      const details = await getPlaceDetails(parsed.data.placeId, parsed.data.sessionToken);
      if (!details) return reply.send({ available: false });
      return reply.send({ available: true, ...details });
    }
  );
}

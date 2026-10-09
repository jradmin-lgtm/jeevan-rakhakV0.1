# Rural offline maps beyond 20 km from SRMS

Proposal prepared 9 October 2026. No map-provider purchase or downloadable-map migration has been made.

## Launch behaviour already authorised

The active ride, pickup landmark, last location and an OSRM road route are saved on the phone. Signal loss keeps those details available. New driver GPS fixes retain their capture time, queue locally and upload when connectivity returns. The screen labels saved routes and stale positions. Booking acceptance, pickup confirmation and completion still need a server acknowledgement; the app must never pretend these succeeded offline.

Map tiles are a separate resource. A saved route line does not guarantee that the background map remains available. Android's existing HTTP tile cache may help, but the release must work with the road line, labels and contacts even when tiles are absent. Full offline tile packs are outside the approved launch scope.

## Zone definition

Use distance from the existing SRMS centre, latitude 28.481270 and longitude 79.443282, verified in packages/config/src/index.ts. The rural zone starts beyond 20 km as requested. This is a download suggestion boundary, not a booking restriction. Backend coverage remains 1,000 km.

For a future downloadable-map release, suggest preparation before the phone leaves connectivity, for example at 18 km on an active trip whose route crosses the 20 km boundary. Keep the suggestion dismissed until that ride changes. Use a corridor around the actual route and destination, rather than attempting to download the entire 1,000 km service area. Exact corridor width and zoom levels need field-size measurements first.

## Options and recommendation

| Option | Offline behaviour | Effect on this release |
|---|---|---|
| Current saved ride and route | Ride details and route geometry survive restart; background tiles are not guaranteed | Approved and implemented locally; final airplane-mode APK test pending |
| Native Google Maps SDK | Better native map interaction; app-controlled regional offline packs are not part of this proposal | Separate renderer approval and restricted Android keys are pending |
| MapLibre with a provider or self-hosted tiles licensed for offline use | Explicit downloadable regional packs, progress, storage limits and deletion | Recommended direction if complete offline basemaps become mandatory; requires provider terms, pricing and Android integration review |
| Mapbox offline regions | Provider-managed offline support with its own billing and tile-pack limits | Alternative to price and test; no new account or purchase authorised |

Standard tile.openstreetmap.org must not be used for bulk downloads or offline prefetch. MapLibre is a renderer, not a free tile-service entitlement. Mapbox currently documents a 750 tile-pack limit; practical storage cost depends on the area, style and zoom range. Google Places and Directions display/caching rules must be respected when choosing the renderer and offline data source.

## Acceptance for a later full offline release

1. Show area, estimated size, provider, expiry and available storage before downloading. Offer Wi-Fi-only preparation and cancellation.
2. Keep downloads resumable and check integrity. Never label an incomplete pack ready. Retain the last valid pack until a replacement passes validation.
3. Test process death, reboot, radio loss, storage exhaustion, permission revocation and account changes on Android 11 and a newer Android release.
4. Keep live ETA clearly separate from a saved estimate. Reconcile queued GPS without duplicate points or timestamp rewrites.
5. Measure the chosen route corridor on representative rural journeys before setting a storage cap. Provide delete controls and an expiry policy.
6. Keep a rollback path to the current online renderer and saved-ride mode. Do not change booking coverage or fare calculation as part of the map change.

## Current limits

The launch build cannot book or dispatch an ambulance without connectivity. It can preserve an already active ride and prepare its location history for reconnect. Free hosting can also delay reconnection while servers wake. These limits remain visible in release readiness and scalability ratings.

## Primary references

- OSM tile usage and offline restrictions: https://operations.osmfoundation.org/policies/tiles/
- MapLibre offline manager: https://maplibre.org/maplibre-react-native/docs/modules/offline-manager/
- Mapbox offline regions: https://docs.mapbox.com/android/maps/examples/android-view/offline-map/
- Google Places policies: https://developers.google.com/maps/documentation/places/web-service/policies
- Google Directions policies: https://developers.google.com/maps/documentation/directions/policies
- Google Android SDK billing: https://developers.google.com/maps/documentation/android-sdk/usage-and-billing

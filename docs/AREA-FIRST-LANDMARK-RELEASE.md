# Area-first pickup suggestions

Approved and prepared 10 October 2026, IST. Publication is confirmed separately by the live deployment evidence.

The existing landmarks endpoint now offers up to five distinct area, village or neighbourhood names extracted from Google's structured reverse-geocoding response. It omits matching district/country names and postal-only summaries. Named subareas take priority over city localities. Nearby address positions bound suggestions to 2 km; displayed distances refer to those returned address positions, not area boundaries.

If no suitable area exists, the existing nearby-place lookup ranks recognisable places using review count discounted by distance. Star rating alone does not determine familiarity. Only the short name is saved. Manual text, exact pickup coordinates, existing ride landmarks and the API response shape remain compatible with APK 2.2.1 build 55. No APK or signing change.

## Verification before publication

- 19 targeted tests pass, including real public SRMS and Bareilly provider fixtures, malformed/empty data, broad-label exclusion, duplicate filtering, provider failure/retry, language isolation and concurrent requests.
- 50 distinct authenticated users at 50 distinct local pickup coordinates, real Google responses in English and Hindi: 50/50 succeeded, p95 847 ms. This was an isolated local API, not a production capacity certification.
- 11 landmark integration checks and 31 booking/SOS/hospital integration checks pass against isolated PostgreSQL.
- Selecting the real Bhoji Pura suggestion saves that exact label on a booking with unchanged GPS.
- Android 11 emulator, existing 2.2.1 QA client: suggestions displayed, Bhoji Pura selected, saved summary observed. An initial emulator network failure was resolved with a cold start. No physical-handset claim.
- Workspace typecheck: 10 tasks pass. Configured supplied/loud gate: 2/2 pass.
- Changed-file credential scan and diff whitespace/punctuation checks pass. Existing Maps key exposure decision is unchanged.
- No new timers, migrations, event types or notification changes. Existing request timeouts and bounded caches remain in use.

Four-point pre-commit audit: changed-file secret scan PASS; endpoint-to-client selection and booking wiring PASS; typecheck and regression PASS; no new timers/process/socket lifecycle PASS.

Review: 94/100 (correctness 38, completeness 20, craft 18, verification 8, rules 10). Edge coverage: empty/null, boundary, concurrency, failure, malformed, scale and permission exercised. Physical Infinix and background push/audio are outside this server-only change and remain unverified.

Sources: [Google geocoding components](https://developers.google.com/maps/documentation/geocoding/requests-geocoding) and [Nearby Search fields](https://developers.google.com/maps/documentation/places/web-service/legacy/search-nearby).

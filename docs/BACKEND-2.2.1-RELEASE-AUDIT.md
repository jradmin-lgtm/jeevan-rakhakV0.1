# Backend 2.2.1 release audit

Scope: API and realtime services only. User and driver APKs and portal UI remain at their existing published release. No database migration, billing change, key rotation or signing change.

## Four-point audit

1. Security-leak check: PASS for 27 release files against configured private values and credential signatures. No new secret material. Existing public renderer/backend Maps-key reuse remains a separate high risk and is not claimed resolved.
2. Full wiring: PASS in isolated candidate flows. Authenticated nearby-place endpoint returns up to five choices or explicit 503; candidate user selection persists pickupLandmark through normal booking and SOS into driver summaries and events. Old clients may omit the new field. Ended rides return no current driver position or live ETA geometry. Active rides retain position.
3. No-regression: PASS. Final Node 24.21.0 API image and realtime container passed release, GPS batch, business, support, startup, access, admin bookings, admin drivers, admin users and observability suites. Access suite includes 26 checks. Workspace typecheck and existing 31 targeted unit checks pass. Two 30-minute local 50-ride soaks passed. Node 24 capped-container no-build repeat: 12,100 successful HTTP requests, 6,000 GPS deliveries, no cross-ride leakage, duplicate offline rows or reconnect failures, API p95 1,212.4 ms. Concurrent-build run p95 3,842 ms is retained, not discarded.
4. Cleanup: PASS. Existing Google request timeout clears in finally. Nearby lookup cache is bounded at 256 entries with 60-second expiry and failed lookup eviction; no new periodic timer or socket subscription. Ride completion regression frees driver state.

## Scope and remaining gates

The supplied/loud build seams pass. Other seams are not configured; this is not an all-seam pass. No hosted 50-ride load, 50 real Google renderer sessions or physical Infinix check is claimed. The APK signing-key and Google-key restriction decisions remain open. Residual dependency findings are documented separately, not suppressed. No broad public-launch sign-off.

Backend scope review: 89/100, correctness 37/40, completeness 17/20, craft 18/20, verification 8/10, rule adherence 9/10. This score authorizes the scoped backend changes only, not the entire v1 launch.

Seven edge classes exercised: empty and malformed landmarks in unit tests; distance and result-count boundaries; concurrent requests and accept/lifecycle tests; explicit provider failure/retry and startup failures; malformed coordinates and stale GPS; 50-ride scale; wrong-role, disabled-account, HTTP and socket access isolation. Hosted cold-start availability remains unverified.

Deployment state: prepared, not yet deployed. Verify the exact served commit and retained free plans after deployment. Do not update APK download pointers as part of this release.

Recorded 10 October 2026, 03:55 AM IST

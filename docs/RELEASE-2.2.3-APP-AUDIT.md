# 2.2.3 release: four-point audit

11 October 2026, IST. Scope: six user-app and four driver-app feedback requests, related GPS/dispatch defects, and named click tracking. Candidate passed both independent councils. Live verification is recorded separately.

## 1. Security

Exact production APK scans found no configured private credential values or scanned private-key/token signatures. Signing certificate matches the existing release, preserving replacement-install compatibility. Production endpoints, no debug or cleartext traffic, version/runtime 2.2.3 build57, and four native architectures verified. The public renderer Maps key remains the accepted shared-key risk. Existing signing-key history remains an accepted compatibility risk.

Analytics accepts authenticated, allowlisted action names only. Strict shape, role restrictions, batch limits, rate limits, duplicate IDs, 30-day retention and account-delete cleanup are implemented. It records no typed text, coordinates, phone or medical attributes. GPS backfill authorisation is bounded by historical assignment and release timestamps.

## 2. Controls and integration

Derived source inventory: 403 controls across 205 files, zero missing-handler findings. This is source wiring evidence, not proof every control was exercised. Native review covers home, SOS, four request cards including explicit Breathing/Cardiac choice, pickup/drop maps, area/custom landmark, fare/coupon, driver availability, offer acceptance, arrival, OTP, navigation handoff, completion, payment and rating. Native permission-return, accessible OTP, cold-start large-text popup and accepted-trip overlay checks passed. The independent UI report records the screenshots.

Normal bookings now use persisted nearest-driver waves. Acceptance requires a current offer and a free eligible driver. Assignment audit is committed in the same transaction. Rejections, restart timing, redispatch epochs and concurrent stop/delivery have explicit guards. Expiry uses the dispatch clock and allows the complete wave window.

## 3. Regression evidence

47 unit tests passed. Targeted integration20/20 and lifecycle regression31/31 passed on isolated local services. Ten workspace typechecks passed. Build gate supplied/loud2/2 passed. All new diff lines pass whitespace and no-em-dash checks.

50 active rides,100socketconnections,608 seconds:12100/12100HTTP200;6000/6000GPS received; zero cross-ride deliveries, duplicates or connection errors. HTTPp95=1757.6ms; GPSdeliveryp95=260ms.25 reconnects passed.1000offlinepoints flushed in2006ms.

50 distinct real Google route requests with50persistent clients:50/50ETA,mapconfiguration and landmarks succeeded in2048ms. An unbounded150fresh-TCP-connection harness hit local connection resets; that harness is not claimed as passing.50normalbooking creates with realGoogle ranking:50 offers to50 distinctdrivers and50accepts succeeded in5595ms. Tests ran locally and do not establish production free-host cold-start capacity or50physical-device rendering.

## 4. Scope and release hygiene

Only selected source, tests, native version files and release documentation enter the release commit. Backups, secrets, generated APKs and unrelated main-checkout changes are excluded. No new dependency or paid-plan change. Additive migration is transactional and startup-fatal on failure. Existing rows are backfilled from the dispatch-cycle history. Backend must be verified live before APK publication. Stable QR remains /qr redirecting to /download-apk.

Before APK publication, an API rollback can use the previous commit while retaining additive columns. Once new APKs are installed, prefer a forward fix: the previous API does not guarantee the new historical GPS retention contract.

## Limits

Physical Infinix and other vendor-specific background restrictions remain unverified. Emulator Maps app handoff was observed; its outdated installed Maps version blocked full external turn-by-turn validation. Live FCM delivery and silent-mode audibility on physical phones were not run in this pass. These are not marked fixed by source or emulator evidence. Free-host sleeping, sharedMapskey exposure and legacy signing remain accepted risks.

## Independent council

Backend council SHIP 89/100. UI council SHIP 87/100, visual quality 8/10. Source hashes match both reviewed sets. This is release approval for testing, not publication evidence.

Final exact-APK verification: both 2.2.3/build57 artifacts pass signature, runtime, four-architecture, production-endpoint and known-private-secret checks. Android11 replacement installs from56to57 retained a private file marker. Android15 replacement installs reached login. Original Android15 system-app ANR events were retained separately; repeated final startup captures were clear. Authenticated production-session migration and physical Infinix remain unverified.

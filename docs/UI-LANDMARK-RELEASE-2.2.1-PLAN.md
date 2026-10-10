# Jeevan Rakshak 2.2.1 release plan

Requested 10 October 2026. The released 2.2.0 APKs remain available. This is new work, not a completed release.

## Required changes

1. Keep the existing theme while simplifying user and driver flows. Inspect official Uber and Rapido journeys where installation and account access permit. Label inaccessible journeys as unverified.
2. Present up to five nearby pickup landmarks or named areas. Offer manual entry, explicit confirmation, and clear the choice when the pickup changes.
3. Persist the confirmed landmark for driver requests, active rides and offline recovery. Never replace the user's confirmed text with an automated result.
4. Exercise booking, SOS, pickup, navigation, assessment and completion with the updated UI.
5. Test 50 simultaneous users and 50 active rides in an isolated environment, including provider maps, room isolation, stale GPS, reconnect and recovery. Report local results separately from production capacity.
6. Review vulnerabilities and scan APKs, endpoints, logs and committed files for secrets. The latest no-exposed-secrets request supersedes the earlier approval to publish the existing server Maps key. A Google renderer key is public by design and requires separate restrictions. Resolve account access or obtain the user's review of a provider change before release.
7. Build signed upgrade APKs, run required regressions, deploy the tested code and verify actual QR downloads against tested hashes.

## Review artifacts

The comparison board inventories 63 registered screens, portal routes and selected states. It currently holds 48 screenshots and 16 paired entries, including separately labelled historical evidence. Some pairs show different ride states. Missing captures and controls not yet exercised remain explicitly unverified. The board is a review aid, not complete page-by-page acceptance.

## Release safeguards

No paid hosting change. Backend coverage remains 1,000 km and user copy 100 km. Shared ops login retained. Downloadable regional tile packs remain a separate proposal. Physical Infinix and OEM audible alerts require a device test. No production load test or real emergency booking for QA.


## Current verification, 10 October 2026, 03:44 AM IST

- Version 2.2.0 remains live. No 2.2.1 commit, push, deployment or APK upload has occurred.
- Both 2.2.1 code 55 production candidates were built and signature/architecture/endpoints checked. The user candidate now needs rebuilding for the completed-ride correction.
- Android 11 code 55 driver startup, incoming landmark, OTP keypad dismissal, native pickup, return from Google Maps and native completion passed. The final OTP repeat used an API-prepared arrival fixture; earlier acceptance/arrival were exercised natively.
- A completed-ride privacy regression reproduced current driver location in an old booking response. Candidate API now excludes position and ETA outside active ride states. All 26 access checks pass.
- Full source inventory: 400 controls across 200 files, no missing-handler or syntax findings. This does not mean 400 interactions passed.
- Two 30-minute 50-ride soaks passed. Node 24 constrained run passed correctness but HTTP p95 was 3.84 seconds during Android builds. The no-build comparison is running.
- Shared public Maps/server key and tracked legacy signing-key migration remain unresolved major release decisions. No new paid service is authorised.
- Browser pointer clicks and viewport changes are not taking effect; read-only navigation, screenshots and select fields work. Complete portal interaction sign-off remains blocked.
- Android 11 focus-event ANR was captured at 3:10 AM. Later interaction succeeded; root cause and physical Infinix behaviour remain unverified.


## Superseding status, 10 October 2026, 06:19 AM IST

- Backend API and realtime are live at c968ea517405f9472b5c83db7b2d4887821215f2. Exact health commit, ended-ride privacy and landmarks passed live verification. 29 live checks passed; one unrelated-hospital probe lacked an eligible fixture and remains unverified live.
- Portal security-only deployment is underway against the same commit. The first attempt redeployed the prior commit; that attempt did not apply the patch. Current deployment metadata now names the intended commit.
- Public APKs remain 2.2.0 code 54. Signed 2.2.1 code 55 candidates are built, signatures and four architectures verified, and no configured private values found in either APK. Runtime Maps-key exposure remains a separate open issue.
- Final Android 11 QA user flow verified completed-ride rating, persisted confirmation, static trip locations and timed-out history. Production user APK cold-start reached Google sign-in. Production driver check is finishing. Exact final production Android 15 cold starts remain pending.
- Node 24 no-build 50-ride repeat passed: 12,100 HTTP responses, 6,000 GPS updates, API p95 1,212.4 ms, GPS p95 297 ms, no isolation/reconnect/duplicate errors. Both slower and faster results are retained.
- Browser diagnostic viewport override worked at 360px with no document overflow on Feedback; pointer activation still did not show the expected state change. This is not a full portal interaction pass.
- Three-hour scheduled window has expired and its heartbeat is paused. Full app rollout remains blocked on Maps-key restrictions, signing migration and incomplete native/portal acceptance.

Final portal check: 10 October 2026, 07:12 AM IST. Security-only portal deployment c968ea5 is assigned to jr-admin.vercel.app and passed 26 live smoke checks, with one unavailable unrelated-hospital fixture. Both final production APKs reached sign-in on Android 11. Neither APK was uploaded.


## Superseding app preparation, 10 October 2026, 09:39 AM IST

Additional visual refinement is built and exercised on Android 11: real booking map, visual service choices, swipeable landmarks/manual edit and driver availability-first layout. Final production APKs retain code 55 and the existing certificate. Both passed Android 11 replacement of code 54 with app-private marker preservation. Source audit now covers 402 controls; this is not all-control interaction coverage. Portal build and typechecks pass. Maps and signing remain accepted open risks under the latest user decisions. The review board now has 66 entries, 51 images and 16 pairs. Publication has not occurred at this checkpoint. See RELEASE-2.2.1-APP-AUDIT.md.

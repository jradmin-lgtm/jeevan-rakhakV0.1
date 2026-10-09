# Jeevan launch v1: release tasks

Owner: current release session. Updated 10 October 2026, 12:11 AM IST.

The table below records earlier acceptance checkpoints. The latest pre-release evidence at the end supersedes its pending local checks. Production deployment and distribution remain pending until live verification.

User-approved stretch target: six hours from 8:08 PM IST on 9 October, approximately 2:08 AM IST on 10 October. The earlier 10 to 14 hour estimate is replaced by this target, not a completion guarantee. Work continues in this session. Tests, external deployment failures and unresolved major changes can extend the target. No final release has been deployed.

This is the first launch readiness target. Android package versions remain 2.2.0, code 54, so existing users can update normally. No item is complete merely because code exists.

## Approved constraints

- Free hosting for this release; no paid plan change.
- Backend booking coverage stays 1,000 km around SRMS.
- User home tagline displays 100 km as explicitly requested.
- Existing shared ops login stays, with signed sessions and login hardening.
- Preserve existing booking, SOS, cancellation, OTP, payment, safety for drivers/ops, KYC, history and portal features. Remove only the user Safety Alert feature requested in the document.
- Physical Infinix X693 is unavailable. Android 11 emulator testing is authorised; physical-device compatibility remains unverified.
- Offline release behaviour: retain active ride, route and landmarks, queue GPS, sync on reconnect.
- Separate offline-map proposal: rural area beyond 20 km from SRMS. No bulk offline OSM tile download or new paid provider authorised.
- Driver sounds: SOS uses a bundled buzzer; normal bookings use the device ringtone. Priority notification access requires an explicit Android permission grant.
- Preserve the universal print QR URL and update its destination/APK files behind it.

## ETA key

Windows count from this update and represent cumulative focused work, not separate per-ticket durations.

- A: by 10:08 PM IST. Mobile design, cached ride recovery and priority alerts.
- B: by 12:08 AM IST. Complete map integration, portal checks and native regression.
- C: by 1:08 AM IST. Compatibility, concurrent ride and isolated load evidence.
- D: target 2:08 AM IST. Deployment, APK distribution, QR and final reporting, dependent on release gates.
- Source done means implementation exists locally. It does not mean final verified or deployed.

## Ticket status and remaining acceptance

| Ticket | Scope | Current status | ETA window | Remaining proof |
|---|---|---|---|---|
| U01 | Document user #1: Pregnancy / Referral / OPD booking categories | Hindi normal booking payload and category selection passed in isolated UI/API; Android labels checked | A | Final native APK rerun |
| U02 | Document user #1: four SOS categories | Hindi cardiac SOS produced isSos=true and CARDIAC in the isolated backend | A | Final native SOS rerun |
| U03 | Document user #2: remove user Safety Alert | Source done; API refusal tested | A | Final user entry-point check; driver/ops safety retained |
| U04 | Document user #3: Request Type wording | Source done; native English checked | A | Hindi and final booking screen |
| U05 | Document user #4: pickup search and Bhojipura resolution | Source done; browser picker checked | B | Native search, selection, address and stored coordinates |
| U09 | Document user #5: manual drop pin and coordinate synchronisation | Source done; browser picker checked | B | Native search and manual pin payload; no mismatched label |
| U06 | Document user #6: attendant name and relation per ride | Source done; API and portals checked | B | Native edit and final receipt persistence |
| M01 | Document user #7: dynamic ETA | Source done; tracking unit/socket checks passed | B | Moving native GPS, stale fix recovery and phase transitions |
| M04 | Document user #8: stable remaining distance | Source done; stale/out-of-order unit checks passed | B | Concurrent ride and moving native GPS checks |
| M02 | Document user #9: zoom and recenter | Source done; browser checks passed | B | Native pinch, zoom buttons and camera persistence |
| D01 | Document driver #1: automatic address and landmark | Source done | B | Live lookup and incoming/active trip display |
| D03 | Document driver #2: route, traffic ETA and recalculation | Source done; actual renderer reporting, matching route source and guarded fallback tested | B | Resolve map-provider geometry/attribution constraints and native navigation |
| D02 | Document driver #3: eligible SOS on going online | Source done; API regression passed | B | Native online recovery with no manual refresh |
| M03 | Document driver #4: independent maps in parallel rides | Two simultaneous browser maps passed | C | Backend/socket/native parallel trip regression and load |
| P01 | Document portal #1: normal/SOS receipts and assessment attribution | Source done; portal and PDF checks passed | C | Final ops and hospital receipt/medical-record parity |
| O01 | Rural signal loss: active ride, route, landmarks, GPS queue and reconnect | Android 11 radio-off, both app cold restarts and reconnect passed; sampled queued fixes arrived exactly once with original timestamps | B | Repeat critical recovery after any map-provider change |
| O02 | Explore full offline maps beyond 20 km from SRMS | Proposal written in OFFLINE-MAPS-PROPOSAL-2026-10-09.md; no full tile-pack rollout authorised | B proposal | Provider rights, storage/cost, regional bounds and rollback; no provider purchase |
| A01 | Driver SOS bundled buzzer; normal booking device ringtone | Native channels and original buzzer compiled; installed on Android 11 | B | Versioned channels, packaged audio and notification routing |
| A02 | Driver priority-alert permission and settings controls | Android 11 denied and granted priority-access states tested; both native notification channels verified | B | Final APK channel checks; physical sound and OEM delivery remain unverified |
| UX01 | User booking redesign: route layout, service selection and persistent action | Source done; Android 11 selection, map confirmation and booking verified locally | A | English/Hindi, keyboard, large text, all current form/fare/coupon controls |
| UX02 | User home, SOS and live trip hierarchy | Source done; home and live trip rendered on Android 11; Hindi SOS-to-backend regression passed | A | SOS remains prominent; map, ETA, calls, OTP and assessments remain usable |
| UX03 | Driver dashboard, request cards and active trip polish | Native dashboard reviewed; active trip takes priority; availability hidden during a ride | B | Availability, accept/reject, navigation, safety, assessment and trip actions |
| UX04 | Shared visual consistency, useful motion and accessibility | Source done; motion preference and cleanup wired; large-text/Hindi native checks remain | B | Reduced motion, readable contrast, touch targets and no clipping |
| B01 | Audit: hospital scope and driver OTP/clinical privacy | Source done; 17 additional API/socket access and timestamp checks passed | C | Revoked hospital access and mutation-response checks |
| B02 | Audit: atomic booking lifecycle and concurrent assignment | Source done; 36 business regressions pass, including concurrent rating/payment/cancel and lifecycle transitions | C | Final full-suite rerun |
| B03 | Audit: input bounds, rate limits and production configuration | Source done; partial regression evidence | C | Missing configuration and malformed input; remote provider verification |
| B04 | Audit: expiry ownership, visible failures and consistent backup | Source done; local expiry/snapshot and restore checked | C | Latest backup and post-deploy health/build verification |
| P02 | Audit: shared ops login hardening and responsive portals | Live login authenticated through stored credentials; local ops and hospital browser logins passed; UI fixes in final review | C | Updated phone-width portal checks and final session regressions |
| U07 | Android compatibility including Infinix X693 / XOS Dolphin / Android 11 | Prior APKs launched on Android 11; local redesigned booking-to-tracking works; WebView recovery source added | C | Final APK rebuild, upgrade, cold start, permissions and WebView checks; physical X693 unavailable |
| U08 | User tagline 100 km; backend coverage stays 1,000 km | Source done | C | Final native copy and live service-area response |
| Q01 | Stable universal print QR with replaceable destination | Live redirect verified | D | Decode print asset, download and verify exact new APK bytes |
| V01 | Full feature parity and regression gate | Nine API suites pass on latest code; 16 unit tests and 10 workspace type checks pass; native interaction coverage still incomplete | C | Final login, booking, SOS, cancel, OTP, payment, assessments, history, safety, KYC and portals |
| V02 | Isolated load and resilience tests after final fixes | 25/100/500 local ride runs passed after KYC fix; latest changes are portal pagination and aggregate queries | C | Measured latency, failures, conflicts, location age and reconnect; no live fake dispatch |
| V03 | Production deployment, signed APK upload and QR validation | Both production APK candidates built, signature/runtime/endpoints/all four architectures verified and Android 15 upgrade installation passed; not uploaded | D | Deployed commit, signing lineage, checksums, upgrade and real downloads |
| V04 | Final audit ratings and measured scalability report | Baseline audit delivered; final scoring pending | D | Evidence for each score; free hosting and untested physical devices stated honestly |

| P03 | Audit: complete user/driver directories and lifetime totals | Server search, stable pagination, full CSV and accurate lifetime totals implemented; API and browser checks pass | C | 1,968-row CSV and hospital assignment/removal passed; deployment remains |

## Release gate

No failed required regression is carried forward. A skipped test is unverified, never a pass. Do not describe the release as perfect or all areas 7+ without supporting evidence. Free-service sleep remains an availability limit and must stay visible in the final assessment.

## Known release limits and gate state

- Free hosting is retained by instruction. Its sleep behaviour limits emergency-service availability and cannot honestly receive a 7+ availability rating from source changes alone.
- The supplied-configuration seam is currently red because the local scanner cannot see remote providers; its earlier temporary acceptance expired with subsequent edits. Optional email alerts have no configured provider and remain unavailable. Recheck before deployment.
- Leaflet compatibility catches now log warnings; the loud seam and embedded JavaScript parsing check passed.
- Physical Infinix testing cannot be completed without the handset. Android 11 emulator evidence does not certify every Android vendor variant.
- No final commit, production deploy or new APK upload has been completed for this release.

## Evidence added at this checkpoint

- Android 11 emulator: home, request-type selection, manual pickup confirmation, actual local booking creation, exact selected coordinates persisted, and live tracking map rendered. Test account and API were isolated locally.
- Native testing found and fixed an early map-ready signal race after Leaflet bundling. Confirmation had stayed disabled despite rendered tiles. A load-end handshake now checks actual renderer readiness.
- 30 existing API regressions passed after the GPS batch endpoint was added. 12 additional GPS API tests passed, including concurrent duplicate retries and no partial writes on rejected batches.
- Four phone queue tests passed, including restart persistence, interrupted uploads and account isolation. Android 11 native radio-loss and reconnect testing subsequently passed.
- Google Directions map display/caching rules need resolution in ticket D03 before release. Official reference: https://developers.google.com/maps/documentation/directions/policies . Standard OSM bulk offline tile download remains prohibited: https://operations.osmfoundation.org/policies/tiles/ .

## Latest local evidence

- Active ride, landmark, contacts and saved OSRM route restored after an API outage and app restart on Android 11. Bundled local test APKs subsequently passed radio-off restoration and reconnect. Production APKs remain pending.
- Driver priority channels and bundled buzzer compile in the native APK. Settings distinguish notification access, priority access and alarm volume. Audible output on the physical Infinix remains unverified.
- Seventeen account access, socket expiry, available-driver room and GPS timestamp regressions passed. No production service was changed by these tests.
- Both app type checks passed after shared support, push-state and socket setup changes. User confirmed a Maps key exists. The live endpoint still returns OSM and no browser key; restricted Android key access remains unresolved. Google Cloud currently requires sign-in.

- Isolated 500-ride run: 1,000 sockets, 4,000 successful API requests, 1,500/1,500 GPS updates, p95 API latency 204.7 ms, no cross-ride updates or duplicate stored GPS. This does not certify free Render capacity, external Maps quotas, FCM delivery or hosting cold starts.

## Evidence added at 9:44 PM IST

- Business lifecycle: 17 passing regressions, including simultaneous rating submissions, multiple-ride rating aggregation, cancellation versus pickup, wait-clock idempotency, duplicate payment and fare completion.
- Support: 19 passing checks covering all three roles, cross-role denial, atomic first messages, reopening and device push-token ownership/revocation.
- Android 11 radio-off recovery: active ride, cached OSRM route, landmarks and contacts survived process restart in both apps. Driver queued GPS survived restart, then synced on reconnect. Five sampled points retained coordinates/timestamps and were stored once.
- Local admin bookings audit found displayed-number search and the hidden 500-record cap. Server search and stable pagination now pass across all 692 local records. CSV export follows every filtered page. Three additional regression groups are in the CI workflow.
- Live operations password authentication and protected bookings read returned HTTP 200 using the stored deployment credentials. This was read-only, not a new deployment.
- Hospital browser login, acknowledgement, scoped patient record and receipt were exercised on the isolated backend. Navigation contrast, category labels, sign-out errors and unfinished-ride estimate wording were corrected; final browser recheck is running.
- Both updated local Android QA builds completed and are being installed as upgrades. Physical Infinix and audible notification delivery remain unverified.
- Native Google SDK setup requires a separate restricted Android key or Google Cloud access. The available service account received 403 for key inspection; the console requires sign-in. No server key has been placed in the APK.

## Additional verification, 9 October 2026, 10:30 PM IST

- Stored deployment credentials authenticated the live ops API. No credentials were printed or added to source.
- Local browser flows passed for user and driver profile save, both support conversations, coupon apply/remove/invalid handling, document upload, ops approval and the driver-visible review result.
- Driver KYC browser submission exposed an existing mismatch: blank optional document numbers were rejected by the API. Blank fields are now normalised for older APK compatibility; profile and initial hospital assignment commit together. The exact previously failing browser submission then succeeded.
- 29 support/KYC/document/push checks, 36 business checks, 30 booking checks, 12 GPS checks, 17 access checks and 3 booking-pagination groups passed locally. A separate actual API restart test preserved an unpaid completed ride. The 14 route/cache/queue tests passed.
- Startup no longer repeatedly marks completed unpaid rides as paid at zero. Payment preview uses the recorded trip fare, and payment retry rejects an incomplete receipt.
- Unrated drivers now say Not rated across the remaining portal screens. Care-profile disclosure text reflects the actual authorised operations and receiving-hospital access.
- Both app type checks and the API type check passed. The portal production build passed before the latest KYC-only changes.
- The new QA APKs are local builds using an isolated API. They are not the public release and must not be uploaded.
- Google server credentials are available, but a separately restricted Android/browser renderer key remains unverified. The Cloud service account cannot administer API keys. Map-provider review remains open.
- Additional emulator interaction is pending permission to use ADB because the available computer-use interface could not attach to the emulator window. Earlier Android 11 native evidence remains valid for those earlier builds.

## Remaining critical path

1. Complete Android checks using the existing key as requested. Its application/API restrictions remain unverified.
2. Finish final native regression and production APK build, signatures and upgrade evidence.
3. Complete release diff/configuration review and report any honest release limits.
4. Deploy, verify exact served commit, upload production APKs, and verify downloads behind the existing print QR.

The six-hour target remains 2:08 AM IST. Items blocked on access or an unanswered major-change decision are not given a false completion ETA.

## Latest verification update

- All nine isolated API suites passed after the directory and lifetime-total fixes: release, GPS batch, business lifecycle, support/KYC/documents, startup preservation, access control, bookings pagination, drivers pagination and users pagination.
- All ten workspace type checks passed. Sixteen tracking, offline-cache, location-queue and signed-session tests passed. The derived source check inspected 269 controls without missing-handler findings. This is source evidence, not proof that every control was pressed.
- Driver pagination returned 1,931 local records exactly once. User pagination returned 1,957 exactly once. Later regression fixtures increased these counts. Browser next-page navigation, global search for an older record and a one-row driver CSV passed.
- Both profile lifetime totals were tested with 105 completed trips and a payable total of INR 8,400. The recent table remains limited to 100, now labelled explicitly.
- KYC browser submission exposed blank optional documents being rejected. The API now normalises blank optional fields, validates hospital identity and writes driver/profile assignment atomically. The formerly failing browser payload passed after correction.
- Both production APK candidates are version 2.2.0, version code 54, native OTA runtime 2.2.0. Original signing lineage, production endpoints, four native architectures, disabled cleartext/debugging and the exact bundled driver buzzer were verified. Both installed over the existing Android 15 packages. Installation is not startup or physical-device verification.
- Latest isolated 500-ride load: 1,000 sockets, 4,000 successful HTTP requests, HTTP p95 258.6 ms, p99 303.5 ms, 1,500/1,500 GPS deliveries, GPS p95 28 ms, 25 successful reconnects and 10,000 queued fixes ingested in 1,006 ms. Zero duplicate/cross-ride GPS was observed. Local results do not certify free-host production capacity.
- Live credential/configuration preflight found no release-source matches for eight current secret types. Live data has 148 bookings, one active trip, no conflicting active assignments and no incomplete paid records. Do not run fake dispatch/load traffic against this live data.
- Deployment must set API NODE_ENV to production and realtime FLAG_PILOT_BYPASS_OTP to false. Current production services have not been changed.
- Superseding the earlier access notes: user explicitly authorised ADB and reuse of the existing Maps key. No Photon substitution. Existing key rendered Google road tiles around SRMS/Bhojipura in the real browser map; both Places searches returned valid results through the local API. Android 11 also rendered Google tiles on its live-trip screen. Key restrictions remain unverified because key administration returns 403.

## Verification update at 11:23 PM IST

- Replacing an invalid coupon with PILOT100 now removes the prior error and displays the correct zero payable amount. Hindi current-location labels update immediately; request radio selection is exposed to accessibility.
- Missing booking-deletion configuration now returns 503 instead of accepting a development fallback password. The live deployment supplies the password; the local missing-configuration regression passed without deleting its test ride.
- Map renderer and route provider stay aligned after a Google failure. Google geometry is cleared before switching to OSM; route recovery uses OSRM. Picker search results from Google require the actual Google renderer; backup mode retains GPS and manual pins.
- Five new map failure regressions pass: failed script download, tiles never arriving, late Google callback, actual provider readiness and repeated picker fallback. Invalid-key browser testing visibly recovered to OSM with all test pins.
- Android 15 production user candidate reached sign-in. Its first attempt had an Android process-attachment timeout during concurrent builds; subsequent launch succeeded. Repeat cold starts remain required. Android 11 emulator was restarted after its UI became unresponsive; app launch then completed in about four seconds.
- Map fixes require fresh candidate builds before upload. Existing APK candidates are superseded until rebuilt and verified. No final deployment or upload has happened.


## Release verification update, 9 October 2026, 11:56 PM IST

This update supersedes earlier map-key and test-count blockers. Publishing remains pending the final native and deployment checks.

- User explicitly accepted public reuse of the existing Maps key and its quota/billing exposure. Restrictions remain unverified. The existing key rendered Google tiles, route, live position and destination inside the Android 11 driver APK. No Photon substitution or native SDK migration was made.
- Ten isolated API suites passed: release, location batch, business, support, startup, access, bookings pagination, drivers pagination, users pagination and observability. All 21 shared UI, queue and ops-session tests passed. All ten workspace type checks passed.
- Final local load: 500 rides, 1,000 sockets, 4,000 successful HTTP requests, p95 HTTP 444.7 ms, p99 475.9 ms, 1,500/1,500 GPS updates, p95 delivery 31 ms, 25 successful reconnects, 10,000 offline points flushed in 2,549 ms, no duplicate rows or cross-ride delivery. This excludes public Maps quotas, push delivery and free-host capacity.
- Google-enabled Android 11 signal-loss testing retained the active ride, pickup landmark and 62 OSRM route points across a restart. All seven sampled queued GPS points reached the isolated database exactly once with their original coordinates and timestamps.
- OTP verification advanced the Android driver ride to en route and updated the hospital queue. Reopening an existing picked-up ride no longer auto-launches external navigation. The Navigate control and automatic launch immediately after pickup remain.
- Portal failure tests showed stale-data warnings during connection loss. A hospital acknowledgement failed visibly while disconnected, then succeeded after reconnect. Ops warnings cleared on successful refresh.
- Backend health now reports unavailable event counts/map usage instead of fabricated zeros. Event reporting returns 503 when persistence fails. Missing-table fault injection and restoration passed against the isolated database.
- A fresh private pre-deployment database snapshot captured 20 tables and 2,621 rows using a repeatable-read, read-only transaction. The 32,342,303-byte snapshot is held outside the repository. No credentials or database contents are included in release artifacts.
- Both production APK candidates are version 2.2.0, version code 54, with the existing signing certificate, production service endpoints and all four Android architectures. Latest driver candidate includes the offline navigation fix. QA builds remain private and will not be uploaded.
- Remaining: final APK upgrade/start checks on Android 11 and 15, deployment of the verified commit, read-only live verification, APK upload and checksum checks through the unchanged print QR.
- Physical Infinix X693 behaviour, audible notification delivery under OEM power management, unrestricted Maps quota exposure and free-host always-on availability cannot be certified by these tests. Email escalation has no configured provider and is unavailable.

## Final pre-release evidence, 10 October 2026, 12:11 AM IST

- All ten API integration suites passed, including explicit persistence failures and recovery. Twenty-one unit tests and all ten workspace type checks passed. The final portal production build passed.
- Final isolated load: 500 rides, 1,000 sockets, 4,000 successful HTTP requests, no HTTP or connection failures, HTTP p95 444.7 ms, 1,500 of 1,500 GPS deliveries, delivery p95 31 ms, 25 successful reconnects, no cross-ride delivery, 10,000 queued GPS points in 2,549 ms with no duplicates. This is local capacity evidence, not a Render production capacity claim.
- Android 11 actual Google map rendered routes and markers. Pickup OTP, trip start, external navigation, paramedic assessment, hospital receipt and trip completion passed against the isolated backend.
- Google-enabled signal loss retained the active ride, landmark and saved free-provider route after a cold restart. Seven sampled GPS fixes reached the database exactly once with original timestamps after reconnection. Reopening an offline picked-up ride now stays inside the driver app.
- Final signed production APKs, version 2.2.0 and version code 54, installed as upgrades and cold-started on Android 11 and Android 15. Both fresh sign-in screens rendered. No startup crash was captured. All four native architectures, production endpoints, runtime version, signing lineage and packaged SOS sound passed inspection.
- Hospital assessment receipt shows IST timestamps and distinct patient and paramedic sections. Ops and hospital failed refreshes and acknowledgement failures were made visible, and recovery was exercised.
- Derived source scan: 194 files, 322 controls, no reported syntax or missing-handler findings. This static result does not replace interaction evidence. Release-source secret scan: 198 files and eight live credential kinds, no matches. New-text long-dash scan and whitespace checks passed.
- Four-point commit audit: credentials excluded; controls and routes checked; local behavioural suites and native flows run; backups, QA entry files, old APKs, local gate state and pre-existing unrelated edits excluded from the release manifest.
- A consistent read-only pre-deploy database snapshot was saved privately at 11:51 PM IST, covering 20 tables and 2,621 rows. Restore was rehearsed earlier on the isolated database.
- The user explicitly accepted exposing the existing Maps key for this release. Render now stores that key as the renderer key, API production mode, and socket pilot bypass disabled. Free plans remain unchanged. These settings take effect with the deployment.
- The supplied-config gate requires a documented exception because the local scanner cannot see verified Render secrets and injected build metadata. Optional email escalation has no Resend provider. Source defaults cover folder IDs, log level and SOS/safety settings; rate-limit bypass is absent and disabled. The loud seam passes.
- Remaining deployment proof: exact live commit on API, socket and portal; live read-only smoke checks; upload only the signed production APKs; download each through the stable QR landing page and compare hashes.
- Remaining limits: physical Infinix/OEM alert behaviour and audible output are unverified; free hosting can sleep; the accepted public Maps key has quota/billing exposure; full offline tile packs beyond 20 km are a proposal, not part of this release.

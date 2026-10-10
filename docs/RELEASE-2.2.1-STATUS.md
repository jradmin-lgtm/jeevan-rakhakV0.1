# Jeevan Rakshak: release status and remaining tickets

Updated: 10 October 2026, 09:20 AM IST

**Partial release, not final v1 sign-off.** API, realtime and the portal dependency/security update are verified live at `c968ea5`. Public user/driver APKs remain **2.2.0, code 54**. The **2.2.1, code 55** app candidates are built but not uploaded. The printed QR continues to serve the existing downloads. Free hosting is unchanged.

The three-hour work window ended at 4:30 AM IST. Work overran that target. The scheduled continuation is now paused; this report records what actually shipped and what still needs acceptance.

## Ticket status

| Ticket | Request | Current evidence | Remaining gate / ETA |
|---|---|---|---|
| UX01 | Simpler user booking UI, same theme | Candidate uses pickup/drop hierarchy, clearer service rows and persistent request action. Android 11 category selection and Android 15 booking flows exercised. | Candidate ready for review; further visual refinement requested and under native verification. |
| UX02 | User home, SOS and live trip | SOS remains prominent; history, profile and support retained. Completed rides now show rating first and static trip locations. | Final Android 11 rating and timed-out screens passed. Full UI acceptance is incomplete. |
| UX03 | Simpler driver UI | Active trip takes priority. Offer landmark is visible. OTP keyboard dismisses after four digits; start and complete passed natively. | Exact final repeat used API-prepared arrival. Earlier native accept/arrival passed. |
| UX04 | Motion, readability and accessibility | Shared motion respects reduced-motion preference in source. Hindi SOS at 130% text size retained its actions and long landmark. | All-screen contrast, focus and large-text acceptance is incomplete. |
| U01/U04 | Pregnancy, Referral, OPD and Request Type wording | Present in live 2.2.0; three selections exercised in 2.2.1 Android 11 QA. | No new category removal. Candidate distribution pending. |
| U02/U03 | Four SOS categories; remove user Safety Alert | Prior release implemented the document changes. Driver and ops safety retained. | Exact final production SOS interaction repeat remains pending. |
| U05/U09 | Pickup search, Bhojipura, manual drop pin | Android 15 candidate exercised Google lookup, selection failure, visible Retry, successful retry and confirmation. | Existing Google key works, but its restrictions are unresolved. |
| U06 | Attendant name/relation per ride | Prior release implementation retained; business and support/API regressions pass. | Final native-to-receipt repeat is not newly certified. |
| D01/M05 | Five nearby landmarks or manual landmark | New authenticated server endpoint is live. It returns up to five distinct nearby places within 2 km. Android 11/15 selection, clear/manual and pickup-change reset tested. | Candidate app must be published before users receive this new selector. |
| D01/O01 | Driver-visible landmark and offline recovery | Confirmed text persists in booking, incoming summary, SOS event and trip. Earlier Android 11 offline restart/reconnect passed. | Physical network-loss acceptance remains pending. |
| M01/M04 | Location refresh, dynamic ETA, stable distance | Active GPS/socket and lifecycle regressions pass. Phase switching and stale-location handling retained. | 50 real renderer sessions and hosted latency remain unverified. |
| M02 | Zoom and recenter | Existing controls retained; map renders in candidate emulator. | Complete pinch/zoom/recenter acceptance on exact final production APKs remains pending. |
| D02 | Eligible SOS appears when driver goes online | Native candidate displayed pending offers after online; access/availability regression passes. | Physical push arrival and sound remain unverified. |
| D03 | Driver route, navigation and ETA | Google route rendered in Android 11; external navigation and return passed. Fallback source remains explicit. | No universal provider/OEM guarantee. |
| M03 | Parallel rides breaking maps | 50-ride isolation and GPS tests pass. Fifty authenticated landmark requests returned five choices each without key errors. | This is not 50 distinct Google map renderers or proof against quota exhaustion. |
| O01 | Rural signal loss | Active ride, confirmed landmark, saved OSRM route and GPS queue recover. Seven sampled offline fixes previously synced exactly once. | No fresh remote position is possible while disconnected. |
| O02 | Offline maps beyond 20 km | Proposal documented; booking coverage remains 1,000 km. | Regional downloads need provider rights, storage design and approval. Not shipped. |
| A01/A02 | SOS buzzer, normal ringtone, priority permissions | Buzzer bytes and Android permissions verified in final production driver APK. Earlier permission/channel checks passed on Android 11. | Audible delivery through silent/DND and OEM power management requires a physical device. |
| P01 | Receipts, assessment attribution, hospital access | Existing portal code retained. Isolated business/access/receipt-related regression evidence preserved. | Final redesigned portal interactions and new end-to-end medical/receipt repeat pending. |
| P02/P03 | Shared ops login and portal usability | Signed login/proxy and key protected routes pass live. Candidate table wrapping and in-app confirmations built. | Fresh browser tab works. Driver cancel/disable/re-enable and KYC validation exercised on isolated fixtures. |
| SEC01 | No exposed server Maps key | Confirmed current renderer key matches server key. No key value is in the report. Stored account cannot manage restrictions. | Existing key retained by explicit user decision. Restriction and separation remain open until Cloud access returns. |
| SEC02 | APK signing security | Candidates retain upgrade-compatible certificate. Two legacy signing keys are tracked in repository history. | User selected existing-certificate upgrade compatibility. Migration options documented for later review; exposure remains. |
| SEC03 | Ended-ride privacy | Reproduced leak fixed. API position and ETA are limited to active rides. 26 access tests and read-only live checks pass. | Verified live at c968ea5. |
| SEC05 | Severe dependency findings | Initial 125 advisories reduced to nine in candidate lockfile. API/realtime patched dependencies and Node 24 are live; the portal dependency patch is also live. | Residual Expo/Metro/navigation/build findings remain documented; no clean-audit claim. |
| B01/B02 | Account isolation and atomic lifecycle | Ten final Node 24 integration suites pass. Live wrong-user and anonymous access checks pass. | One live unrelated-hospital check lacked a fixture; isolated hospital checks passed. |
| B03/B04 | Configuration, visible errors, backups | Supplied/loud build seams pass. Startup and observability failure tests pass. Prior backup/restore evidence preserved. | Optional email escalation is not configured. New live backup recovery drill not run. |
| U07 | Infinix/Dolphin compatibility | Four ABIs, Android 7+ minimum, release signatures/endpoints checked. Android 11 candidate journeys and production cold starts exercised. | Physical Infinix unavailable. Android 11 ANR trace retained; cause unresolved. Final production Android 15 repeat pending. |
| U08 | Display 100 km, backend 1,000 km | Native user copy observed at 100 km; live API still reports 1,000 km. | Verified. |
| Q01 | Printed unified QR | Live redirect still targets the download page. No new APK pointer was published. | Verify exact downloaded hashes when app release clears. |
| V01 | No regressions | 31 targeted unit tests, 10 workspace typechecks, 10 final integration suites pass. Source inventory covers 400 controls. | Source wiring is not proof that all 400 controls were pressed. |
| V02 | 50 users and 50 rides | Two 30-minute soaks passed. Capped Node 24 no-build run: 12,100 HTTP successes, 6,000 GPS deliveries, API p95 1.21s, GPS p95 297ms. | Production hosting, push and 50 actual renderer sessions excluded. |
| V03 | Deploy and publish | API and realtime deployed. Portal security-only deployment is verified live, with 26 smoke checks passed and one unrelated-hospital fixture unavailable. App candidates remain private. | Maps/signing decisions received. Further requested UI refinement and final acceptance remain. |
| V04 | Before/after and launch risks | Review board has 63 entries, 48 images and 16 paired entries. Interactive risk register preserves notes and severity. | Missing states remain labelled. No claim that every page was redesigned. |

## Capacity and quality judgment

The current stack can handle the tested local 50-ride workload. A Kotlin rewrite is not supported by the measured bottlenecks. This does not establish free-host availability for emergency operation.

The no-build Node 24 test met the proposed 2-second p95 API target. The run during Android builds measured 3.84 seconds and is retained as a slower result. Neither run reproduced Render's network, database placement, sleep or shared-host contention.

Scoped backend patch review: **89/100**. Whole launch review: **75/100, revise**, comprising correctness 33/40, completeness 12/20, craft 16/20, verification 5/10 and rule adherence 9/10. These are engineering judgments tied to the evidence, not independent certification. Security and production availability cannot honestly be marked 7+ while the key/signing and free-host constraints remain.

## Confirmed decisions and remaining acceptance

1. Keep the existing Maps configuration for this testing release. Google Cloud access is unavailable; the shared-key exposure remains an accepted open risk.
2. Keep both Android package names and the existing certificate so installed apps can upgrade. Signing options are documented in `SIGNING-UPGRADE-OPTIONS.md`; no rotation or reinstall migration was performed.
3. Further UI refinement requested at 9:13 AM IST is in progress: real booking map preview, compact visual service choices, shorter landmark selection and clearer driver availability. New screenshots and exact final APK checks are pending.
4. Physical handset acceptance remains unverified. The Infinix crash cannot be declared fixed solely from emulator tests.

No new paid hosting is enabled. Always-on API/realtime and commercial portal-plan suitability remain launch-readiness decisions, as detailed in the interactive risk register.

## Operator handoff

Backend branch: `codex/jr-backend-221`. Both Render services temporarily have automatic deployment off so the older `prod` branch cannot overwrite the verified backend. Before re-enabling, integrate the backend commit or prove all its changes are present in the next prod release. User/driver UI candidate changes remain in the original working checkout and are backed up. Do not upload QA APKs or promote unverified app candidates.

Artifacts: `JR-UI-Review.html`, `JR-Launch-Readiness.html`, and this ticket report. No credentials or patient records are included.


Final live verification: 10 October 2026, 07:12 AM IST. Vercel production alias jr-admin.vercel.app points to c968ea5. Portal UI and APK distribution are pending the requested final visual pass and acceptance checks. The release heartbeat is paused.


## Superseding app preparation, 10 October 2026, 09:39 AM IST

Additional visual refinement is built and exercised on Android 11: real booking map, visual service choices, swipeable landmarks/manual edit and driver availability-first layout. Final production APKs retain code 55 and the existing certificate. Both passed Android 11 replacement of code 54 with app-private marker preservation. Source audit now covers 402 controls; this is not all-control interaction coverage. Portal build and typechecks pass. Maps and signing remain accepted open risks under the latest user decisions. The review board now has 66 entries, 51 images and 16 pairs. Publication has not occurred at this checkpoint. See RELEASE-2.2.1-APP-AUDIT.md.

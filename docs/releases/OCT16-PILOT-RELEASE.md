# Jeevan Rakshak controlled team pilot

Verified live: 16 October 2026, 1:03 AM IST. This is a controlled team pilot approved by the user, not a capacity-approved launch. The hosted 10-ride result remains FAIL and 50 rides are not certified.

## Live release

- User and driver APKs: 2.2.4, Android version code 58. Both were downloaded completely through the public contact-gated flow and their byte counts, SHA-256 hashes and signing certificate verified.
- Printed QR remains https://jr-admin.vercel.app/qr and redirects to https://jr-admin.vercel.app/download-apk. No QR reprint is required.
- Operations portal: https://jr-admin.vercel.app. Existing ops password, signed-session settings and protected-action password retained. Actual browser login, usage refresh, forecast, keep-warm disclosure and driver decision-history rendering checked. No real driver or booking was modified for this verification.
- Portal/application source: e47ced68216e67300f63c5dbc84fc6ee00ba19c0. Vercel production deployment dpl_9VGfS4XCB1CBBB5bzgB5wD6GCQx8 is READY with the existing public domain.
- API source: 5252631d2bac20e4a4a805137dd6692ec3cbfb46. Realtime source: 0be6a348f78266f44cafb3e022ddb8577ed15f1f. Both exact builds observed live. Their application/database/realtime source matches the release under the respective paths.
- Both services use restored production database jr_restore_oct15_v1. Approved cutoff: 15 October 2026, 12:03:01 PM IST. Later original-account changes were intentionally excluded by approval; the original source remains untouched.

## Changes and verification scope

| Area | Released change | Evidence and limit |
| --- | --- | --- |
| User and driver UI | Compact proportions, clearer request choices and ride-stage information, English/Hindi, wrapped driver GPS caption | Native/emulator and local interaction checks; exact final driver checked on Android 11, current user on Android 11/15 |
| Area and landmark | Area-first suggestions with optional recognisable meeting-point input, retained for driver details and ride recovery | Functional checks and 10 parallel landmark requests; not a guarantee that five useful areas always exist |
| Maps | Google renderer with existing key, OSM fallback, manual-pan recenter, recovered renderer state and phase-aware vehicle labels | Actual emulator Google rendering/recenter checks; production config returns expected Google key and fallback URL |
| Ride progression | After verified pickup, ambulance represents patient on board; old pickup marker/navigation removed where appropriate, drop navigation retained | Native/local phase-transition checks; not independent patient-phone GPS |
| Poor connectivity | Cached active ride/route/landmark, owner-scoped GPS queue, partial acknowledgement and duplicate-safe replay | Local/native queue checks and short hosted reconnect proof; full 200-point hosted offline stage was not reached in the failed load run |
| Driver alerts | Bundled SOS buzzer, booking ringtone, native continuous-alert path and priority settings | Source/native/local checks; remote FCM and physical OEM silent/DND audibility were not run |
| Admin actions | Protected operations with reason/audit, persistent offline hold, admin cancellation rather than invented completion/payment | 38 local feedback integration checks and actual isolated portal interactions; live controls/rendering checked without mutating real records |
| Driver history | Actor-scoped Accepted/Rejected decision separate from final trip status | Local integration checks and actual live Accept/Reject table/Accepted-row rendering |
| Usage dashboard | Four allowance meters, clearly labelled estimates, scenario planner and page-only 30-second health checks | Actual live login, provider readings, forecast and no horizontal overflow at tested 505 CSS-pixel viewport |
| Backup | Six-hour source-matched cooldown, document-byte reuse and unchanged-content upload avoidance | One new-source backup observed and directly verified; multi-writer deployments still need a distributed lease |

## Data and backup

Live counts: 12 users, 19 drivers, 2 hospitals, 234 bookings and 129 documents totalling 27,142,474 binary bytes. All restored identifiers and document bytes had already passed the restore verification. One recorded active trip remains from the approved cutoff; no operator decision was invented to cancel or complete it.

One source-matched pilot startup backup was verified directly from Drive and saved locally. It has 22 tables: the original 21 plus empty additive admin_actions. All 129 document identities and bytes match the approved restore. JSON size 38,475,320 bytes; SHA-256 8540993b0a5ce437a28a5624dc3887eb2ae7d5eac04818fd65ac1baa8e4c1ef2. Source snapshot logs showed zero binary bytes fetched and 27,142,474 reused bytes. The replacement API instance recognised the source-matched six-hour cooldown. No duplicate source backup was observed in this check; this is not an exactly-once guarantee for simultaneous independent writers.

## Hosted test remains failed

[GitHub run 38787766251](https://github.com/jradmin-lgtm/jeevan-rakhakV0.1/actions/runs/38787766251) completed only 1,430 of 1,800 steady checks, approximately 23 minutes 50 seconds. One GPS upload returned Cloudflare 520 after 39.901 seconds. The exact origin of that provider response remains unproved; no matching deployment/restart or high resource saturation was observed in the sampled window.

All 2,910 expected realtime updates arrived, with zero missing, duplicate or cross-ride events. Maximum observed UI fix age was 5.002 seconds. Observed p95: user poll 448.1 ms, driver poll 460.2 ms, GPS upload 850 ms, delivered realtime fix 101.7 ms. These are partial-run measurements, not full capacity certification. Ten concurrent initial accept calls had p95 about 4.36 seconds.

The harness incorrectly classified observed 520 as non-transient while the unchanged app queue retains that failed upload for retry. A test-only correction and 10 focused tests demonstrate simulated recovery at 45 seconds with the raw error retained. This does not prove the actual hosted 520 recovered. Full offline replay, forced reconnect and complete/end/payment stages were not reached in this run. Earlier failed runs remain failed. No replacement full hosted run was started after the pilot decision.

All ten synthetic rides were cancelled and their drivers made offline in the isolated test database. Both temporary GitHub test secrets were deleted and the task database role dropped. Production now uses the separate restored database. Further load testing must not use these production endpoints or real records.

## Remaining limits for the team

- Pilot use is authorised; ten-ride and fifty-ride capacity are unverified. Capture any visible error with time, app version and ride reference.
- Physical Infinix startup, remote FCM delivery and physical silent/DND audibility were not run.
- Existing shared public Google renderer/server key exposure remains accepted by the user. It is not fixed by a private-value scan. Separate restrictions still need Google Cloud access.
- Signing compatibility is retained. The legacy signing key in repository history remains a risk requiring a reviewed migration.
- Free service sleep, shared running-hour and transfer limits remain. No paid plan or card change was made. Opening Monthly usage runs health checks; it is not a 24/7 uptime service.
- Current delayed readings must not be treated as live balance. The final two verification downloads transferred 127,841,436 application bytes after the usage snapshot; they may not yet be reflected in provider totals.

## Release file identities

| App | Bytes | SHA-256 |
| --- | ---: | --- |
| User | 63,873,517 | 04a627b2da5eba89536b9d4bbbd998b6c9c0826b60d7562114aae3df2c04fd13 |
| Driver | 63,967,919 | 2477ecfe7ccbf9179d04bb6d8f85f298f43f786a70e8abb220cc3a643ca09e9b |

Both actual public downloads verify with retained signer SHA-256 fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c. Prior published APK files remain for rollback.

## Evidence

The local review folder jr-pilot-release-20261016 contains aggregate-only public-download, backend, failed-test, cleanup and backup evidence. Full private database exports remain separately permission-restricted under LOCAL DATABASE BACKUPS. Review boards and the launch/usage one-pager retain historical evidence with a current pilot-status banner.

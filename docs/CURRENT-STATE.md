# Jeevan Rakshak: current state

Updated 16 October 2026, 1:42 AM IST. This entry supersedes previous current-status text; dated evidence and failed runs remain preserved.

**LIVE CONTROLLED TEAM PILOT: Jeevan Rakshak 2.2.4, Android build 59.** Both public APKs and the admin/API/realtime services are verified. The temporary native-metadata and SOS dispatch release holds are closed. **Capacity remains unapproved:** the hosted 10-ride run failed, and 50 simultaneous rides are not certified.

[Existing printed QR](https://jr-admin.vercel.app/qr) · [User and driver downloads](https://jr-admin.vercel.app/download-apk) · [Admin login](https://jr-admin.vercel.app/admin-login). The QR still returns307 to the same download page; no reprint is required.

[Verified pilot release and limitations](/Users/kumar.sh/.codex/worktrees/jr-ended-ride-privacy/jr-prod/docs/releases/OCT16-PILOT-RELEASE.md).

## Exact live identities and proof

- Public user APK:2.2.4 /59,63,873,517 bytes; SHA256 `bb439b8920d50b6945b42e38c0ba90bde19e8e257fcc054cd3841a8a5cb75b53`.
- Public driver APK:2.2.4 /59,63,967,915 bytes; SHA256 `4f7a70833f1bd8544544954f68ca162a68b3f9e23811de348df989432d86efa4`.
- Both complete contact-gated public HTTP downloads were verified for exact bytes/hash, compiled package/versionCode59/versionName2.2.4/runtime2.2.4 and retained signer `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`. Neither reused a previously downloaded local file. Public proof began16 October1:36:50AM IST; SHA256 `33c97a240a4a7950e67e2064d16754bd61585270ba673ee7e52a39b8f93d76c3`.
- APK native source:`67851f2a85d95f1ad32c682e0ea3a94ecf7b2f31`. API and portal source:`950ed84a6ba9244ac654adab5d32d77ada7eaf7b`. Realtime source:`0be6a348f78266f44cafb3e022ddb8577ed15f1f`.
- API deployment:`dep-db8j32tg1s2s73e1d92g`. Portal deployment:`dpl_C9b6xmkK1hcgX69LJLt8pxk89azR`, READY on the unchanged public domain. Socket deployment remains`dep-db8ie1u89jmc73dsip8g`.
- Read-only production proof at1:34:44AM IST passed exact builds, application/DB health, authorized dashboard, unauthorized dashboard401 and un-tokened APK403, plus Google map configuration with the existing renderer key and OSM fallback. Proof SHA256:`984c0280db60febd727a25fa7b02d47e0d98af53e3d31194f74ab8f1cabd02d0`.
- Preserved admin password login, Secure/HttpOnly/SameSite=Lax cookie, logout, unauthorized usage redirect, all four usage meters without provider errors and two responding health checks passed. Actual public browser checks at505 CSS pixels showed495px document width without overflow, the usage values and both download cards. Earlier live checks exercised Refresh,100-APK forecast, disclosure, protected driver controls and Accepted/Rejected history without modifying business records.

## Closed release-consistency findings

Build58's compiled native runtime was2.2.3 while app version was2.2.4; CI38793591540 caught the real metadata mismatch. Update flags were present, but no expo-updates dependency/autolink or UpdatesController/UpdatesPackage classes were found. Active OTA execution, loading older OTA code and an OTA-caused functional failure were not established. Both apps were rebuilt as59 with matching2.2.4 runtime; compiled public binaries now prove the correction. Both JavaScript bundles are byte-identical to58; no UI or map behavior was rewritten for this metadata fix. Build58 public-download proof remains historical, not proof of59.

The integration run then exposed a real SOS gap: if no driver had been eligible, a newly online driver could wait for the20-second idle timer. The API fix wakes only waiting SOS runners with no current-cycle offer, coalesces concurrent work, cancels stale timers and retries failed wakes. Existing active offers keep their persisted20-second deadline. Independent review caught and fixed the initially missing retry-on-error path; all7 focused tests passed. Integration fixtures were corrected to establish durable offers/availability, test both legitimate serialized accept/offline outcomes and verify25-hour GPS history without rewinding live location. These were test preconditions, not relaxed application authorization.

[standard CI run 38798456932](https://github.com/jradmin-lgtm/jeevan-rakhakV0.1/actions/runs/38798456932) completed successfully for source950ed84: typecheck, ops session security, native release configuration, route progression, offline queue, SOS wake and isolated booking/permissions regression all passed. This is GitHub-hosted functional regression using isolated PostgreSQL, **not Render capacity certification**. The API code-only hotfix preserved production environment, free plan, socket, authentication and restored data. Restart logs recognized the source-specific backup cooldown; no extra snapshot was observed in that check.

## Native, maps and offline evidence scope

All four actual58-to59 same-signer upgrades and cached offline launches passed on Android11/15. Android11 private storage bytes matched before/after; Android15 private byte equality was unavailable. Both59 APKs contain four ABIs, minSdk24/targetSdk35, corrected runtime and identical JavaScript bundles. The final59 native manifest binds9 current evidence files and prior58 Google evidence; SHA256`e5b450030eef910952e0433bf33fdcc9215c087bce0b6e4b29baf86f2040c646`. No fresh59 Google full ride was run.

Prior exact58 evidence remains scoped: user04a627 on Android11/15 rendered local Google through pickup, live GPS, manual pan and recenter without restart. Driver2477ec Android11 Hindi Google smoke showed onboard marker, complete caption, ETA, drop footer, pan and recenter without restart; separate offline Hindi100%/130% checks passed. The smoke used a prepared synthetic onboard ride, not a fresh provider login/UI OTP. These Google checks carry forward by identical JS and metadata-only native changes; they are not relabeled as a new59 full ride.

Map sourcefc7e171 uses latest target geometry, coalesced phase/layout fitting, explicit recenter with fresh props, and cancellation of stale animations. A10km discontinuity resets only the visual trail; stored GPS/cache/coverage are unchanged. Manual pan persists until recenter. Independent22-map/39-UI tests and typechecks passed. Bounded hosted Google area/ETA checks passed10+10 calls, not30 minutes of sustained Google requests or50 renderers. Earlier driver fallback after network restoration sometimes required process restart to return to Google; that remains an improvement item.

Approved rural scope is cached active ride/route/area/meeting point and owner-scoped queued GPS replay on reconnect. Fully downloadable offline maps beyond20km from SRMS remain a proposal. No new position can reach another phone without connectivity.

## Hosted load history, unchanged

[hosted V2 run 38787766251](https://github.com/jradmin-lgtm/jeevan-rakhakV0.1/actions/runs/38787766251) remains **FAIL**. It completed1,430/1,800 steady checks in23m50s, then one GPS upload returned Cloudflare520 after39.901s. Raw HTTP and client-resilience verdicts failed. Underlying provider cause remains unproved; no actual hosted retry recovery from that520 was established.

During the completed scope,2,910/2,910 realtime points arrived with zero missing/duplicate/cross-ride events and no natural disconnects. Maximum true UI fix age was5.002s. Partial-run p95:user448.1ms, driver460.2ms, GPS850ms and realtime101.7ms. The separate controlled502 check recovered in15.224s with exactly one stored row. **Final forced reconnect,200-point offline replay, exact1,412-row persistence and complete/end/payment stages were not reached.** All10 isolated rides were cancelled/inactive, drivers offline, and two temporary secrets plus the test role removed.

The test classifier excluded520 although the app queue preserves failed uploads. A narrow test-only correction passed10 focused tests and simulated recovery after45s with all1,211 synthetic rows retained and raw520 recorded. This is not a successful repeat of the actual failed hosted run. No new full run followed the explicit pilot decision.

Earlier evidence is retained separately:

- Strict10-ride run failed after13m47s on one GPS502;1,659/1,660 GPS rows persisted. It remains FAIL.
- Bounded unchanged-queue recovery proof passed across restart, ACK945ms, duplicate313ms, realtime258ms and exactly one row. It is not capacity or physical-device proof.
- Render generator was replaced after about9 minutes without a source deploy; last snapshot had no raw errors, sampled CPU19.3%/memory26.4%. Exact replacement cause is unknown; run INTERRUPTED, generator suspended and fixtures cleaned up.
- GHA38776443618 failed:3,262/3,610 realtime points arrived,348 missing. Five test sockets disconnected; that harness had reconnection disabled while actual apps reconnect. The mismatch does not retroactively pass the run.
- The81-second one-ride recovery proof passed: user/driver fresh socket recovery5,203/4,939ms, authorized snapshot2,498/4,994ms. One of14 raw events was missing, so raw realtime FAIL remains.5 sampled points persisted; own fixture inactive.
- Earlier hosted50 attempts failed their budgets. Neither10 nor50 parallel rides nor a monthly ride allowance is certified.

## Restored data and backup

The user approved15 October12:03:01PM IST as cutoff. Restored database`jr_restore_oct15_v1` verifies12 users,19 drivers,2 hospitals,234 bookings and129 documents totaling27,142,474 binary bytes. Original source is intact. The approved21-table export,6,894 rows, all row/document checksums and27 relationships passed restore checks; private JSON and PostgreSQL18 archives remain under LOCAL DATABASE BACKUPS. One original active trip remains from the approved cutoff; no completion/cancellation was invented.

Pilot startup backup verification found one source-matched complete format2 snapshot,22 tables including empty additive admin_actions, all129 document identities/bytes matching restore,38,475,320 JSON bytes. A direct bounded Drive download and local copy were verified. Subsequent API950 restart recognized its durable six-hour cooldown. Document-byte reuse and metadata-only verification suppress unchanged complete uploads; real table changes still trigger full snapshots. Simultaneous independent writers still need a distributed lease; no exactly-once guarantee is claimed.

Original service suspension was transfer, not storage or hours: Neon5.54GB transfer/64.46MB storage/16.45CUh; Render5.76GB against5GB,98.83/750hours. Recorded103 October UTC backups totaled3.517GB JSON. These support the RCA, not an exact per-request invoice.

## Latest usage and remaining limits

| Meter | Used / assumed monthly allowance | Approximate remaining |
| --- | --- | --- |
| Neon transfer, reported | 166.65 MB / 5 GB, **3.33%** | 4.8334 GB / 96.67% |
| Neon compute, normalized estimate | 1.6978 / 100 CU-hours, **1.70%** | 98.3022 CU-hours / 98.30% |
| Render bandwidth, hourly estimate | 296.38 MB / 5 GB, **5.93%** | 4.7036 GB / 94.07% |
| Render current-service age ceiling | 18.5309 / 750 shared hours, **2.47%** | 731.4691 modeled hours / 97.53% |

Authenticated tracker fetched16 October1:36:52AM IST, with a15-minute cache. Provider data may lag and do not supply exact freshness. Render hourly totals cover current services, may omit deleted resources and may contain a partial latest hour; service age includes sleep and is an upper model, not billed hours. These are not invoices or guaranteed balances. The build59 verification pair transferred127,841,432 application bytes after this reading; the earlier build58 pair transferred127,841,436 bytes, totaling255,682,868 bytes across four checks. Do not add all four downloads to a reading that may already include some of them.

The planner uses1.448MB application JSON per active ride-hour,63.9MB/APK and38.47MB/changed full backup. These are visible assumptions, not wire traffic or complete bills. Four changed backups/day for31days is about4.77GB;100 APKs about6.39GB, before other traffic. Two always-on services need1,488hours in31days against750 shared free hours. Do not infer Neon traffic from APK/Render bytes or promise free monthly operation by ride count alone.

The usage model passed20 tests, build/typecheck and peer review; prior505/1,280px local checks had no overflow. Eight checked private values were absent from67 generated client files. Usage readings refresh separately from30-second API/socket liveness while the usage page is open. The liveness calls do not query the database; closing/sleeping the page stops or delays them, and they consume Render free hours. This is not24/7 monitoring.

Keep free hosting,1,000km backend coverage/100km display, shared ops login, existing signing compatibility, existing Maps key and printed QR. No paid plan/card change is approved. Shared public Google key exposure remains accepted and unremediated; separate restrictions require Cloud access. Legacy signing material in repository history remains a migration risk. Physical Infinix/XOS startup, remote FCM, physical silent/DND audibility and real login-provider journeys remain unverified. No universal Android or zero-regression guarantee is supported.

## Next work and workspace discipline

Collect controlled-team/device feedback for booking, area/meeting point, acceptance, pickup, tracking, completion, alerts and upgrades. Diagnose the520 separately; any future full load must use isolated data and endpoints, never restored production. Preserve failed results and require a complete reviewed test before capacity claims.

Authoritative worktree:`/Users/kumar.sh/.codex/worktrees/jr-ended-ride-privacy/jr-prod`. Primary retains other dirty work; do not reset or stage wholesale. Credentials, full records, backups and signing files stay outside Git/shared reports. Current-state mirrors, usage/budget handoff and historical-review banners reflect59; historical build57 data and58 evidence are retained with their dates.

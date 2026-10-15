# Jeevan Rakshak: current state

Updated 15 October 2026, evening IST. This is the current context entry point. Earlier release claims describe their verification date, not present availability.

## Current availability and recovery

Original Neon reached monthly network-transfer allowance, not its storage limit. Dashboard evidence: 5.54 GB transferred, 64.46 MB storage and 16.45 CU-hours. Original Render services were suspended for billing after 5.76 GB outbound against 5 GB included. Dashboard breakdown: 3.47 GB service-initiated and 2.29 GB HTTP responses. Free hours were 98.83/750, so hours were not the immediate suspension cause.

The user approved 15 October 12:03:01 PM IST as the recovery cutoff. Later source changes are excluded. Exact restored state is verified on alternate Neon database jr_restore_oct15_v1: 21 source tables, 6,894 rows, 129 documents and 27,142,474 document bytes; all row/binary checksums match and 27 relationships have no orphan rows. Original source remains intact. Both original JSON and a schema-and-data PostgreSQL 18 archive are saved privately under the parent LOCAL DATABASE BACKUPS folder. Actual local archive restore passed.

Two new free Ohio Render services currently use a separate synthetic load database. API and temporary generator serve da50ecbecceb936db8b5457b8692dda5fceb741a; realtime remains 0be6a348f78266f44cafb3e022ddb8577ed15f1f. They are not yet serving restored production data. Public portal and APK download destinations have not been switched. Do not call the new release live.

## Candidate and checks

Seven latest feedback requests are implemented in the candidate. Details and superseding measured results are in [October feedback ledger](releases/OCT13-FEEDBACK-2026-10-15.md). Changes include protected admin cancellation/offline/restriction, driver decision history, native continuous priority alerts, post-pickup navigation and marker handling, map recovery, and partial GPS queue acknowledgements. Existing signing, coverage, login, QR and earlier app flows remain required.

Workspace build and typechecks passed. Independent source reviews scored 89 and 91. Both 2.2.4 build 58 APK candidates use the existing signing identity, contain all four Android ABIs and the new hosted endpoints, and passed expanded private-value scans. Actual Android 11 replacement installs preserved auth/profile and queued GPS. Android 15 local journeys exercised OTP phase changes, cached ride recovery and native normal/SOS alert service start/stop. These candidates remain unpublished.

Actual portal interaction against the isolated local clone passed login and protected-action success/refusal paths. Database audit, cancellation/payment and account-restoration postconditions passed. A separate actual hosted create, nearest-driver dispatch, incoming, accept and cancel journey passed with its landmark retained.

Hosted 50-ride capacity is NOT approved. Two full attempts stopped early on individual transport failures and exceeded the 2,000 ms HTTP p95 budget. Realtime deliveries remained complete with no cross-ride events or duplicates. A persistent-client diagnostic still exceeded client budgets despite sampled server p95 below 1,000 ms. A remote guarded generator also failed after 39 seconds of steady work: one booking poll and one GPS upload returned HTTP 502. Poll p95 was 3,649 ms and upload p95 3,943 ms; all 450 realtime deliveries arrived. This rules out the Mac as the sole cause. No-socket diagnostics found poll-only p95 2,860 ms, upload-only 1,751 ms and combined 3,336 ms. The joined booking read passed the same 27 real HTTP/database checks before and after, then independently passed 27 checks. The subsequent clean short run completed every lifecycle stage and 675 realtime deliveries with zero HTTP errors, but failed the response budget: poll p95 2,665 ms and upload p95 3,095 ms. Bounded runtime logs measured API CPU peaking at 0.148746 cores, 99.2% of its observed 0.15-core allowance, with event-loop maximum about 608 ms. This demonstrates CPU saturation episodes, not a successful 50-ride capacity test. The user explicitly declined a US$7/month API Starter comparison and required free hosting. The user then changed the launch target to 10 simultaneous rides and required that workload to be tested before publication. Earlier 50-ride failures remain valid evidence; a later 10-ride pass cannot certify 50. The full 30-minute test and bounded real hosted Google phase remain pending.

## Usage prevention and limits

Candidate backup code reuses verified unchanged document bytes, enforces durable six-hour cooldown across restarts, and skips full uploads when complete table contents are unchanged. Changed contents still produce full recovery snapshots. Active-data full snapshots can still consume about 4.77 GB/month of Render outbound at the current snapshot size. Private APK delivery also consumes API outbound, approximately 6.4 GB per 100 downloads at current binary size. Do not promise free-tier operation for a month from ride count alone. Exact historical billing attribution remains estimated, not proven per request.

Keep free hosting, 1,000 km backend coverage / 100 km display, shared ops login, existing signing compatibility, existing Maps key and printed QR. No paid plan/card or deletion is authorized. Existing shared public Maps-key exposure is an accepted remaining risk, not remediated key separation. Downloadable offline maps beyond 20 km remain a proposal; cached active ride/route/area/GPS recovery is the approved implementation.

Physical Infinix X693, XOS Dolphin 7.6 / Android 11 is unavailable. Physical OEM startup, remote FCM delivery and silent/DND audibility were not run in this release check. Emulators do not prove every Android variant. No blanket zero-regression or hosted 50-phone claim is supported.

## Next release gates

Finish remote hosted 10-user/10-ride 30-minute testing with the same latency/error budgets and record resource usage. No further 50-ride rerun is required for the revised launch scope. Run the bounded hosted Google landmark/ETA functional phase and exact production APK map checks independently of capacity, without treating those as a capacity pass. Bind verified restored data and preserved production auth/provider configuration, verify migrations and real endpoints, then repoint and verify the existing public portal. Publish exact signed APK candidates and check QR/download hashes. Update final release and team budget documents with actual results.

## Workspace discipline

Authoritative source: /Users/kumar.sh/.codex/worktrees/jr-ended-ride-privacy/jr-prod, branch codex/jr-apps-221. The primary checkout retains earlier dirty work and is not equivalent to its old HEAD. Do not reset or stage wholesale. Credentials, full records, backups and signing material remain outside Git and shared reports.


New requested admin feature: show monthly provider-reported usage alongside explicitly estimated used/remaining percentages based on service hours and measured ride/download/backup flows, with freshness and model limitations. Historical restored rides must not be counted as new-account traffic. The user also requested retaining a 30-second keepalive; implementation and free-hours consequences are being checked before enabling any new schedule. No database keepalive is authorized by inference.

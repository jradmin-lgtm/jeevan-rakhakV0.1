# Jeevan Rakshak: current state

Updated 15 October 2026, evening IST. This is the current context entry point. Earlier release claims describe their verification date, not present availability.

## Current availability and recovery

Original Neon reached monthly network-transfer allowance, not its storage limit. Dashboard evidence: 5.54 GB transferred, 64.46 MB storage and 16.45 CU-hours. Original Render services were suspended for billing after 5.76 GB outbound against 5 GB included. Dashboard breakdown: 3.47 GB service-initiated and 2.29 GB HTTP responses. Free hours were 98.83/750, so hours were not the immediate suspension cause.

The user approved 15 October 12:03:01 PM IST as the recovery cutoff. Later source changes are excluded. Exact restored state is verified on alternate Neon database jr_restore_oct15_v1: 21 source tables, 6,894 rows, 129 documents and 27,142,474 document bytes; all row/binary checksums match and 27 relationships have no orphan rows. Original source remains intact. Both original JSON and a schema-and-data PostgreSQL 18 archive are saved privately under the parent LOCAL DATABASE BACKUPS folder. Actual local archive restore passed.

Two new free Ohio Render services currently serve candidate 0be6a348f78266f44cafb3e022ddb8577ed15f1f against a separate synthetic load database. They are not yet serving restored production data. Public portal and APK download destinations have not been switched. Do not call the new release live.

## Candidate and checks

Seven latest feedback requests are implemented in the candidate. Details and superseding measured results are in [October feedback ledger](releases/OCT13-FEEDBACK-2026-10-15.md). Changes include protected admin cancellation/offline/restriction, driver decision history, native continuous priority alerts, post-pickup navigation and marker handling, map recovery, and partial GPS queue acknowledgements. Existing signing, coverage, login, QR and earlier app flows remain required.

Workspace build and typechecks passed. Independent source reviews scored 89 and 91. Both 2.2.4 build 58 APK candidates use the existing signing identity, contain all four Android ABIs and the new hosted endpoints, and passed expanded private-value scans. Actual Android 11 replacement installs preserved auth/profile and queued GPS. Android 15 local journeys exercised OTP phase changes, cached ride recovery and native normal/SOS alert service start/stop. These candidates remain unpublished.

Actual portal interaction against the isolated local clone passed login and protected-action success/refusal paths. Database audit, cancellation/payment and account-restoration postconditions passed. A separate actual hosted create, nearest-driver dispatch, incoming, accept and cancel journey passed with its landmark retained.

Hosted 50-ride capacity is NOT approved. Two full attempts stopped early on individual transport failures and exceeded the 2,000 ms HTTP p95 budget. Realtime deliveries remained complete with no cross-ride events or duplicates. A persistent-client diagnostic still exceeded client budgets despite sampled server p95 below 1,000 ms. A remote guarded generator is being prepared to separate server capacity from the Mac/network path. The full 30-minute test and bounded real hosted Google phase remain pending.

## Usage prevention and limits

Candidate backup code reuses verified unchanged document bytes, enforces durable six-hour cooldown across restarts, and skips full uploads when complete table contents are unchanged. Changed contents still produce full recovery snapshots. Active-data full snapshots can still consume about 4.77 GB/month of Render outbound at the current snapshot size. Private APK delivery also consumes API outbound, approximately 6.4 GB per 100 downloads at current binary size. Do not promise free-tier operation for a month from ride count alone. Exact historical billing attribution remains estimated, not proven per request.

Keep free hosting, 1,000 km backend coverage / 100 km display, shared ops login, existing signing compatibility, existing Maps key and printed QR. No paid plan/card or deletion is authorized. Existing shared public Maps-key exposure is an accepted remaining risk, not remediated key separation. Downloadable offline maps beyond 20 km remain a proposal; cached active ride/route/area/GPS recovery is the approved implementation.

Physical Infinix X693, XOS Dolphin 7.6 / Android 11 is unavailable. Physical OEM startup, remote FCM delivery and silent/DND audibility were not run in this release check. Emulators do not prove every Android variant. No blanket zero-regression or hosted 50-phone claim is supported.

## Next release gates

Finish remote hosted 50-user/50-ride 30-minute testing with existing budgets and record resource usage. Run the bounded hosted Google landmark/ETA phase. Bind verified restored data and preserved production auth/provider configuration, verify migrations and real endpoints, then repoint and verify the existing public portal. Publish exact signed APK candidates and check QR/download hashes. Update final release and team budget documents with actual results.

## Workspace discipline

Authoritative source: /Users/kumar.sh/.codex/worktrees/jr-ended-ride-privacy/jr-prod, branch codex/jr-apps-221. The primary checkout retains earlier dirty work and is not equivalent to its old HEAD. Do not reset or stage wholesale. Credentials, full records, backups and signing material remain outside Git and shared reports.

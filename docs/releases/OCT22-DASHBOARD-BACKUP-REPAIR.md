# Dashboard interruption and backup isolation repair

22 October 2026, IST. API-only owner-authorized repair. Runtime source `41f51d4b131fdf6479981a6031b42da8b6f6e28f`. Render deployment `dep-dbd4ru7f3r2c73bash6g` became live by 11:26 PM IST. CI [39826583153](https://github.com/jradmin-lgtm/jeevan-rakhakV0.1/actions/runs/39826583153) passed for this exact source.

## Root cause and evidence

The supplied portal screenshot shows unavailable dashboard data. Fresh authenticated requests before deployment loaded successfully, so this was intermittent rather than a permanent password failure. Provider health failures and snapshot processing align in the retained logs. The existing backup performs synchronous checksum, JSON canonicalization and chain reconstruction on the HTTP event loop. An isolated 512 MiB, 0.25 CPU reproduction with the retained 38,479,719-byte real snapshot blocked that loop for 14.8 seconds and produced eight 1.5-second health timeouts. Render's recorded health timeout is five seconds. This reproduces a mechanism that can cause the portal failure; it does not prove every historical interruption had this sole cause.

Recent live logs show repeated snapshot attempts reusing 27,142,474 binary bytes and fetching 4,000,128 new binary bytes, with no completed upload in the fetched window. A restarted process waits for the ten-minute durable writer lease before retrying. Failed attempts can therefore repeat data transfer without advancing the backup head. Newly added documents still legitimately belong in an increment. No historical billing allocation is inferred solely from these logs.

## Change

Run the unchanged backup scheduler in a separate worker thread, with a 192 MiB old-generation limit, 16 MiB young-generation limit and one database connection. HTTP processing remains on the main thread. Worker construction failure, fatal error, unexpected exit and malformed messages are visible. Fatal workers retry after five minutes. Shutdown terminates the worker and cancels retries. The TypeScript hook is registered in the worker for workspace dependencies. The existing six-hour schedule, source identity, chain hashes, maximum depth, unchanged-content reuse, binary reuse, durable lease and private Drive folder are retained.

No schema, authentication, shared ops password, portal, realtime service, Maps configuration, APK, QR URL, signing identity or plan changed. The 31 runtime environment values were read back unchanged. The API remains on Render Free. No production data was deleted or restored. No new hosted load test was run.

## Verification

- 54 focused tests passed, including real isolated PostgreSQL restoration of typed values, insert/update/delete, duplicate-row preservation, binary reuse, corruption rejection, source checks and 12 concurrent lease contenders with one winner.
- Worker lifecycle tests cover constructor failure, fatal error, unexpected zero exit, malformed messages, stop/retry cancellation, actual heavy hashing and source-entry bootstrap.
- Two actual scheduler cycles with mocked external services produced verified increments of 2,295 and 2,298 bytes. These synthetic-change sizes do not predict production increments containing new documents.
- Local constrained health runs passed with 275 responses / 0 timeouts, a full API import baseline with 268 / 0, and a final repeat with 390 / 0, maximum response 403 ms. One intervening full-baseline run had 450 responses / 5 timeouts. It remains a failed result and limits the capacity conclusion. This is not certification of 50 rides or unlimited free-tier reliability.
- API typecheck, exact-source CI and build gate supplied/loud checks passed. Selected release files were scanned against known private credential values. Four-point audit and pre-edit hash copies are retained privately.
- Fresh live authenticated API dashboard, portal login, server-rendered dashboard and portal proxy returned HTTP 200. The page did not contain the screenshot's dashboard-failure text. API health served the exact new source; database health was up. Realtime health still served its unchanged source `563cbd9eeb859b914f1874b6d2086de11b115f3e`.

## Observation still in progress at initial write

The first scheduled backup after rollout is waiting on the old durable writer lease. Do not force a backup, remove the lease or claim successful backup recovery until a real upload or unchanged-content verification is observed. A bounded 14-request health window is running through this period. Completion evidence will be appended below.

## Preserved limits

An old exhausted SOS still needs human operations review; this repair does not cancel or complete it. Long-term free-host reliability, physical Infinix/XOS behavior, real-device FCM and silent/DND sound, shared Maps key restrictions, signing custody and prior raw realtime misses remain separate recorded limits. The successful current dashboard check does not certify every app journey. Refresh the dated usage meters before making current quota claims.

Private evidence directory: `/Applications/VsCode Works/12. Jeevan App/LOCAL TEST EVIDENCE/2026-10-22-dashboard-repair-230031`. Raw backup and provider files remain private and are excluded from Git. The retained latest full database backup was not overwritten.

## Completed live observation

At 11:33:37 PM IST, the new worker completed a real scheduled increment: 5,648,356 JSON bytes, chain depth 2, snapshot time 11:32:51 PM IST. It reused 27,142,474 existing binary bytes and fetched 4,000,128 newly added binary bytes. Next due: 23 October 2026, 05:32:51 AM IST. The old lease was allowed to expire normally. No backup was forced and no lease was removed.

All 14 bounded live health checks served source `41f51d4` with HTTP 200. Maximum observed response time was 1,004 ms, including the backup processing window. A second authenticated portal check after upload returned HTTP 200 for login, dashboard HTML and dashboard proxy; the dashboard-failure text was absent. Database and unchanged realtime health passed again. This is a short live observation, not a guarantee of future free-tier availability.

The new Drive head and both parents were downloaded directly to the Mac. Source identity, file lengths, SHA256 hashes, parent links and reconstructed data hash passed. The materialized 22-table snapshot is 44,273,682 bytes, at the new snapshot timestamp. Three cloud files totaled 44,290,369 bytes. Export verification performed zero database writes and zero cloud uploads. This recovered snapshot includes the newly added documents. Original retained backup files remain untouched.

Verified local recovery: `/Applications/VsCode Works/12. Jeevan App/LOCAL DATABASE BACKUPS/2026-10-22-worker-recovery/verification.private.json`. Reconstructed snapshot: `materialized-full-v2.private.json` in the same owner-only directory. Earlier pending-observation text above records the state before the scheduled worker completed.

Four-point final scoped review: 89/100, correctness 36/40, completeness 18/20, craft 18/20, verification 8/10, rule adherence 9/10. Scoped dashboard/backup repair is observed live. Earlier constrained-test variability and broader launch limits remain explicit; no new ride-capacity claim is made.

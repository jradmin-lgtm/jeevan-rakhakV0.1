# Drive downloads and incremental backups: local review candidate

Updated 18 October 2026, 12:20 AM IST. Started 17 October. The owner approved link-readable access for only the two existing release APKs, requested a one-click download and localhost review first, and requested advancing backups with changed data. No production backend deployment, new native APK build, paid plan change or hosted load test was performed.

## Local review

Open [download preview](http://127.0.0.1:3101/download-apk). Existing contact form and language choices remain. The local API listens on 127.0.0.1:4100 and saves preview download events only to the isolated local database. It does not start the cloud-backup scheduler. Existing localhost:3100 remains unchanged.

User and driver APKs are the exact existing 2.2.4 build 59 binaries. Both full files were downloaded via the local API's 303 redirect directly from Drive, with exact expected sizes and SHA256. The local backend inspected only bounded metadata/prefix responses; no complete APK was proxied through Render. Patient browser interaction stayed on the portal and showed Download started. The browser automation download-event wait timed out; completion was independently verified through signed-out full HTTP downloads, not represented as a confirmed browser download-manager event. Normal browser/OS install protections are unchanged.

[Browser handoff screenshot](</Applications/VsCode Works/12. Jeevan App/LOCAL PREVIEW/2026-10-17-cost-fixes/download-proof/browser-handoff.png>) | [Full download proof](</Applications/VsCode Works/12. Jeevan App/LOCAL PREVIEW/2026-10-17-cost-fixes/download-proof/verified-full-downloads.json>).

## APK delivery implementation

- Explicit APK_DOWNLOAD_MODE=drive verifies the current file identity, size, service-account download capability and anyone-reader permission. No OAuth token or service-account material enters a redirect URL.
- The server checks an anonymous response for APK ZIP bytes and attachment headers. If Google returns a supported confirmation form, it verifies its fixed Google action and file identity before resolving that confirmation. Unsupported login, quota, redirects or HTML responses fail visibly; there is no silent large-payload proxy fallback.
- A validated portal token is claimed atomically before a 303 redirect, preventing simultaneous reuse. Cache-Control is private/no-store and referrer policy is no-referrer.
- Contact collection and the printed production QR are unchanged. Approved public links can be shared outside the contact form. Existing download counts continue to mean download starts/handoffs, not verified completed transfers. Explicit proxy mode preserves the legacy private-streaming behavior.
- Only the current user/driver APK files gained anyone-with-link reader permission. No folder permission changed. Read-only checks confirmed the private backup folder and last inspected database backup have no anyone access. Credentials, patient backups and signing keys were not shared. Future approved APK publications need per-file link access and signed-out download checks.

## Incremental backup implementation

The six-hour due time and source-specific cooldown remain. At a due snapshot, new/updated rows and deletion hashes form a formatVersion 3 increment linked to the preceding full snapshot or increment. Duplicate rows and tables without a primary key are counted as multisets. Existing binary documents in updated rows are referenced by verified content hash/length rather than uploaded again. New or changed document bytes are included when needed. Unchanged logical data updates verification metadata only.

Each generated increment is applied locally and its complete logical checksum verified before upload. Source identity, parent hash, depth, timestamps, table changes and resulting hash are checked again when reconstructing after restart/export. A chain is bounded to 28 increments, then the next changed snapshot becomes a complete v2 baseline. Parent files and earlier full backups are retained; no cloud cleanup or chain deletion was introduced. The reference chain is required for recovery, so these files must not be deleted independently.

A source-scoped database row lease prevents overlapping deploy instances from uploading simultaneously. Lease ownership is rechecked before remote writes. Jobs have an eight-minute deadline inside a ten-minute lease; busy writers retry metadata after two minutes. An expired lease can be recovered, and an old owner cannot delete another owner's lease. Startup creates the small backup_writer_leases control table. This transient lock table is excluded from recoverable user-data snapshots, so its changes do not trigger another backup. No user/driver/hospital data schema changed.

DB_BACKUP_MODE=incremental selects the new behavior. Explicit full mode supports a controlled legacy-format rollback. After v3 backups exist, an old binary cannot read them directly: create and verify a v2 baseline with the new code before rolling the source back. Never delete chain parents as a quota workaround.

## Verification

| Check | Observed result |
| --- | --- |
| Focused tests | 46 passed, zero failed, zero skipped, including real local PostgreSQL tests |
| Concurrent writers | 12 attempted, exactly one lease winner; stale ownership and expired-lease recovery verified |
| Actual local restore | All typed rows, foreign-key relationships, duplicates and binary bytes matched after increment reconstruction |
| Synthetic first change | 853,950-byte base to 1,525-byte increment; later new binary data included correctly |
| Retained 22-table data rehearsal | 38,479,719-byte full snapshot to 2,733-byte increment for a simulated insert/update/delete; all 129 documents and 27,142,474 decoded bytes preserved |
| Isolated memory rehearsal | 512 MiB container, new codec plus existing API-route module baseline, peak 373.77 MiB RSS, zero network calls |
| API checks | Typecheck/build and both configured gate seams passed in managed checkout; primary typecheck/gate also passed |
| Real APK transfer | Two complete signed-out Drive downloads matched published hashes |
| Production load | No new hosted load, 50-ride certification or universal-device claim |

[PostgreSQL restore and lease proof](</Applications/VsCode Works/12. Jeevan App/LOCAL PREVIEW/2026-10-17-cost-fixes/backup-restore-lease-final/restore-proof.json>) | [Representative 22-table rehearsal](</Applications/VsCode Works/12. Jeevan App/LOCAL PREVIEW/2026-10-17-cost-fixes/representative-increment-proof.private.json>) | [Memory scope and proof](</Applications/VsCode Works/12. Jeevan App/LOCAL PREVIEW/2026-10-17-cost-fixes/memory-rehearsal/proof.json>).

The 2,733-byte representative increment is a measured example, not a fixed future backup size. Changed records and new documents determine the actual size. The container rehearsal is not a full live-server/load certification. Existing realtime-delivery, free-hours availability, physical-device and shared Maps-key limitations remain in the pilot ledger.

## Recovery tools

scripts/export-backup-chain.cjs reads the existing private credential file, selected private backup folder and source-matched Drive chain. It downloads directly to the Mac, verifies sizes/checksums/parents and produces a full v2 snapshot without a database write or cloud upload. Its output directory must be new. scripts/materialize-backup-chain.cjs independently checks a local chain manifest and reconstructs the v2 snapshot. Both tools create owner-only files and refuse missing, tampered, cyclic, cross-source or oversized chains. Database restoration is a separate approved operation into a verified empty target; do not blindly invoke a historical migration script against live data.

## Production rollout remains pending local review

This candidate has not been pushed or deployed. APK-only file sharing is the sole approved external change already applied. The live backend still uses its previous streaming route and complete-backup logic until the reviewed candidate is deployed. Enable APK_DOWNLOAD_MODE=drive and DB_BACKUP_MODE=incremental only on the intended API service, preserving existing accounts and database. Verify the deployed source, unchanged QR/contact flow and first due increment through metadata; do not force a full snapshot just to test it.

Previous bandwidth use cannot be recovered. The 17 October audit read approximately 32.7% of Render bandwidth and 4.7% of Neon transfer, with provider lag/estimate qualifications. APK redirecting removes future APK payload from Render; incremental backups remove repeated document payload from regular increments. Periodic baselines, small requests, actual ride traffic and free running-hours limits still apply. The running-hours estimate's suspended-service inflation is documented but not changed in this two-feature candidate.

Primary source was mirrored only where it matched the pre-change managed version. Its unrelated main.ts and CI edits were preserved with narrow insertions. Other uncommitted work and previous release evidence remain intact.

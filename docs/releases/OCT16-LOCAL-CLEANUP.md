# Local cleanup and recovery

Recorded 16 October 2026, 11:29 AM IST. Scope: local workspace cleanup, context and index refresh. No application behavior, schema, production data, hosting plan, service configuration or signing identity changed. No hosted load test was run.

## Retained and verified

- All 731 inventoried source, feedback, signing and security/evidence files matched their pre-cleanup SHA256 hashes after deletion.
- Existing primary uncommitted work was preserved in place and in a verified recovery archive, including working/staged Git diffs and original statuses. It was not reset or automatically merged into the managed checkout.
- Both current user/driver 2.2.4 code 59 APKs were copied locally from the prior verified public downloads. Exact SHA256, compiled version and Android signing certificate passed. The two APKs and manifest are in `LATEST RELEASE/` beside the primary checkout. Existing artifact copies and rollback/test evidence remain.
- Latest complete database snapshot: **16/10/2026, 06:54:47 IST**, 38,479,719 bytes, 22 tables. Contains 12 users, 19 drivers, 2 hospitals, 234 bookings and 129 documents, 27,142,474 decoded document bytes. Existing Drive file was downloaded directly once to the Mac. Size, MD5, source fingerprint, SHA256, table coverage and document round-trip decoding passed. No Neon/Render snapshot call was made. Later live changes are outside this point-in-time snapshot.
- Consolidated credentials contain literal verified account/environment values and local signing/account references, in `LOCAL PRIVATE/credentials.local.json`, mode 0600 in a mode 0700 directory. Original credential references, signing files and compatibility environment files remain. Nothing private is intentionally published or added to Git. Plaintext is owner-requested and remains a local custody risk.
- All original feedback documents/screenshots remain. Two consolidated DOCX files were copied from Downloads into `JR CHANGES/2026-10-13-Consolidated-UI/` with exact hash checks.
- Primary dependencies, dependency symlinks, active managed admin .next output, review artifacts and local database container remain.

## Removed or consolidated

| Category | Result |
| --- | --- |
| Loose source edit backups | 1,611 files moved into verified private recovery archive |
| Obsolete APK copies | 71 files removed after compiled identity/version checks and current pair verification, about 4.5 GB |
| Earlier database and feedback edit backups | 12 files consolidated into hash-verified private archive, including approved cutoff/native restore proof |
| Inactive primary build/cache directories | 9 removed, 2.31 GB allocated output |
| Total removed loose files | 1,694, 4.95 GB logical file bytes |
| Retained recovery archives | 194.50 MB compressed, source/edit history and earlier database copies |

Logical file sizes and allocated cache sizes are different measurements; these are not an exact before/after free-space claim. Git history and its older binary objects were retained. No broad Git clean or reset was used.

## Recovery

Private recovery folder: `/Applications/VsCode Works/12. Jeevan App/LOCAL ARCHIVE/cleanup-20261016-111949`. Archive manifests map each original absolute path to its member name, SHA256 and byte count. `pre-cleanup-source-and-edit-history.private.tar.gz` preserves edited source and edit history. `earlier-database-and-feedback-edit-backups.private.tar.gz` preserves earlier database snapshots, approved cutoff and native restore archive. Additional documentation pre-edit copies are archived after final edits.

Use the exact manifest to extract a required member into a separate recovery directory and verify its SHA256 before restoring it. Do not bulk-extract across current source, restore a database, or publish an archive automatically. Archives contain credentials and patient/driver data and must remain private. Latest active backup manifest is `LOCAL DATABASE BACKUPS/LATEST.json`; latest APK manifest is `LATEST RELEASE/MANIFEST.json`.

## Evidence limits retained

This cleanup is local, not a new release or full regression run. The earlier hosted ten-ride client recovery passed; original realtime delivery remains 3,667/3,670 FAIL. The RCA reproduced disconnect timing locally but cannot conclusively classify the historical three. Fifty-ride capacity, universal Android/Infinix behavior and physical push/buzzer/DND remain unverified. Shared Maps-key exposure, compatible legacy signing custody and free-service monthly limits remain open. No paid plan is approved. Dated provider readings are not refreshed by copying a report.

[Workspace index](</Applications/VsCode Works/12. Jeevan App/INDEX.md>) | [Current state](../CURRENT-STATE.md) | [Realtime RCA](OCT16-REALTIME-RCA.md)

## Verification after cleanup

Checked 16 October 2026, 11:31 AM IST: 731 protected source/feedback/signing/evidence files match original SHA256; 26 updated documentation/index/ignore files have valid new local link targets and no matches against 70 selected known private values. Older credential references in parent context/version history were replaced by private-file pointers; exact original text remains private and recoverable. Both existing gate seams pass in both checkouts. Twenty-two focused local realtime tests passed, zero failed. No new hosted load or full build was run.

Read-only smoke checks returned HTTP 200 for the running local admin login, UI review and budget report, plus the deployed API and realtime health routes. Both live builds still report 563cbd9. This verifies those routes, not a new full booking/Maps/notification journey.

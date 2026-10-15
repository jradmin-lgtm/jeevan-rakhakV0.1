# Independent source council: 15 October 2026

**Verdict: SHIP for candidate source and isolated hosted testing. Score: 89/100.** This is not production runtime or deployment certification.

Candidate: `d8c084af843b800f473b98581d398aea2df9af8b`. The review compared the Oct13/15 changes against baseline `dd242cc`.

| Area | Score |
| --- | --- |
| Correctness | 36/40 |
| Completeness | 18/20 |
| Craft | 18/20 |
| Evidence | 7/10 |
| Rules | 10/10 |

## Resolved finding

Existing map markers retained their original labels after pickup, despite updated screen state. Both Leaflet and Google marker update paths now refresh driver and destination labels, including stationary markers. Independently ran `node --test packages/ui/test/mapFallback.test.cjs`: all 12 tests passed, including phase changes without recreating the map. This resolves the prior material source blocker.

## Review coverage

No remaining material source blocker found in admin operation authorization, idempotency and offline holds; partial GPS ownership and acknowledgement handling; backup cooldown, binary cache validation and errors; pending expiry timer lifecycle; or guarded restore procedure.

Earlier independent targeted run: 57 passed, one actual PostgreSQL backup test skipped because its database environment was not supplied. The parent subsequently reports actual PostgreSQL backup tests 7/7 without skips, workspace build 7/7 and checks 10/10. These are supporting reports, not this reviewer's execution.

Hosted runner and Neon scaffolding were authored by this reviewer. Their checks are self-review and require another reviewer for independence. Backup scheduling assumes the documented single active writer; its durable cooldown is not a distributed lease.

## Pending runtime evidence

- Hosted 50-ride load testing and production cutover are not verified by this source review.
- Portal UI testing remains pending. The approved in-app browser runtime returned no available browser. Desktop control twice rejected opening a test tab because the user changed Chrome. Testing stopped to avoid competing with the user. No portal login or mutation occurred.
- Native rendering and notification delivery require the separate native QA evidence. This review does not certify all Android variants or the unavailable physical Infinix device.
- Restore execution belongs to the separate database rehearsal; this review checked its guards and source only.

## Final reviewed source hashes

SHA-256:

- `packages/ui/src/maps/embedHtml.ts`: `608fc93de6b1e4d775d2b489b1fe739af57d09d8f3571f0c6ca84c1a78861a53`
- `packages/ui/test/mapFallback.test.cjs`: `98aaf300b85778586e08a642075e55a0d599acdc8869495cd5619cd627ba37a2`
- `services/api-server/src/routes/admin-operations.ts`: `536a746efd5de572d64c5e9952b27e2a263939b9a491b07882557239eca061f4`
- `services/api-server/src/routes/location-batch.ts`: `769ba074225634306efd4d621031c96cc5e428949d8046e1fd3d7e9d1eece9e3`
- `services/api-server/src/backup.ts`: `3df198ffd5232f4c74d5efefc7f86db2fc3689709a0a6f7af6534a3f605ac7eb`
- `services/api-server/src/booking-maintenance.ts`: `771ed55c869c2ba08312beb274d2a459cf6d37733a29b581ae8e9999ba9d6350`

## Subsequent backup upload suppression change

After the reviewed d8c084a candidate, this reviewer implemented conservative complete-content duplicate upload suppression in backup.ts and backup-transfer.test.cjs. Identical verified source-matched contents update only Drive metadata, preserving original capture time and recording Drive `jrBackupCheckedAt` separately from original `jrBackupTakenAt`. The log reports this as `verifiedUnchangedAt`. Changed contents still upload complete format2 snapshots. Canonical hashing ignores table row/object-key order but preserves nested array order and duplicate rows. Invalid timestamps, corrupt prior content and failed metadata updates fail loudly. Different-source backups cannot suppress uploads.

Independent backend review of this addition passed. The separate native reviewer's final backup/runner/restore council passed at 91/100, recorded in `jr-feedback-20261015/INDEPENDENT-BACKUP-LOAD-RESTORE-REVIEW.md`. The original 89/100 score above retains its original candidate scope; the later review covers this self-authored delta. Hosted and production verification remain separate gates. Actual isolated PostgreSQL test run: 13/13 passed, zero skips. API TypeScript check passed. Only the two owned files were mirrored to primary after validation. No commit, push or deployment was performed by this reviewer. Full active-service backups and API-streamed APKs still consume outbound bandwidth.

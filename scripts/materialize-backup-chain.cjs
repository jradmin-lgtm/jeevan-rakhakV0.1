#!/usr/bin/env node
'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { materializeBackup, snapshotDataHash, MAX_DEPTH } = require('../packages/utils/backupCodec.cjs');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function materializeFiles({ manifestPath, expectedSource, outputPath, reportPath }) {
  assert.match(expectedSource, /^[a-f0-9]{64}$/, 'An explicitly selected source fingerprint is required');
  const root = path.dirname(fs.realpathSync(manifestPath)), manifest = JSON.parse(fs.readFileSync(manifestPath));
  assert.equal(manifest.source, expectedSource, 'Manifest source differs from selected source');
  assert.ok(Array.isArray(manifest.files) && manifest.files.length > 0 && manifest.files.length <= MAX_DEPTH + 1, 'Backup chain inventory is missing or oversized');
  const entries = new Map(); let total = 0;
  for (const row of manifest.files) {
    assert.match(row.file?.id ?? '', /^[\w-]{1,200}$/, 'Invalid backup file ID');
    assert.ok(!entries.has(row.file.id), 'Duplicate backup file ID');
    assert.match(row.sha256 ?? '', /^[a-f0-9]{64}$/, 'Every downloaded file needs its verified SHA256');
    assert.equal(typeof row.path, 'string');
    const file = path.resolve(root, row.path), relative = path.relative(root, file);
    assert.ok(relative !== '' && relative !== '..' && !relative.startsWith('../') && !path.isAbsolute(relative), 'Backup file escapes the selected directory');
    const real = fs.realpathSync(file); assert.equal(real, file, 'Symlinked backup file is not allowed');
    const stat = fs.statSync(file); assert.ok(stat.isFile() && stat.size <= 128 * 1024 * 1024, 'Backup file is missing or too large');
    total += stat.size; assert.ok(total <= 256 * 1024 * 1024, 'Backup chain exceeds safe local memory budget');
    const bytes = fs.readFileSync(file); assert.equal(sha(bytes), row.sha256, 'Backup content differs from the approved download');
    entries.set(row.file.id, { file: row.file, payload: JSON.parse(bytes) });
  }
  const head = entries.get(manifest.headFileId); assert.ok(head, 'Selected backup head is missing');
  const restored = await materializeBackup(head, expectedSource, async id => {
    const entry = entries.get(id); assert.ok(entry, 'Required backup parent is missing'); return entry;
  });
  const bytes = Buffer.from(JSON.stringify(restored.snapshot));
  const report = { formatVersion: 2, sourceFingerprint: expectedSource, takenAt: restored.snapshot.takenAt, depth: restored.depth, tables: Object.fromEntries(Object.entries(restored.snapshot.tables).map(([k, rows]) => [k, rows.length])), dataHash: snapshotDataHash(restored.snapshot), fileSha256: sha(bytes), fileBytes: bytes.length, databaseWrites: 0, filesRead: entries.size, sourceBytesRead: total };
  fs.writeFileSync(outputPath, bytes, { mode: 0o600, flag: 'wx' });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), { mode: 0o600, flag: 'wx' });
  return report;
}
module.exports = { materializeFiles };
if (require.main === module) {
  const args = process.argv.slice(2), option = name => { const i = args.indexOf(name); if (i < 0 || !args[i + 1]) throw Error(`Missing ${name}`); return args[i + 1]; };
  Promise.resolve().then(() => materializeFiles({ manifestPath: option('--manifest'), expectedSource: option('--source'), outputPath: option('--out'), reportPath: option('--report') })).then(r => console.log(JSON.stringify({ materialized: true, tables: Object.keys(r.tables).length, depth: r.depth, databaseWrites: 0 }))).catch(e => { console.error('Materialization failed:', e.message); process.exitCode = 1; });
}

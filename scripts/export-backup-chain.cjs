#!/usr/bin/env node
'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { GoogleAuth } = require('../services/api-server/node_modules/google-auth-library');
const { MAX_DEPTH } = require('../packages/utils/backupCodec.cjs');
const { materializeFiles } = require('./materialize-backup-chain.cjs');
async function exportChain({ credentialsPath, folderId, outputDirectory, fetcher = fetch }) {
  const stat = fs.statSync(credentialsPath); assert.equal(stat.mode & 0o077, 0, 'Credentials file must be owner-only');
  assert.equal(stat.uid, process.getuid(), 'Credentials file owner differs');
  const config = JSON.parse(fs.readFileSync(credentialsPath));
  const env = config.accountsAndEnvironment?.apiEnvironmentSnapshot?.values;
  assert.ok(env?.DATABASE_URL && env?.DRIVE_SA_JSON, 'Verified API configuration is missing');
  const folder = folderId ?? env.DB_BACKUP_FOLDER_ID;
  assert.match(folder ?? '', /^[\w-]{10,200}$/, 'Supply the explicitly selected private backup folder ID');
  const u = new URL(env.DATABASE_URL), source = crypto.createHash('sha256').update(`${u.username}@${u.hostname.toLowerCase()}:${u.port || '5432'}${u.pathname}`).digest('hex');
  const auth = new GoogleAuth({ credentials: JSON.parse(env.DRIVE_SA_JSON), scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
  const token = (await (await auth.getClient()).getAccessToken()).token; assert.ok(token, 'Drive access token unavailable');
  const root = path.resolve(outputDirectory); fs.mkdirSync(root, { mode: 0o700, recursive: false });
  async function read(url) {
    const response = await fetcher(url, { redirect: 'error', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(120_000) });
    if (!response.ok) { await response.body?.cancel(); throw Error(`Drive export failed: HTTP ${response.status}`); }
    return response;
  }
  const query = new URLSearchParams({ q: `'${folder}' in parents and trashed=false and name contains 'jr-db-backup-' and appProperties has { key='jrBackupSource' and value='${source}' }`, fields: 'files(id,size,createdTime,appProperties)', orderBy: 'createdTime desc', pageSize: '1', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true', corpora: 'allDrives' });
  const listing = await (await read('https://www.googleapis.com/drive/v3/files?' + query)).json();
  assert.equal(listing.files?.length, 1, 'Source-matched backup missing');
  const head = listing.files[0].id, seen = new Set(), files = []; let current = listing.files[0], total = 0;
  for (;;) {
    assert.match(current?.id ?? '', /^[\w-]{1,200}$/, 'Invalid backup file ID');
    assert.ok(!seen.has(current.id) && seen.size <= MAX_DEPTH, 'Cyclic or oversized backup chain');
    assert.equal(current.appProperties?.jrBackupSource, source, 'Backup parent crosses source identity');
    const size = Number(current.size); assert.ok(Number.isSafeInteger(size) && size > 0 && size <= 128 * 1024 * 1024, 'Invalid backup size');
    total += size; assert.ok(total <= 128 * 1024 * 1024, 'Chain exceeds bounded export size'); seen.add(current.id);
    const response = await read(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(current.id)}?alt=media&supportsAllDrives=true`);
    assert.ok(response.body, 'Backup has no content');
    const chunks = []; let n = 0;
    for await (const value of response.body) { n += value.length; assert.ok(n <= size, 'Backup length exceeds metadata'); chunks.push(Buffer.from(value)); }
    assert.equal(n, size, 'Backup length mismatch');
    const bytes = Buffer.concat(chunks), payload = JSON.parse(bytes), name = current.id + '.json';
    fs.writeFileSync(path.join(root, name), bytes, { flag: 'wx', mode: 0o600 });
    files.push({ file: current, path: name, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
    if (payload.formatVersion === 2) break;
    assert.equal(payload.formatVersion, 3, 'Unsupported backup format'); assert.equal(payload.source, source, 'Increment source differs');
    assert.match(payload.parentFileId ?? '', /^[\w-]{1,200}$/, 'Invalid parent ID');
    const query = new URLSearchParams({ supportsAllDrives: 'true', fields: 'id,size,createdTime,appProperties' });
    current = await (await read(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(payload.parentFileId)}?${query}`)).json();
  }
  const manifestPath = path.join(root, 'chain-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ source, headFileId: head, files }, null, 2), { flag: 'wx', mode: 0o600 });
  return materializeFiles({ manifestPath, expectedSource: source, outputPath: path.join(root, 'materialized-full-v2.private.json'), reportPath: path.join(root, 'verification.private.json') });
}
module.exports = { exportChain };
if (require.main === module) {
  const args = process.argv.slice(2), option = name => { const i = args.indexOf(name); if (i < 0 || !args[i + 1]) throw Error(`Missing ${name}`); return args[i + 1]; };
  Promise.resolve().then(() => exportChain({ credentialsPath: option('--credentials'), folderId: option('--folder'), outputDirectory: option('--out') })).then(r => console.log(JSON.stringify({ exportVerified: true, tables: Object.keys(r.tables).length, depth: r.depth, databaseWrites: 0, backupUploads: 0 }))).catch(e => { console.error('Export failed:', e.message); process.exitCode = 1; });
}

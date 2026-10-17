'use strict';
const { createHash } = require('node:crypto');
const MAX_DEPTH = 28;
const hash = value => createHash('sha256').update(value).digest('hex');
const isHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const own = (object, key) => Object.hasOwn(object, key);
function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function timestamp(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw Error('Invalid backup timestamp');
}
function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (record(value)) return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  throw Error('Backup contains a non-JSON value');
}
function encodedBinary(value) {
  if (!record(value) || !own(value, '__bytea__')) return null;
  if (Object.keys(value).length !== 1 || typeof value.__bytea__ !== 'string') throw Error('Invalid binary wrapper');
  const encoded = value.__bytea__, alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  if (encoded.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw Error('Invalid binary encoding');
  if (encoded.endsWith('==') && (alphabet.indexOf(encoded.at(-3)) & 15) !== 0) throw Error('Invalid binary encoding');
  if (!encoded.endsWith('==') && encoded.endsWith('=') && (alphabet.indexOf(encoded.at(-2)) & 3) !== 0) throw Error('Invalid binary encoding');
  return encoded;
}
function binary(value) {
  const encoded = encodedBinary(value); if (encoded === null) return null;
  const bytes = Buffer.from(encoded, 'base64'); return { key: hash(bytes) + ':' + bytes.length, encoded };
}
function validateValue(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return;
  if (Array.isArray(value)) { for (const item of value) validateValue(item); return; }
  if (record(value)) { for (const item of Object.values(value)) validateValue(item); return; }
  throw Error('Backup contains a non-JSON value');
}
function validateSnapshot(snapshot) {
  if (!record(snapshot) || snapshot.formatVersion !== 2 || !record(snapshot.tables)) throw Error('A complete formatVersion 2 snapshot is required');
  timestamp(snapshot.takenAt);
  for (const rows of Object.values(snapshot.tables)) {
    if (!Array.isArray(rows)) throw Error('Invalid backup table');
    for (const row of rows) {
      if (!record(row)) throw Error('Invalid backup row');
      validateValue(row);
      for (const value of Object.values(row)) { encodedBinary(value); if (record(value) && own(value, '__bytea_ref__')) throw Error('Unresolved binary reference'); }
    }
  }
}
function snapshotDataHash(snapshot) {
  validateSnapshot(snapshot);
  const digest = createHash('sha256'); digest.update('{');
  for (const [index, table] of Object.keys(snapshot.tables).sort().entries()) {
    digest.update(`${index ? ',' : ''}${JSON.stringify(table)}:[`);
    const rows = snapshot.tables[table].map(canonical).sort();
    for (const [n, row] of rows.entries()) digest.update(`${n ? ',' : ''}${row}`);
    digest.update(']');
  }
  return digest.update('}').digest('hex');
}
function blobIndex(snapshot) {
  const blobs = new Map();
  for (const rows of Object.values(snapshot.tables)) for (const row of rows) for (const value of Object.values(row)) {
    const b = binary(value); if (b) blobs.set(b.key, b.encoded);
  }
  return blobs;
}
function rowIndex(rows) {
  const map = new Map();
  for (const row of rows) {
    const json = canonical(row), key = hash(json), current = map.get(key);
    if (current && canonical(current.row) !== json) throw Error('Row checksum collision');
    map.set(key, { row, count: (current?.count ?? 0) + 1 });
  }
  return map;
}
function pack(row, previousBlobs) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => {
    const b = binary(value); return [key, b && previousBlobs.has(b.key) ? { __bytea_ref__: b.key } : value];
  }));
}
function unpack(row, previousBlobs) {
  if (!record(row)) throw Error('Invalid incremental row');
  return Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (!record(value) || !own(value, '__bytea_ref__')) { encodedBinary(value); return [key, value]; }
    if (Object.keys(value).length !== 1 || typeof value.__bytea_ref__ !== 'string' || !previousBlobs.has(value.__bytea_ref__)) throw Error('Missing or invalid incremental binary reference');
    return [key, { __bytea__: previousBlobs.get(value.__bytea_ref__) }];
  }));
}
function createIncrement(previous, current, { parentFileId, source, parentDepth = 0 }) {
  validateSnapshot(previous); validateSnapshot(current);
  if (!/^[\w-]{1,200}$/.test(parentFileId) || !isHash(source)) throw Error('Invalid incremental source or parent');
  if (!Number.isInteger(parentDepth) || parentDepth < 0 || parentDepth >= MAX_DEPTH) throw Error('Incremental chain requires a new full baseline');
  if (Date.parse(current.takenAt) < Date.parse(previous.takenAt)) throw Error('Incremental time precedes parent');
  const blobs = blobIndex(previous), patches = [];
  for (const name of Object.keys(current.tables).sort()) {
    const before = rowIndex(own(previous.tables, name) ? previous.tables[name] : []), after = rowIndex(current.tables[name]);
    const removed = [], added = [];
    for (const [key, row] of before) {
      const count = row.count - (after.get(key)?.count ?? 0); if (count > 0) removed.push({ hash: key, count });
    }
    for (const [key, row] of after) {
      const count = row.count - (before.get(key)?.count ?? 0);
      for (let i = 0; i < count; i++) added.push(pack(row.row, blobs));
    }
    if (!own(previous.tables, name) || removed.length || added.length) patches.push([name, { removed, added, created: !own(previous.tables, name) }]);
  }
  const patch = { formatVersion: 3, kind: 'incremental', takenAt: current.takenAt, source, parentFileId, parentDataHash: snapshotDataHash(previous), resultDataHash: snapshotDataHash(current), depth: parentDepth + 1, droppedTables: Object.keys(previous.tables).filter(name => !own(current.tables, name)).sort(), tables: Object.fromEntries(patches) };
  applyIncrement(previous, patch, source);
  return patch;
}
function applyIncrement(previous, patch, source) {
  validateSnapshot(previous);
  if (!record(patch) || patch.formatVersion !== 3 || patch.kind !== 'incremental' || patch.source !== source || !isHash(source) || !record(patch.tables) || !Array.isArray(patch.droppedTables)) throw Error('Invalid incremental backup or source');
  timestamp(patch.takenAt);
  if (!Number.isInteger(patch.depth) || patch.depth < 1 || patch.depth > MAX_DEPTH || !/^[\w-]{1,200}$/.test(patch.parentFileId)) throw Error('Invalid incremental chain depth or parent');
  if (Date.parse(patch.takenAt) < Date.parse(previous.takenAt) || patch.parentDataHash !== snapshotDataHash(previous)) throw Error('Incremental parent checksum or time mismatch');
  const blobs = blobIndex(previous), tables = Object.fromEntries(Object.entries(previous.tables).map(([k, rows]) => [k, [...rows]]));
  const removedTables = new Set();
  for (const name of patch.droppedTables) {
    if (typeof name !== 'string' || !own(tables, name) || own(patch.tables, name) || removedTables.has(name)) throw Error('Invalid dropped table');
    removedTables.add(name); delete tables[name];
  }
  for (const [name, item] of Object.entries(patch.tables)) {
    if (!record(item) || !Array.isArray(item.removed) || !Array.isArray(item.added) || typeof item.created !== 'boolean' || item.created === own(tables, name)) throw Error('Invalid incremental table patch');
    const existing = rowIndex(own(tables, name) ? tables[name] : []), seen = new Set();
    for (const removal of item.removed) {
      if (!record(removal) || !isHash(removal.hash) || !Number.isSafeInteger(removal.count) || removal.count <= 0 || seen.has(removal.hash)) throw Error('Invalid incremental row deletion');
      seen.add(removal.hash); const row = existing.get(removal.hash);
      if (!row || row.count < removal.count) throw Error('Incremental row deletion exceeds parent');
      row.count -= removal.count;
    }
    const rows = [];
    for (const row of existing.values()) for (let i = 0; i < row.count; i++) rows.push(row.row);
    for (const row of item.added) rows.push(unpack(row, blobs));
    Object.defineProperty(tables, name, { value: rows, enumerable: true, configurable: true, writable: true });
  }
  const snapshot = { formatVersion: 2, takenAt: patch.takenAt, tables };
  if (snapshotDataHash(snapshot) !== patch.resultDataHash) throw Error('Incremental result checksum mismatch');
  return snapshot;
}
/** Downloader returns {file:{id,appProperties},payload}; every parent is source checked. */
async function materializeBackup(head, source, download) {
  const seen = new Set(), chain = []; let entry = head;
  for (;;) {
    if (!record(entry) || !record(entry.file) || !record(entry.payload) || seen.has(entry.file.id)) throw Error('Missing or cyclic backup chain');
    if (entry.file.appProperties?.jrBackupSource !== source) throw Error('Backup chain crosses source identity');
    seen.add(entry.file.id);
    if (entry.payload.formatVersion === 2) {
      validateSnapshot(entry.payload);
      if (entry.file.appProperties.jrBackupTakenAt !== undefined && entry.payload.takenAt !== entry.file.appProperties.jrBackupTakenAt) throw Error('Previous Drive snapshot takenAt does not match metadata');
      const recorded = entry.file.appProperties.jrBackupDataHash;
      if (recorded !== undefined && recorded !== snapshotDataHash(entry.payload)) throw Error('Previous Drive snapshot dataHash mismatch');
      let snapshot = entry.payload, depth = 0;
      for (const child of chain.reverse()) {
        if (child.payload.depth !== depth + 1 || child.file.appProperties.jrBackupDataHash !== child.payload.resultDataHash || child.file.appProperties.jrBackupTakenAt !== child.payload.takenAt) throw Error('Incremental chain metadata mismatch');
        snapshot = applyIncrement(snapshot, child.payload, source); depth++;
      }
      return { snapshot, depth };
    }
    if (entry.payload.formatVersion !== 3 || entry.payload.source !== source || chain.length >= MAX_DEPTH) throw Error('Invalid or oversized backup chain');
    chain.push(entry); entry = await download(entry.payload.parentFileId);
  }
}
module.exports = { MAX_DEPTH, canonical, validateSnapshot, snapshotDataHash, createIncrement, applyIncrement, materializeBackup };

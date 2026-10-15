#!/usr/bin/env node
const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const postgres = require('../packages/db/node_modules/postgres');
const quote = value => '"' + value.replaceAll('"', '""') + '"';
const tableSql = name => '"public".' + quote(name);
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

function guardTarget(env) {
  assert.equal(env.NEON_PROJECT_ID, 'soft-wave-50441469', 'Restore is limited to the explicitly authorized alternate project');
  const url = new URL(env.DATABASE_URL);
  assert.equal(url.pathname, '/jr_restore_oct15_v1', 'Restore requires the separate rehearsal database');
  assert.equal(env.RESTORE_TARGET_DATABASE, 'jr_restore_oct15_v1', 'Explicit rehearsal target required');
  assert.equal(url.hostname, env.EXPECTED_DATABASE_HOST, 'Restore hostname differs from API-verified alternate project');
  assert.ok(url.hostname.endsWith('.neon.tech'), 'Hosted Neon target required');
  assert.ok(['require', 'verify-full'].includes(url.searchParams.get('sslmode')), 'Restore requires explicit TLS sslmode=require or verify-full');
  assert.match(env.EXPECTED_SNAPSHOT_SHA256 ?? '', /^[a-f0-9]{64}$/, 'Approved snapshot SHA256 is mandatory');
  assert.ok(typeof env.EXPECTED_SNAPSHOT_TAKEN_AT === 'string' && Number.isFinite(Date.parse(env.EXPECTED_SNAPSHOT_TAKEN_AT)), 'Approved snapshot cutoff is mandatory');
}
function topologicalOrder(names, relations) {
  const remaining = new Set(names), ordered = [];
  for (const {child,parent} of relations) if (remaining.has(child) && !remaining.has(parent)) throw Error(`Backup is missing referenced table ${parent}`);
  while (remaining.size) {
    const ready = [...remaining].filter(name => !relations.some(r => r.child === name && remaining.has(r.parent))).sort();
    if (!ready.length) throw Error('Foreign-key cycle prevents an ordered restore');
    for (const name of ready) { remaining.delete(name); ordered.push(name); }
  }
  return ordered;
}
function prepareSnapshot(snapshot, columns) {
  if (!snapshot || snapshot.formatVersion !== 2 || typeof snapshot.takenAt !== 'string' || !Number.isFinite(Date.parse(snapshot.takenAt)) || !snapshot.tables || typeof snapshot.tables !== 'object' || Array.isArray(snapshot.tables)) throw Error('A complete formatVersion 2 snapshot is required');
  const plan = {};
  for (const [name, rows] of Object.entries(snapshot.tables)) {
    if (!Array.isArray(rows)) throw Error(`Invalid source table ${name}`);
    const target = columns.filter(c => c.table_name === name);
    if (!target.length) throw Error(`Missing target table ${name}`);
    let keys = null;
    const binary = {};
    const prepared = rows.map(row => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw Error(`Invalid source row in ${name}`);
      const current = Object.keys(row).sort();
      if (keys && JSON.stringify(keys) !== JSON.stringify(current)) throw Error(`Inconsistent source columns in ${name}`);
      keys = current;
      const value = {};
      for (const key of current) {
        const column = target.find(c => c.column_name === key);
        if (!column) throw Error(`Missing target column ${name}.${key}`);
        if (column.is_generated === 'ALWAYS') throw Error(`Generated source column requires explicit restore support: ${name}.${key}`);
        if (column.data_type !== 'bytea' || row[key] === null) { value[key] = row[key]; continue; }
        const source = row[key];
        if (!source || typeof source !== 'object' || Object.keys(source).length !== 1 || typeof source.__bytea__ !== 'string') throw Error(`Invalid binary wrapper in ${name}.${key}`);
        const bytes = Buffer.from(source.__bytea__, 'base64');
        if (bytes.toString('base64') !== source.__bytea__) throw Error(`Invalid binary encoding in ${name}.${key}`);
        value[key] = '\\x' + bytes.toString('hex');
        const aggregate = binary[key] ??= { count: 0, bytes: 0, hashes: [] };
        aggregate.count++; aggregate.bytes += bytes.length; aggregate.hashes.push(digest(bytes) + ':' + bytes.length);
      }
      return value;
    });
    for (const b of Object.values(binary)) { b.checksum = digest(b.hashes.sort().join('')); delete b.hashes; }
    plan[name] = { rows: prepared, columns: keys ?? [], omitted: target.filter(c => !keys?.includes(c.column_name)).map(c => c.column_name), binary };
  }
  return plan;
}
function chunks(rows) {
  const batches = []; let batch = [], size = 0;
  for (const row of rows) {
    const bytes = Buffer.byteLength(JSON.stringify(row));
    if (batch.length && (batch.length >= 100 || size + bytes > 1_000_000)) { batches.push(batch); batch = []; size = 0; }
    batch.push(row); size += bytes;
  }
  if (batch.length) batches.push(batch);
  return batches;
}
async function restoreSnapshot({env, snapshotPath, reportPath}) {
  guardTarget(env);
  const source = fs.readFileSync(snapshotPath), snapshot = JSON.parse(source);
  assert.equal(digest(source), env.EXPECTED_SNAPSHOT_SHA256, 'Snapshot differs from the approved source file');
  assert.equal(snapshot.takenAt, env.EXPECTED_SNAPSHOT_TAKEN_AT, 'Snapshot cutoff differs from approved source');
  const sql = postgres(env.DATABASE_URL, {max:1, onnotice(){}});
  try {
    const [identity] = await sql`SELECT current_database() AS name`;
    assert.equal(identity.name, env.RESTORE_TARGET_DATABASE, 'Connected database differs from approved restore target');
    const columns = await sql`SELECT table_name,column_name,data_type,is_generated FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`;
    const plan = prepareSnapshot(snapshot, columns);
    const relations = await sql`SELECT child.relname AS child,parent.relname AS parent FROM pg_constraint con JOIN pg_class child ON child.oid=con.conrelid JOIN pg_namespace cn ON cn.oid=child.relnamespace JOIN pg_class parent ON parent.oid=con.confrelid JOIN pg_namespace pn ON pn.oid=parent.relnamespace WHERE con.contype='f' AND cn.nspname='public' AND pn.nspname='public'`;
    const order = topologicalOrder(Object.keys(plan), relations);
    const tables = [...new Set(columns.map(c=>c.table_name))].sort();
    const result = await sql.begin(async tx => {
      await tx`SET LOCAL TIME ZONE 'UTC'`;
      await tx.unsafe('LOCK TABLE ' + tables.map(tableSql).join(',') + ' IN ACCESS EXCLUSIVE MODE');
      for (const name of tables) {
        const [row] = await tx.unsafe(`SELECT count(*)::int AS n FROM ${tableSql(name)}`);
        if (row.n !== 0) throw Error(`Restore refuses nonempty target table ${name}`);
      }
      const verified = [];
      for (const name of order) {
        const item = plan[name], expectedHashes = [];
        for (const batch of chunks(item.rows)) {
          const fields = item.columns.map(quote).join(',');
          const inserted = await tx.unsafe(`WITH input AS (SELECT * FROM json_populate_recordset(NULL::${tableSql(name)},$1::json)), saved AS (INSERT INTO ${tableSql(name)} (${fields}) SELECT ${fields} FROM input RETURNING 1) SELECT encode(sha256(convert_to((to_jsonb(i)-$2::text[])::text,'UTF8')),'hex') AS hash, (SELECT count(*)::int FROM saved) AS inserted FROM input i`, [batch, item.omitted]);
          assert.equal(inserted.length, batch.length, `Insert acknowledgement mismatch in ${name}`);
          if (inserted.some(r=>r.inserted !== batch.length)) throw Error(`Partial restore insert in ${name}`);
          expectedHashes.push(...inserted.map(r=>r.hash));
        }
        const [actual] = await tx.unsafe(`SELECT count(*)::int AS n, encode(sha256(convert_to(coalesce(string_agg(hash,'' ORDER BY hash),''),'UTF8')),'hex') AS checksum FROM (SELECT encode(sha256(convert_to((to_jsonb(t)-$1::text[])::text,'UTF8')),'hex') AS hash FROM ${tableSql(name)} t) records`, [item.omitted]);
        assert.equal(actual.n, item.rows.length, `Row count mismatch in ${name}`);
        assert.equal(actual.checksum, digest(expectedHashes.sort().join('')), `Typed row checksum mismatch in ${name}`);
        for (const [column, expected] of Object.entries(item.binary)) {
          const [bytes] = await tx.unsafe(`SELECT count(*)::int AS n, coalesce(sum(octet_length(${quote(column)})),0)::text AS bytes, encode(sha256(convert_to(coalesce(string_agg(encode(sha256(${quote(column)}),'hex')||':'||octet_length(${quote(column)})::text,'' ORDER BY encode(sha256(${quote(column)}),'hex')||':'||octet_length(${quote(column)})::text),''),'UTF8')),'hex') AS checksum FROM ${tableSql(name)} WHERE ${quote(column)} IS NOT NULL`);
          assert.equal(bytes.n, expected.count, `Binary count mismatch in ${name}.${column}`);
          assert.equal(bytes.bytes, String(expected.bytes), `Binary length mismatch in ${name}.${column}`);
          assert.equal(bytes.checksum, expected.checksum, `Binary checksum mismatch in ${name}.${column}`);
        }
        verified.push({table:name,rows:actual.n,typedRowChecksum:actual.checksum,binary:item.binary});
      }
      const sequences = await tx`SELECT DISTINCT sn.nspname AS schema,s.relname AS sequence,t.relname AS table_name,a.attname AS column_name,p.seqstart::text AS start FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum JOIN pg_class t ON t.oid=d.adrelid JOIN pg_namespace tn ON tn.oid=t.relnamespace JOIN pg_depend dep ON dep.classid='pg_attrdef'::regclass AND dep.objid=d.oid AND dep.refclassid='pg_class'::regclass JOIN pg_class s ON s.oid=dep.refobjid AND s.relkind='S' JOIN pg_namespace sn ON sn.oid=s.relnamespace JOIN pg_sequence p ON p.seqrelid=s.oid WHERE tn.nspname='public'`;
      const reseeded = [];
      for (const sequence of sequences) {
        const [max] = await tx.unsafe(`SELECT max(CASE WHEN ${quote(sequence.column_name)}::text ~ '^[0-9]+$' THEN ${quote(sequence.column_name)}::text::bigint END)::text AS value FROM ${tableSql(sequence.table_name)}`);
        const next = max.value === null ? BigInt(sequence.start) : BigInt(max.value)+1n;
        const value = next > BigInt(sequence.start) ? next : BigInt(sequence.start);
        await tx.unsafe(`ALTER SEQUENCE ${quote(sequence.schema)}.${quote(sequence.sequence)} RESTART WITH ${value}`);
        reseeded.push({sequence:sequence.sequence,next:value.toString()});
      }
      return {sourceTakenAt:snapshot.takenAt,sourceFreshness:env.SOURCE_SNAPSHOT_POLICY ?? 'UNVERIFIED, rehearsal only',sourceSha256:digest(source),formatVersion:snapshot.formatVersion,targetDatabase:env.RESTORE_TARGET_DATABASE,projectId:env.NEON_PROJECT_ID,tables:verified,sequences:reseeded,allRowsVerified:true,allBinaryBytesVerified:true,committedAtomically:true};
    });
    fs.writeFileSync(reportPath,JSON.stringify(result,null,2),{mode:0o600});
    return result;
  } finally { await sql.end(); }
}
module.exports={guardTarget,topologicalOrder,prepareSnapshot,chunks,restoreSnapshot};
if(require.main===module){
 const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);if(i<0||!args[i+1])throw Error(`Missing ${name}`);return args[i+1]};
 Promise.resolve().then(()=>restoreSnapshot({env:JSON.parse(fs.readFileSync(option('--env'))),snapshotPath:option('--snapshot'),reportPath:option('--report')})).then(r=>console.log(JSON.stringify({event:'restore.rehearsal.verified',tables:r.tables.length,rows:r.tables.reduce((n,t)=>n+t.rows,0),binaryBytes:r.tables.reduce((n,t)=>n+Object.values(t.binary).reduce((a,b)=>a+b.bytes,0),0),freshness:r.sourceFreshness}))).catch(error=>{console.error('Restore failed:',error.message);process.exitCode=1});
}

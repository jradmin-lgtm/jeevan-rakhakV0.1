import { randomUUID } from 'node:crypto';
import { sql as pgClient } from '@jr/db';
export const BACKUP_LEASE_MS = 10 * 60 * 1000;
export const BACKUP_JOB_TIMEOUT_MS = 8 * 60 * 1000;
/** A durable row lease works through transaction pooling and across deploy instances. */
export async function acquireBackupLease(source: string): Promise<null | { assertOwned(): Promise<void>; release(): Promise<void> }> {
  if (!/^[a-f0-9]{64}$/.test(source)) throw new Error('Invalid backup lease source');
  const owner = randomUUID();
  const acquired = await pgClient`
    INSERT INTO backup_writer_leases(source,owner,expires_at)
    VALUES(${source},${owner},clock_timestamp() + interval '10 minutes')
    ON CONFLICT(source) DO UPDATE SET owner=EXCLUDED.owner,expires_at=EXCLUDED.expires_at
    WHERE backup_writer_leases.expires_at <= clock_timestamp()
    RETURNING owner`;
  if (acquired.length === 0) return null;
  return {
    async assertOwned() {
      const rows = await pgClient`SELECT owner FROM backup_writer_leases WHERE source=${source} AND owner=${owner} AND expires_at > clock_timestamp()`;
      if (rows.length !== 1) throw new Error('Backup writer lease expired or changed; upload refused');
    },
    async release() { await pgClient`DELETE FROM backup_writer_leases WHERE source=${source} AND owner=${owner}`; }
  };
}

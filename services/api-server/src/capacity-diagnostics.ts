import { readFileSync } from 'node:fs';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

type CounterSnapshot = { available: false; reason: string } | { available: true; version: 'v1' | 'v2'; periods: number; throttledPeriods: number; throttledMicroseconds: number; limitCores: number | null; limitAvailable: boolean; limitReason?: string };
type Histogram = { enable(): unknown; disable(): unknown; reset(): unknown; count: number; max: number; percentile(value: number): number };
type Dependencies = {
  read(path: string): string; now(): number; cpu(): NodeJS.CpuUsage; rss(): number; histogram(): Histogram;
  every(fn: () => void, ms: number): ReturnType<typeof setInterval>;
  later(fn: () => void, ms: number): ReturnType<typeof setTimeout>;
  clearEvery(timer: ReturnType<typeof setInterval>): void;
  clearLater(timer: ReturnType<typeof setTimeout>): void;
};
const defaults: Dependencies = {
  read: path => readFileSync(path, 'utf8'), now: () => performance.now(), cpu: () => process.cpuUsage(), rss: () => process.memoryUsage().rss,
  histogram: () => monitorEventLoopDelay({ resolution: 20 }), every: setInterval, later: setTimeout, clearEvery: clearInterval, clearLater: clearTimeout
};
function errorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : 'unavailable_or_malformed';
}
export function capacityDiagnosticsEnabled(raw: string | undefined): boolean {
  if (raw === undefined || raw === '' || raw === 'false' || raw === '0') return false;
  if (raw === 'true' || raw === '1') return true;
  throw new Error('JR_CAPACITY_DIAGNOSTICS must be true, false, 1 or 0');
}
/** Only fixed cgroup paths are readable; no process environment or request data enters a sample. */
export function readCgroupCounters(read: Dependencies['read']): CounterSnapshot {
  const candidates = [
    { version: 'v2' as const, path: '/sys/fs/cgroup/cpu.stat', base: '/sys/fs/cgroup' },
    { version: 'v1' as const, path: '/sys/fs/cgroup/cpu/cpu.stat', base: '/sys/fs/cgroup/cpu' },
    { version: 'v1' as const, path: '/sys/fs/cgroup/cpu,cpuacct/cpu.stat', base: '/sys/fs/cgroup/cpu,cpuacct' }
  ];
  for (const candidate of candidates) {
    let text: string;
    try { text = read(candidate.path); } catch (error) {
      if (errorCode(error) === 'ENOENT') continue;
      return { available: false, reason: errorCode(error) };
    }
    const fields: Record<string, number> = {};
    for (const line of text.trim().split('\n')) {
      const match = /^([a-z_]+)\s+(\d+)$/.exec(line.trim());
      if (!match || !Number.isSafeInteger(Number(match[2]))) return { available: false, reason: 'malformed_cgroup_counter' };
      fields[match[1]] = Number(match[2]);
    }
    const time = candidate.version === 'v2' ? fields.throttled_usec : fields.throttled_time / 1000;
    if (![fields.nr_periods, fields.nr_throttled, time].every(Number.isFinite)) return { available: false, reason: 'throttling_counters_not_exposed' };
    let limitCores: number | null = null, limitAvailable = false;
    try {
      const [quota, period] = candidate.version === 'v2'
        ? read(candidate.base + '/cpu.max').trim().split(/\s+/)
        : [read(candidate.base + '/cpu.cfs_quota_us').trim(), read(candidate.base + '/cpu.cfs_period_us').trim()];
      if (quota === 'max' || quota === '-1') limitAvailable = true;
      else if (Number(quota) > 0 && Number(period) > 0 && Number.isFinite(Number(quota) / Number(period))) { limitCores = Number(quota) / Number(period); limitAvailable = true; }
    } catch (error) {
      return { available: true, version: candidate.version, periods: fields.nr_periods, throttledPeriods: fields.nr_throttled, throttledMicroseconds: time, limitCores, limitAvailable: false, limitReason: errorCode(error) };
    }
    return { available: true, version: candidate.version, periods: fields.nr_periods, throttledPeriods: fields.nr_throttled, throttledMicroseconds: time, limitCores, limitAvailable, ...(!limitAvailable ? { limitReason: 'malformed_cpu_limit' } : {}) };
  }
  return { available: false, reason: 'cgroup_paths_not_found' };
}
export function startCapacityDiagnostics(enabled: boolean, emit: (sample: Record<string, unknown>) => void, overrides: Partial<Dependencies> = {}): () => void {
  if (!enabled) return () => undefined;
  const deps = { ...defaults, ...overrides }, histogram = deps.histogram();
  histogram.enable();
  let previousAt = deps.now(), previousCpu = deps.cpu(), previousCgroup = readCgroupCounters(deps.read), stopped = false;
  const timer = deps.every(() => {
    if (stopped) return;
    const at = deps.now(), cpu = deps.cpu(), cgroup = readCgroupCounters(deps.read), elapsedMs = at - previousAt;
    const cpuMicroseconds = cpu.user - previousCpu.user + cpu.system - previousCpu.system;
    const throttling = cgroup.available && previousCgroup.available && cgroup.version === previousCgroup.version
      && cgroup.periods >= previousCgroup.periods && cgroup.throttledPeriods >= previousCgroup.throttledPeriods && cgroup.throttledMicroseconds >= previousCgroup.throttledMicroseconds
      ? { available: true, periods: cgroup.periods - previousCgroup.periods, throttledPeriods: cgroup.throttledPeriods - previousCgroup.throttledPeriods, throttledMicroseconds: cgroup.throttledMicroseconds - previousCgroup.throttledMicroseconds }
      : { available: false, reason: 'prior_matching_monotonic_cgroup_sample_unavailable' };
    const eventLoop = histogram.count > 0
      ? { available: true, samples: histogram.count, p50Ms: histogram.percentile(50) / 1e6, p95Ms: histogram.percentile(95) / 1e6, maxMs: histogram.max / 1e6 }
      : { available: false, reason: 'no_event_loop_samples' };
    emit({ event: 'capacity.diagnostic', intervalMs: elapsedMs, processCpu: elapsedMs > 0 && cpuMicroseconds >= 0 ? { available: true, cores: cpuMicroseconds / (elapsedMs * 1000) } : { available: false, reason: 'invalid_cpu_sample' }, rssBytes: deps.rss(), eventLoop, cgroup, throttling });
    previousAt = at; previousCpu = cpu; previousCgroup = cgroup; histogram.reset();
  }, 5000);
  timer.unref();
  let deadline: ReturnType<typeof setTimeout>;
  const stop = (reason: string) => {
    if (stopped) return;
    stopped = true; deps.clearEvery(timer); deps.clearLater(deadline); histogram.disable();
    emit({ event: 'capacity.diagnostic.stopped', reason });
  };
  deadline = deps.later(() => stop('120_second_duration_limit'), 120000); deadline.unref();
  return () => stop('application_closed');
}

export function validateCapacityDiagnostics(raw: string | undefined, databaseUrl: string | undefined): boolean {
  const enabled = capacityDiagnosticsEnabled(raw);
  if (!enabled) return false;
  let name: string;
  try { name = decodeURIComponent(new URL(databaseUrl ?? '').pathname); } catch (error) { throw new Error('Capacity diagnostics require an isolated jr_load_ database'); }
  if (!/^\/jr_load_[a-z0-9_]{6,60}$/.test(name)) throw new Error('Capacity diagnostics require an isolated jr_load_ database');
  return true;
}
export function createCapacityDiagnosticsLifecycle(enabled: boolean, emit: (sample: Record<string, unknown>) => void, overrides: Partial<Dependencies> = {}) {
  let armed = false, closed = false, stop: (() => void) | undefined;
  return {
    onRequest(url: string) {
      if (!enabled || armed || closed || !url.startsWith('/api/v1/')) return;
      armed = true; stop = startCapacityDiagnostics(true, emit, overrides);
    },
    close() { closed = true; stop?.(); }
  };
}

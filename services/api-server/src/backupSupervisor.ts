import { Worker } from "node:worker_threads";

const RESTART_MS = 5 * 60 * 1000;
const WORKER_HEAP_MB = 192;
/** Keep snapshot validation and encoding off the HTTP event loop. */
export function startDatabaseBackups(onError: (error: unknown) => void): () => Promise<void> {
  let stopped = false;
  let worker: Worker | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const workerPath = require.resolve("./backupWorker");
  const scheduleRetry = () => { retry = setTimeout(spawn, RESTART_MS); retry.unref(); };
  const spawn = () => {
    if (stopped) return;
    let current: Worker;
    try {
      current = new Worker(workerPath, {
        env: { ...process.env, DB_POOL_MAX: "1" },
        resourceLimits: { maxOldGenerationSizeMb: WORKER_HEAP_MB, maxYoungGenerationSizeMb: 16 }
      });
    } catch (error) {
      onError(error);
      scheduleRetry();
      return;
    }
    worker = current;
    let failureReported = false;
    current.on("message", message => {
      if (message?.type === "ready") return;
      if (message?.type === "backup-error" && typeof message.message === "string") {
        onError(new Error(`Backup worker: ${message.message.slice(0, 2000)}`));
        return;
      }
      onError(new Error("Backup worker sent an invalid status message"));
    });
    current.on("error", error => { failureReported = true; onError(error); });
    current.on("exit", code => {
      if (worker === current) worker = undefined;
      if (stopped) return;
      if (!failureReported) onError(new Error(`Backup worker exited unexpectedly with code ${code}`));
      scheduleRetry();
    });
    current.unref();
  };
  spawn();
  return async () => {
    stopped = true;
    if (retry) clearTimeout(retry);
    const current = worker;
    worker = undefined;
    if (current) await current.terminate();
  };
}

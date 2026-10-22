// Worker threads need their own CommonJS TypeScript hook for workspace source dependencies.
require("tsx/cjs");
const { parentPort: backupParentPort } = require("node:worker_threads") as typeof import("node:worker_threads");
const { startDatabaseBackups: startWorkerBackups } = require("./backup") as typeof import("./backup");

if (!backupParentPort) throw new Error("Backup worker requires a worker-thread parent");
const backupPort = backupParentPort;
const stopWorkerBackups = startWorkerBackups(error => {
  backupPort.postMessage({ type: "backup-error", message: error instanceof Error ? error.message : String(error) });
});
// A referenced port keeps the scheduler alive even while its six-hour timer is unreferenced.
backupPort.on("message", message => {
  if (message?.type !== "stop") throw new Error("Invalid backup worker control message");
  stopWorkerBackups();
  backupPort.close();
});
backupPort.postMessage({ type: "ready" });

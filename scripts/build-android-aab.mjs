#!/usr/bin/env node
// Cross-platform AAB builder. Replaces the Windows-only gradlew.bat call
// in package.json's build:user:aab / build:driver:aab. Picks gradlew.bat on
// Windows, ./gradlew on macOS/Linux.
//
//   node scripts/build-android-aab.mjs user-app
//   node scripts/build-android-aab.mjs driver-app

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const app = process.argv[2];
if (!app || !["user-app", "driver-app"].includes(app)) {
  console.error("usage: node scripts/build-android-aab.mjs <user-app|driver-app>");
  process.exit(1);
}

const androidDir = path.join(repoRoot, "apps", app, "android");
if (!existsSync(androidDir)) {
  console.error(`✗ android dir not found: ${androidDir}`);
  process.exit(1);
}

const isWin = process.platform === "win32";
const gradlew = path.join(androidDir, isWin ? "gradlew.bat" : "gradlew");
if (!existsSync(gradlew)) {
  console.error(`✗ gradlew not found at: ${gradlew}`);
  process.exit(1);
}

// Inherit shell PATH so `node` (and `npx`) resolve inside gradle exec blocks.
// On macOS/Linux this is the user's shell PATH; on Windows it's PowerShell's.
const env = {
  ...process.env,
  NODE_ENV: "production",
  EXPO_NO_METRO_WORKSPACE_ROOT: "1"
};

console.log(`→ Building AAB for ${app} via ${path.basename(gradlew)}...`);
const result = spawnSync(gradlew, ["-p", androidDir, "bundleRelease"], { stdio: "inherit", env });
process.exit(result.status ?? 0);

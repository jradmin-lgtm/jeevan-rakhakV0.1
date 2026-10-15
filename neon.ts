import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  // Provisioned infrastructure only; JR continues to use its existing custom login.
  auth: true,
  // AI Gateway requires a paid Neon plan. Keep it undeclared on this Free project.
  functions: {
    hello: { name: "Hello World", source: "./hello.ts" },
  },
  buckets: {
    // "private" is the default; use "public_read" for anonymous reads
    assets: { access: "private" },
  },
  // Branch policy: per-branch tuning
  branch: (branch) => {
    if (branch.isDefault) {
      // Default branch: no overrides, uses project defaults
      return {};
    }
    if (!branch.exists) {
      // New non-default branches: auto-expire
      // Run `neon checkout <name>` to create a new branch with these settings
      return { ttl: "7d" };
    }
    // Existing branch: no changes
    return {};
  },
});

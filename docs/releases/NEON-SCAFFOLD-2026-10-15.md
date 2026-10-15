# Neon infrastructure setup, 15 October 2026

## Verified outcome

Neon CLI 8.4.5 initialized project `soft-wave-50441469` (`jr-dbms2`), organization `org-sweet-recipe-22333671`, branch `production` (`br-rapid-hall-b586zkiy`). Readback confirmed PostgreSQL 18 in `aws-us-east-2`.

| Capability | Infrastructure result | Product integration |
| --- | --- | --- |
| PostgreSQL | Existing target confirmed | This setup did not switch JR's application database or migrate its data |
| Neon Auth | Already enabled on target; retained | JR's existing custom login remains unchanged |
| Object Storage | Created private `assets` bucket; existing private `jr-dump2` retained | No JR upload/download flow was changed |
| Functions | Deployed sample `hello` function | Static smoke endpoint only; no JR API or realtime traffic moved |
| AI Gateway | Requested by original scaffold; deploy rejected on Free plan; removed from active policy | Unavailable on this plan; no paid upgrade or model request performed |

The target already reports a default AI gateway credential. Its existence does not make AI requests available on the Free plan. No credential values appear in this document or committed configuration.

Sample endpoint: <https://br-rapid-hall-b586zkiy-hello.compute.c-7.us-east-2.aws.neon.tech/>. One HTTPS smoke request returned HTTP 200 and exactly `Hello from Neon Functions` in 1,424 ms. This verifies the sample function, not application load capacity.

## Reviewed policy and deployment

`neon.ts` declares Auth, the private `assets` bucket, and the sample function from `hello.ts`. The default/existing branch receives no compute changes. Newly created non-default branches expire after seven days. No Data API, realtime replacement, billing change, or automatic application login migration is declared.

The initial plan listed only bucket/function additions and warned that AI Gateway needed a paid plan. Initial deploy rejected the AI-enabled policy without applying those additions. After removing `aiGateway`, a second plan and deploy succeeded. Deployment used `--no-env-pull`; no application environment file was created or changed by this work. Root `.env` and `.env.local` were absent afterward.

Readback confirmed Auth enabled, private `assets` and `jr-dump2` buckets, and `hello`. A subsequent plan still shows `~ function hello`: the CLI schedules the function for redeployment. Do not describe that output as a completely empty/no-op plan.

## Dependency isolation and reproduction

The authoritative checkout shares its `node_modules` through a symlink with the active Android build checkout. To preserve that build tree, the requested init ran in `/tmp/jr-oct15-neon-scaffold` with `--package-manager npm --no-agent-setup`. Only `neon.ts`, `hello.ts`, and `.neon` were copied into the project. The generated environment stayed in the private staging directory, with file mode 0600 and directory mode 0700.

Root devDependencies now pin `@neon/config` 1.9.1 and `@neon/env` 1.6.2. A separate two-package pnpm 10.8.1 lock was generated with the project's overrides, then only new package/snapshot entries and the two root dependencies were merged into the existing lock. All existing parsed package/snapshot entries were retained. Exact pnpm 10.8.1 accepted the result using `install --lockfile-only --frozen-lockfile --offline --ignore-scripts`.

For the active local checkout only, two additive `node_modules/@neon/{config,env}` symlinks resolve to a durable isolated runtime under `/Users/kumar.sh/.local/share/jr-neon-runtime-20261015`. No existing dependency or the root `node_modules` symlink was replaced. A normal future isolated checkout should use its checked-in package manifest and lock with pnpm 10.8.1; the machine-specific links are not required or committed.

An initial ambient pnpm attempt used a newer version that ignored the legacy override field; it was terminated without a lockfile change. The final validation used the project's exact pnpm version. The final lock diff adds entries only.

`.neon` is ignored because it is a machine-local project/branch selection. The CLI's config evaluation succeeded from the authoritative root using the isolated dependencies. Standalone TypeScript checking of `neon.ts` and `hello.ts` passed; diff whitespace checks passed.

## Skills and quota guidance

Installed the official `neon` and `neon-postgres-egress-optimizer` skills for Codex at user scope and read both. The egress workflow is diagnose, inspect query scope, fix overfetching, then verify response compatibility and measured transfer. No database statistics were reset and no application queries were changed as part of this infrastructure task.

Current [Neon pricing](https://neon.com/pricing) lists Auth, Object Storage and Functions on Free, with finite allowances. AI Gateway appears on paid plans; the actual target CLI also rejected it on Free. Keeping this setup on Free does not establish enough remaining quota for a hosted 50-ride load test. That test requires separate fixtures, quota checks and measured application/API/socket results.

See [Neon configuration documentation](https://neon.com/docs/reference/neon-ts) for deployment semantics. Infrastructure readiness and application cutover are separate steps.

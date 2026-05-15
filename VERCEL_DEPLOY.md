# Deploying admin-web to Vercel

Vercel team: **jeevan-rakshak-s-projects** (owned by `jradmin@jeevan-rakshak.com`).
Project to deploy: `apps/admin-web/` (Next.js 15, App Router).
What gets hosted: the operations dashboard + the **`/privacy`** policy page that the Play Store listing + mobile sign-in screens link to.

## First-time setup (~5 min, runs once)

You'll need to be signed in to Vercel as `jradmin@jeevan-rakshak.com` (the account that owns the team).

```bash
# 1. Install Vercel CLI globally
npm install -g vercel

# 2. Browser auth — sign in with jradmin@jeevan-rakshak.com
vercel login
# Choose "Continue with GitHub" (recommended) and sign into the
# GitHub account that owns the repo (jradmin-lgtm).

# 3. Confirm you're on the right team
vercel teams switch jeevan-rakshak-s-projects

# 4. From the jr-prod clone, link admin-web to a new Vercel project
cd "/Applications/VsCode Works/12. Jeevan App/jr-prod"
cd apps/admin-web
vercel link
# When prompted:
#   ? Set up "apps/admin-web"?           → Y
#   ? Which scope?                       → jeevan-rakshak-s-projects
#   ? Link to existing project?          → N (first time)
#   ? Project name?                      → jr-admin (or whatever)
#   ? In which directory is your code?   → ./
```

## Set the env vars Vercel needs (before deploy)

Either via CLI or via the Vercel dashboard (Project → Settings → Environment Variables). Set these for the **Production** environment:

| Key | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `https://<your-api-host>` | The public URL of the api-server (Render/Fly/etc.) |
| `NEXT_PUBLIC_ADMIN_API_KEY` | same value as `ADMIN_API_KEY` on backend | The admin-web sends this in the `x-admin-key` header |

CLI form (run from `apps/admin-web/`):
```bash
vercel env add NEXT_PUBLIC_API_BASE_URL production
# paste the URL when prompted
vercel env add NEXT_PUBLIC_ADMIN_API_KEY production
# paste the secret
```

## Deploy

```bash
cd "/Applications/VsCode Works/12. Jeevan App/jr-prod/apps/admin-web"

# Preview (every push gets a unique preview URL — safe to test)
vercel

# Production (creates the canonical https://jr-admin.vercel.app/ or your custom domain)
vercel --prod
```

The CLI prints the deploy URL. Open `<url>/privacy` to verify the privacy policy renders.

## Wire the URL back into the mobile apps

Once Vercel gives you the production URL (e.g. `https://jr-admin-jeevan-rakshak-s-projects.vercel.app`), update both:

- `apps/user-app/.env.production` → set `EXPO_PUBLIC_PRIVACY_POLICY_URL=https://<your-vercel-url>/privacy`
- `apps/driver-app/.env.production` → same

Then rebuild the AABs (`pnpm run build:user:aab` / `pnpm run build:driver:aab`). The privacy-policy link in the mobile sign-in footer will now point at the live URL — required for the Play Store listing.

## Optional — a custom domain

When ready (could be week 2 of the pilot):

```bash
vercel domains add admin.jeevan-rakshak.com
```

Follow the DNS-record instructions Vercel prints, then `vercel alias set <deploy-id> admin.jeevan-rakshak.com`. Update `EXPO_PUBLIC_PRIVACY_POLICY_URL` to the custom domain and rebuild the AABs.

## Repo-config notes (already wired)

- `apps/admin-web/vercel.json` is configured for the pnpm workspace: install command runs `pnpm install --filter=@jr/admin-web...` from the repo root, build runs the Next.js production build.
- If Vercel ever complains about the `workspace:*` protocol, double-check that **corepack is enabled** in the project Build Settings — that's what pulls in the right pnpm version.
- **Root Directory** in the Vercel project settings should be `apps/admin-web`. The `vercel link` step above sets that automatically.

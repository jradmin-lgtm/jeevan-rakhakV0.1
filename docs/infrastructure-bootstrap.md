# Infrastructure Bootstrap (Cost-First V0)

## Environments

- `dev`: local docker postgres + service processes.
- `staging`: single low-cost host for API/socket/worker.
- `prod`: same shape as staging with stricter secret and backup controls.

## Recommended Providers

- API/socket/worker host: Railway or Fly starter plan.
- Admin web: Vercel free tier.
- Database: Neon or Supabase free tier to start, then paid plan with PITR at first sustained load.
- Storage: Cloudflare R2 for KYC docs and artifacts.
- Monitoring: Sentry free + uptime ping service.

## Bootstrap Checklist

1. Create DNS and TLS-enabled domain.
2. Provision Postgres and secure credentials.
3. Add environment secrets in deployment platform.
4. Deploy API and socket services from monorepo.
5. Enable CI on main and pull requests.
6. Configure Sentry DSN and release tracking.
7. Add nightly logical DB backup automation.

# PRODUCTION_ENV_REQUIREMENTS

## Complete Environment Variable Inventory

## API Server (`services/api-server`)

| Variable | Required value format | Why required |
|---|---|---|
| `NODE_ENV` | `production` | Enables production behavior and hardening checks |
| `DATABASE_URL` | `postgres://<user>:<pass>@<host>:5432/<db>` | Primary datastore connection |
| `JWT_SECRET` | 64+ char random secret | JWT signing/verification |
| `INTERNAL_API_SECRET` | 64+ char random secret | Internal API-to-socket auth |
| `ADMIN_API_KEY` | 64+ char random secret | Required for `/api/v1/admin/*` |
| `CORS_ALLOWED_ORIGINS` | `https://admin.<domain>,https://<origin>` | Restrict allowed browser origins |
| `API_PORT` | e.g. `4000` | API listener port |
| `SOCKET_BASE_URL` | `http(s)://<socket-service-host>:<port>` | Internal fan-out calls from API to socket |
| `FLAG_DEMO_BYPASS` | `false` in production | Prevent OTP leakage in auth responses |
| `JWT_ISSUER` | e.g. `jeevan-rakshak` | JWT issuer identity |
| `JWT_ACCESS_TTL_SEC` | integer, e.g. `2592000` | JWT access token expiry |
| `RATE_LIMIT_OTP_PER_MIN` | integer | OTP request throttle |
| `RATE_LIMIT_VERIFY_PER_MIN` | integer | OTP verify throttle |
| `RATE_LIMIT_GENERIC_PER_MIN` | integer | Generic per-IP limit |
| `OTP_MAX_FAILED_ATTEMPTS` | integer | Brute-force OTP protection |
| `LOG_LEVEL` | `info|warn|error|debug` | API logger verbosity |
| `RATE_LIMIT_BYPASS` | `0` in production | Keep route-level rate limits enabled |
| `BASE_FARE_INR` | integer | Base fare config |
| `PER_KM_FARE_INR` | integer | Per-km fare config |
| `BOOKING_TIMEOUT_SEC` | integer | Booking timeout config |
| `FLAG_REQUIRE_KYC` | `true|false` | Driver KYC feature switch |
| `FLAG_ENABLE_PAYMENTS` | `true|false` | Payment feature switch |
| `FLAG_ENABLE_PUSH` | `true|false` | Push feature switch |

## Socket Server (`services/socket-server`)

| Variable | Required value format | Why required |
|---|---|---|
| `NODE_ENV` | `production` | Production mode |
| `DATABASE_URL` | Postgres URL | Driver state persistence |
| `JWT_SECRET` | exact same as API JWT secret | Socket auth token verification |
| `INTERNAL_API_SECRET` | exact same as API internal secret | Internal endpoint auth (after code patch) |
| `SOCKET_PORT` | e.g. `4001` | Socket server listener port |

## Worker Jobs (`services/worker-jobs`)

| Variable | Required value format | Why required |
|---|---|---|
| `NODE_ENV` | `production` | Production behavior |
| `DATABASE_URL` | Postgres URL | Booking/driver maintenance jobs |
| `BOOKING_TIMEOUT_SEC` | integer (e.g. `90`) | Timeout policy for requested bookings |

## Mobile User App (`apps/user-app/.env.production`)

| Variable | Required value format | Why required |
|---|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | `https://api.<domain>` | API calls from user app |
| `EXPO_PUBLIC_SOCKET_BASE_URL` | `wss://socket.<domain>` | Realtime socket connection |

## Mobile Driver App (`apps/driver-app/.env.production`)

| Variable | Required value format | Why required |
|---|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | `https://api.<domain>` | API calls from driver app |
| `EXPO_PUBLIC_SOCKET_BASE_URL` | `wss://socket.<domain>` | Driver realtime connection |

## Admin Web (`apps/admin-web`)

| Variable | Required value format | Why required |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `https://api.<domain>` | Admin panel API base URL |
| `NEXT_PUBLIC_ADMIN_API_KEY` | Must equal backend `ADMIN_API_KEY` | Auth for admin API requests |

---

## Provider-Specific Variables (Enable Only If Used)

## SMS

- Twilio:
  - `SMS_PROVIDER=twilio`
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `TWILIO_FROM`
- MSG91:
  - `SMS_PROVIDER=msg91`
  - `MSG91_AUTH_KEY`
  - `MSG91_TEMPLATE_ID`
  - `MSG91_SENDER` (optional)

## Maps

- Google Maps:
  - `MAPS_PROVIDER=googlemaps`
  - `GOOGLE_MAPS_API_KEY`
- Mapbox:
  - `MAPS_PROVIDER=mapbox`
  - `MAPBOX_ACCESS_TOKEN`

## Payments

- Razorpay:
  - `PAYMENTS_PROVIDER=razorpay`
  - `RAZORPAY_KEY_ID`
  - `RAZORPAY_KEY_SECRET`
- Stripe:
  - `PAYMENTS_PROVIDER=stripe`
  - `STRIPE_SECRET`

## Push

- FCM:
  - `PUSH_PROVIDER=fcm`
  - `FCM_SERVER_KEY`

---

## Expo / EAS Variables

- `USER_EAS_PROJECT_ID` (optional override for user app; otherwise from `apps/user-app/eas-project.json`)
- `DRIVER_EAS_PROJECT_ID` (optional override for driver app; otherwise from `apps/driver-app/eas-project.json`)
- `EAS_PROJECT_ID` (generic fallback used by app config scripts)

## Additional values used by config package

- `API_BASE_URL` (backend base URL metadata in shared config)
- `SOCKET_PORT` / `API_PORT` (service bind ports)
- `DB_POOL_MAX` (database pool size in `packages/db/src/client.ts`)

---

## Disallowed in Production

- Any `localhost` or `127.0.0.1` public app endpoint
- Default fallback secrets beginning with `dev-`
- `CORS_ALLOWED_ORIGINS=*`
- `FLAG_DEMO_BYPASS=true`
- Keystore passwords in tracked files

---

## Pre-Deploy Env Validation Commands (Recommended)

- Confirm no localhost values in production env files.
- Confirm required secrets are non-default and non-empty.
- Confirm mobile/public URLs use HTTPS/WSS.
- Confirm admin key parity:
  - `ADMIN_API_KEY` (API) == `NEXT_PUBLIC_ADMIN_API_KEY` (admin web).

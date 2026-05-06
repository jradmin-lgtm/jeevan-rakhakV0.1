# API Contracts (Version 0 MVP)

Base path: `/api/v1`

## Auth

- `POST /auth/login` - request OTP by phone.
- `POST /auth/verify-otp` - verify OTP and issue JWT/refresh token.
- `POST /auth/refresh` - rotate access token.
- `POST /auth/logout` - invalidate refresh session.

## User Booking

- `POST /bookings/book` - create a booking request.
- `GET /bookings/:id` - booking details.
- `POST /bookings/:id/cancel` - cancel before pickup.
- `GET /bookings/history` - paginated history.

## Driver Lifecycle

- `POST /driver/availability` - online/offline toggle.
- `POST /driver/bookings/:id/accept` - accept dispatch.
- `POST /driver/bookings/:id/arrived` - driver reached pickup.
- `POST /driver/bookings/:id/pickup` - patient onboarded.
- `POST /driver/bookings/:id/complete` - trip completion.
- `POST /driver/location` - periodic location ping.

## Payments

- `POST /payments/create-order` - create Razorpay order.
- `POST /payments/verify` - verify transaction signature.
- `POST /payments/refund` - trigger refund from admin flow.
- `POST /payments/webhook` - provider callback endpoint.

## Admin

- `GET /admin/dashboard` - KPI summary.
- `GET /admin/bookings` - filterable booking list.
- `PATCH /admin/bookings/:id` - manual status correction.
- `GET /admin/drivers/pending` - KYC queue.
- `POST /admin/drivers/:id/approve` - approve/reject decision.

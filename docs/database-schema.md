# Database Schema (Version 0)

PostgreSQL is the source of truth. Use UUID PKs and `created_at`/`updated_at` timestamps on all tables.

## Core Tables

### `users`
- `id`, `phone`, `name`, `language`, `status`
- `emergency_contact_name`, `emergency_contact_phone`
- `blood_group`, `allergies`

### `drivers`
- `id`, `phone`, `name`
- `kyc_status`, `background_check_status`
- `online_status`, `rating_avg`, `rating_count`

### `vehicles`
- `id`, `driver_id`, `registration_number`, `vehicle_type`
- `insurance_doc_url`, `fitness_doc_url`, `verification_status`

### `bookings`
- `id`, `user_id`, `driver_id`, `vehicle_id`
- `status`, `emergency_type`
- `pickup_lat`, `pickup_lng`, `drop_lat`, `drop_lng`
- `eta_seconds`, `distance_km`, `total_fare_paise`
- `requested_at`, `accepted_at`, `arrived_at`, `completed_at`

### `payments`
- `id`, `booking_id`, `method`, `provider`
- `provider_order_id`, `provider_payment_id`
- `amount_paise`, `status`, `refund_status`, `refund_amount_paise`

### `locations`
- `id`, `driver_id`, `booking_id`
- `lat`, `lng`, `heading`, `speed`
- `source_timestamp`

### `reviews`
- `id`, `booking_id`, `user_id`, `driver_id`
- `rating`, `comment`

### `support_tickets`
- `id`, `booking_id`, `raised_by_user_id`, `raised_by_driver_id`
- `category`, `priority`, `status`, `resolution_notes`

### `hospitals`
- `id`, `name`, `contact_phone`
- `lat`, `lng`, `integration_status`

### `notifications`
- `id`, `recipient_type`, `recipient_id`
- `channel`, `template_key`, `payload_json`, `delivery_status`

### `admins`
- `id`, `name`, `email`, `role`, `last_login_at`, `is_active`

## Relationship Rules

- One user has many bookings.
- One driver has many bookings over time.
- One booking has one active payment state and optional refunds.
- One booking has many location points.
- One booking can have one review and many support tickets.

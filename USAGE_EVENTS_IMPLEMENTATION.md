# Usage Events & Stripe Sync

This document captures the operational steps for the `usage_events` metered billing pipeline introduced on 2025-11-06.

## Scheduler Setup

- Endpoint: `POST /api/jobs/stripe-usage-sync`
- Frequency: **Hourly**
- Suggested options:
  - Vercel Cron: `0 * * * * https://app.smartsend.ai/api/jobs/stripe-usage-sync`
  - Supabase Scheduler: HTTP target invoking the same route with the service role key
- Required secrets: `STRIPE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`

## Smoke Test Checklist

1. **Database Event Capture**
   - Send a test email from any campaign
   - Verify a row is created in `public.usage_events` with `event_type = 'send'`
2. **Stripe Usage Record**
   - Trigger the sync manually: `curl -X POST https://app.smartsend.ai/api/jobs/stripe-usage-sync`
   - Confirm a usage increment appears on the related subscription item in Stripe (`Usage` tab)
3. **Monthly View**
   - Query `public.v_usage_monthly` for the test user's UUID and ensure the quantity increments
4. **Dashboard Card**
   - Load the main dashboard while authenticated as the test user
   - Confirm the “Usage This Month” total matches the events recorded above

## Rollback

- To disable automated syncing, pause the cron job. Existing rows are idempotent; rerunning the job only marks `meta.synced = true` when Stripe accepts the usage record.
- To stop event generation, drop the `trg_usage_on_send` trigger in Supabase until the issue is resolved.

## Notes

- `usage_events.meta` stores lightweight metadata and is augmented with `synced` and `synced_at` once pushed to Stripe.
- Stripe subscription item IDs are read from `billing_accounts.stripe_subscription_item_id`. Ensure this column is populated during onboarding.













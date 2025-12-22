# Quota-Aware Send Dispatcher

Block 112: Ensures SmartSend respects Gmail/Outlook daily send limits and dispatches queued emails intelligently without exceeding quota.

## Overview

This edge function processes emails from the `send_queue` table while respecting daily quota limits per account/provider combination. It:

1. Checks quota trackers before sending each email
2. Skips emails if daily quota is reached
3. Updates quota counters after successful sends
4. Handles failures gracefully

## Database Schema

The `send_quota_trackers` table tracks daily send counts:

- `account_id`: References `public.accounts(id)`
- `provider`: Either 'gmail' or 'outlook'
- `date`: The date for quota tracking
- `sent_count`: Number of emails sent today
- `quota_limit`: Daily limit (default: 2000 for Gmail)
- `reset_at`: Timestamp when quota resets

## Scheduler Setup

The function is configured to run every 5 minutes via Supabase Scheduler.

### Using Supabase CLI

```bash
supabase functions schedule create quota-aware-dispatcher \
  --cron "*/5 * * * *"
```

### Using config.toml

The scheduler is already configured in `supabase/config.toml`:

```toml
[functions."quota-aware-dispatcher"]
verify_jwt = false

[cron.jobs."quota-aware-dispatcher"]
schedule = "*/5 * * * *"   # every 5 minutes
endpoint = "/functions/v1/quota-aware-dispatcher"
```

## How It Works

1. Fetches up to 50 pending emails from `send_queue`
2. For each email:
   - Checks quota tracker for account/provider/date
   - If quota reached, skips and logs
   - If quota available, attempts to send
   - On success: updates queue status and increments quota counter
   - On failure: updates queue with error

## Quota Limits

Default limits:
- Gmail: 2000 emails/day
- Outlook: 2000 emails/day (adjustable per account)

To customize limits per account, update the `quota_limit` column in `send_quota_trackers`.

## Monitoring

Check quota usage:

```sql
SELECT 
  account_id,
  provider,
  date,
  sent_count,
  quota_limit,
  ROUND((sent_count::numeric / quota_limit::numeric) * 100, 2) as usage_percent
FROM send_quota_trackers
WHERE date = CURRENT_DATE
ORDER BY sent_count DESC;
```

## Error Handling

The function handles:
- Missing account details
- Unsupported providers
- Send failures
- Quota exceeded scenarios

All errors are logged and queue items are updated with appropriate status.
















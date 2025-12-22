# Send Queue Hardening Setup

This document describes the SQL hardening, Edge Function, and API routes for the send queue system with caps, logs, and exponential backoff.

## Files Created

### 1. SQL Migration
- **File**: `supabase/migrations/20250131000001_send_queue_hardening.sql`
- **Purpose**: Adds queue status tracking, attempts, timestamps, caps, and views

### 2. Edge Function
- **File**: `supabase/functions/sender-worker/index.ts`
- **File**: `supabase/functions/sender-worker/deno.json`
- **Purpose**: Worker that processes due queue items, renders templates, sends via Gmail/Outlook

### 3. API Route
- **File**: `src/app/api/admin/run-sender/route.ts`
- **Purpose**: Manual trigger endpoint for testing the sender-worker

## Setup Instructions

### Step 1: Run SQL Migration

Run the migration in Supabase SQL Editor:

```sql
-- File: supabase/migrations/20250131000001_send_queue_hardening.sql
```

This migration:
- Adds columns to `send_queue`: `status`, `attempts`, `last_error`, `next_attempt_at`, `scheduled_at`, `step_id`, `account_id`, `message_id`, `sent_at`
- Adds columns to `send_logs`: `account_id`, `lead_id`, `provider_message_id`, `error_text`, `queue_id`
- Adds columns to `connected_accounts`: `daily_cap`, `send_start`, `send_end`, `provider`, `email`, `access_token`, `refresh_token`, `provider_domain`
- Creates views: `vw_account_sends_today` and `vw_sendable_items`
- Creates indexes for performance

### Step 2: Deploy Edge Function

```bash
cd supabase
supabase functions deploy sender-worker --no-verify-jwt
```

The function will:
- Pull due items from `vw_sendable_items` (respects caps & windows)
- Render templates with `{{first_name}}` etc. syntax
- Send via Gmail or Outlook adapter
- Write to `send_logs`
- Update `send_queue` status
- Implement exponential backoff on failures (1m, 5m, 25m, 2h, 6h)

### Step 3: Set Up Cron Schedule

In Supabase Dashboard → Edge Functions → Cron:

1. **scheduler-tick** (if not already exists): Every 15 minutes
   - Queues items into `send_queue`

2. **sender-worker**: Every 1-2 minutes
   - Processes queued items and sends emails

To set up via SQL:

```sql
-- Schedule sender-worker every 2 minutes
SELECT cron.schedule(
  'sender-worker',
  '*/2 * * * *',
  $$SELECT net.http_post(
    url:='https://YOUR_PROJECT.supabase.co/functions/v1/sender-worker',
    headers:='{"Authorization":"Bearer YOUR_SERVICE_ROLE_KEY","Content-Type":"application/json"}'::jsonb,
    body:='{}'::jsonb
  );$$
);
```

### Step 4: Manual Testing

You can trigger the sender-worker manually via the API:

```bash
# From your Next.js app
curl -X POST http://localhost:3000/api/admin/run-sender

# Or from your dashboard
await fetch("/api/admin/run-sender", { method: "POST" });
```

## Success Criteria

✅ Items appear in `send_queue` → transition `queued` → `sending` → `sent`

✅ Rows written to `send_logs` with `provider_message_id` (for Gmail)

✅ Per-account cap respected (check `vw_account_sends_today`)

✅ Failures re-queue with backoff and visible `last_error`

## Database Schema Updates

### send_queue
- `status`: 'queued', 'sending', 'sent', 'failed', 'cancelled', 'paused'
- `attempts`: int (retry count)
- `last_error`: text (error message)
- `next_attempt_at`: timestamptz (when to retry)
- `scheduled_at`: timestamptz (when originally scheduled)
- `step_id`: uuid (references campaign_steps)
- `account_id`: uuid (references connected_accounts)
- `message_id`: text (provider message ID)
- `sent_at`: timestamptz (when actually sent)

### send_logs
- `account_id`: uuid (references connected_accounts)
- `lead_id`: uuid (references leads)
- `provider_message_id`: text (Gmail/Outlook message ID)
- `error_text`: text (error details)
- `queue_id`: uuid (references send_queue)
- `status`: 'sent', 'failed', 'skipped', 'error'

### connected_accounts
- `daily_cap`: int (default 40)
- `send_start`: time (default '08:00')
- `send_end`: time (default '18:00')
- `provider`: 'gmail' | 'outlook'
- `email`: text
- `access_token`: text
- `refresh_token`: text
- `provider_domain`: text

## Views

### vw_account_sends_today
Tracks how many emails each account has sent today (for cap enforcement).

### vw_sendable_items
Returns queue items that are:
- Status = 'queued'
- Due (next_attempt_at or scheduled_at <= now)
- Within send window (current time between send_start and send_end)
- Under daily cap (sent_today < daily_cap)

## Edge Function Details

### Template Rendering
Supports `{{variable}}` syntax:
- `{{lead.first_name}}`
- `{{lead.email}}`
- `{{campaign_id}}`

### Provider Adapters

**Gmail**: Uses Gmail API `/messages/send` endpoint with base64url-encoded RFC 822.

**Outlook**: Uses Microsoft Graph `/me/sendMail` endpoint. Note: For production, consider using SMTP with OAuth2 or the create draft → send flow to capture `internetMessageId`.

### Exponential Backoff
- Attempt 1: 1 minute
- Attempt 2: 5 minutes
- Attempt 3: 25 minutes
- Attempt 4: 2 hours
- Attempt 5+: 6 hours

## Notes

- The function queries `vw_sendable_items` which automatically filters by caps and windows
- Templates are fetched from `campaign_steps` table
- Access tokens should be refreshed before use (add token refresh logic if needed)
- For Outlook, the current implementation is simplified; consider using SMTP or the Graph create+send flow for production



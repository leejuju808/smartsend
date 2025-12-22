# Send Worker Implementation

## Overview

This implementation provides a robust email delivery worker system that processes queued messages with retry logic, delivery logging, and sender health protection.

## What's Included

### 1. Database Migration (`/supabase/migrations/20251009_send_worker.sql`)

Adds delivery tracking infrastructure:
- **Messages table enhancements**:
  - `provider_message_id` - Message ID from email provider (for reply threading)
  - `attempts` - Number of delivery attempts
  - `last_error` - Last error message for debugging
  - `sent_at` - Timestamp when successfully sent
  - `locked_at` - Lock timestamp to prevent double-processing

- **Delivery logs table**:
  - Tracks all delivery events (enqueued, attempt, sent, failed, skipped)
  - Includes profile_id, message_id, sender_id, to_email, event type, and detail
  - Row-level security enabled for user privacy

- **Indexes**:
  - `idx_messages_queue` - Optimizes queue fetching by profile, status, and created_at
  - `idx_messages_locked` - Optimizes lock checking

### 2. Mailer Updates (`/src/lib/mailer.ts`)

Enhanced to support delivery tracking:
- Accepts optional `headers` parameter for custom email headers
- Returns standardized response: `{ provider: 'smtp'|'resend', messageId: string }`
- Works with both SMTP and Resend providers

### 3. Delivery Worker (`/src/app/api/cron/deliver/route.ts`)

A secure cron endpoint that:
- Requires `x-cron-secret` header for authentication
- Batches queued messages (configurable via `SEND_BATCH_SIZE`)
- Implements soft-locking to prevent double-processing
- Checks subscription status (only sends for paid/trialing users)
- Validates sender status (skips paused senders)
- Retries failed sends up to `SEND_MAX_ATTEMPTS`
- Logs all delivery events to `delivery_logs` table
- Sets custom headers (`X-SS-Profile`, `X-SS-Message`) for reply tracking

**Workflow**:
1. Fetch batch of queued, unlocked messages
2. Lock messages with `locked_at` timestamp
3. For each message:
   - Verify user is paid/trialing
   - Verify sender is active
   - Send via mailer with tracking headers
   - Update message status (sent/failed/queued for retry)
   - Log event to delivery_logs
4. Return summary: `{ processed, sent, failed, skipped }`

### 4. UI Component (`/src/app/(dashboard)/send-safety/page.tsx`)

Added manual delivery trigger for development:
- "Run Delivery Now" button
- Real-time delivery results display
- Instructions for production Vercel Cron setup

## Environment Variables

Add to your `.env.local` or production environment:

```bash
# Delivery worker (required)
CRON_SECRET=dev_super_secret_token

# Dev only - allows manual testing via UI button
NEXT_PUBLIC_CRON_DEV_SECRET=dev_super_secret_token

# Optional - defaults shown
SEND_BATCH_SIZE=50
SEND_MAX_ATTEMPTS=5

# Mail provider (should already exist)
MAIL_PROVIDER=smtp         # or 'resend'
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=postmaster@example.com
SMTP_PASS=changeme
# or
RESEND_API_KEY=re_...
```

## Setup Instructions

### 1. Apply Database Migration

```bash
cd /path/to/smartsend-ai
supabase db push
```

### 2. Set Environment Variables

Update your `.env.local` with the variables above.

### 3. Start Development Server

```bash
pnpm dev
```

### 4. Test the Worker

#### Option A: Via UI (Development)
1. Navigate to `/send-safety` in your app
2. Scroll to "Manual Delivery Worker (Dev)" section
3. Click "Run Delivery Now"
4. View results in the log output

#### Option B: Via cURL
```bash
curl -H "x-cron-secret: dev_super_secret_token" \
  http://localhost:3000/api/cron/deliver
```

### 5. Create Test Data

In Supabase SQL editor:

```sql
-- Ensure you have an active subscription (or set for testing)
update public.profiles
set subscription_status = 'active'
where id = 'YOUR_PROFILE_ID';

-- Create a sender
insert into public.senders (
  profile_id,
  from_email,
  provider,
  status,
  base_daily_limit,
  target_daily_limit,
  hourly_limit,
  warmup_increment
)
values (
  'YOUR_PROFILE_ID',
  'you@yourdomain.com',
  'smtp',
  'active',
  20,
  200,
  30,
  10
)
on conflict do nothing;

-- Queue a test message
insert into public.messages (
  profile_id,
  sender_id,
  to_email,
  subject,
  body,
  status
)
values (
  'YOUR_PROFILE_ID',
  (select id from public.senders where profile_id='YOUR_PROFILE_ID' limit 1),
  'prospect@example.com',
  'Hi {{first}}',
  '<p>Quick question about <b>reducing no-shows</b>.</p>',
  'queued'
);
```

### 6. Run the Worker

Click "Run Delivery Now" in the UI or run the cURL command. You should see:

```json
{
  "processed": 1,
  "sent": 1,
  "failed": 0,
  "skipped": 0
}
```

### 7. Verify Results

Check the `messages` table:
- `status` should be `'sent'`
- `sent_at` should be populated
- `provider_message_id` should contain the message ID
- `attempts` should be `1`
- `last_error` should be `null`

Check the `delivery_logs` table:
- Should have an entry with `event = 'sent'`
- `detail` should contain the provider message ID

## Production Deployment

### Vercel Cron Configuration

Create or update `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/deliver",
      "schedule": "*/5 * * * *",
      "headers": [
        {
          "key": "x-cron-secret",
          "value": "${CRON_SECRET}"
        }
      ]
    }
  ]
}
```

This runs the delivery worker every 5 minutes. Adjust the schedule as needed:
- `*/1 * * * *` - Every minute (high frequency)
- `*/5 * * * *` - Every 5 minutes (recommended)
- `*/10 * * * *` - Every 10 minutes (lower frequency)

**Note**: Do NOT set `NEXT_PUBLIC_CRON_DEV_SECRET` in production - this is dev-only.

### Alternative: Manual Cron Setup

If not using Vercel Cron, you can use a service like cron-job.org or your own server:

```bash
# Example crontab entry (every 5 minutes)
*/5 * * * * curl -H "x-cron-secret: YOUR_PRODUCTION_SECRET" https://yourdomain.com/api/cron/deliver
```

## Acceptance Criteria

✅ Messages in `queued` status are processed and sent
✅ Provider message IDs are captured for reply threading
✅ Failed sends retry up to MAX_ATTEMPTS
✅ Non-paid users are skipped (with log entry)
✅ Paused senders are skipped (with failed status)
✅ All events are logged to `delivery_logs`
✅ Locked messages prevent double-processing
✅ Custom headers enable reply tracking
✅ UI provides manual trigger for development

## Why This Matters (→ MB/100)

1. **Enables Replies** - Without delivery, there are no replies, and therefore no meetings
2. **Protects Sender Health** - Retry logic and limits prevent sending reputation damage
3. **Enables Reply Threading** - Provider message IDs allow accurate reply-to-message matching
4. **Provides Observability** - Delivery logs enable debugging and monitoring
5. **Scales Reliably** - Batch processing and locking prevent race conditions

## Monitoring

Query delivery logs to track performance:

```sql
-- Today's delivery stats
select
  event,
  count(*) as count
from public.delivery_logs
where created_at >= current_date
group by event
order by count desc;

-- Recent failures
select
  to_email,
  detail,
  created_at
from public.delivery_logs
where event = 'failed'
order by created_at desc
limit 10;

-- Sender performance
select
  s.from_email,
  count(*) filter (where dl.event = 'sent') as sent,
  count(*) filter (where dl.event = 'failed') as failed
from public.delivery_logs dl
join public.senders s on s.id = dl.sender_id
where dl.created_at >= current_date - interval '7 days'
group by s.from_email
order by sent desc;
```

## Next Steps

1. Set up production Vercel Cron (or alternative)
2. Configure email provider (SMTP or Resend)
3. Test with real messages
4. Monitor `delivery_logs` for issues
5. Adjust `SEND_BATCH_SIZE` based on volume
6. Consider adding alerting for high failure rates

## Troubleshooting

### Messages stay in `queued` status
- Check that cron is running (Vercel Cron or manual)
- Verify `CRON_SECRET` matches in environment and request
- Check logs for errors in the API route

### Messages fail with "Not paid"
- Verify `subscription_status` in `profiles` table is `'active'` or `'trialing'`

### Messages fail with "Sender missing/paused"
- Check `senders` table for matching sender
- Verify sender `status` is `'active'` (not `'paused'`)

### No provider message ID captured
- Check email provider API response
- Verify mailer returns `{ provider, messageId }` format
- Check `delivery_logs` for the actual message ID

### Double-sending
- Ensure indexes are created properly
- Verify `locked_at` logic is working
- Check that cron interval isn't too frequent for batch size

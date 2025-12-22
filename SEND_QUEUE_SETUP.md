# Send Queue Setup & Deployment

This document describes the send queue system setup with DB hardening, atomic claiming, and Apps Script integration.

## Overview

The send queue system:
1. Accepts campaign launches that enqueue emails with scheduled delivery times
2. Uses an atomic Postgres function to claim due items (SKIP LOCKED pattern)
3. Edge Function exposes a simple API for Apps Script to pull and report results
4. Apps Script tick runs every minute to send via Gmail

## Database Schema

### Tables

**send_queue:**
- `id`, `campaign_id`, `lead_id`, `to_email`, `subject`, `body` (or `body_html`)
- `status`: 'queued' | 'sending' | 'sent' | 'failed'
- `scheduled_at`, `attempts`, `last_error`, `created_at`

**send_logs:**
- `id`, `user_id`, `campaign_id`, `lead_id`, `queue_id`, `provider_id`, `sent_at`

### Constraints & Indexes

Applied via `20250131000001_send_queue_hardening.sql`:

1. Status constraint to prevent invalid states
2. Unique index `(campaign_id, lead_id)` to prevent duplicates
3. Composite index `(status, scheduled_at)` for fast due-item lookups
4. Foreign keys for referential integrity

### Atomic Claim Function

```sql
claim_due_queue(max_rows int)
```

Uses PostgreSQL `FOR UPDATE SKIP LOCKED` to atomically:
- Select due items ordered by `scheduled_at`
- Update status to 'sending' and increment attempts
- Return claimed rows

This eliminates race conditions from manual read→update loops.

## Edge Function: send-queue

**File:** `supabase/functions/send-queue/index.ts`

**Endpoints:**

### GET /?op=pull&limit=10
Returns `{ rows: [...] }` with due items claimed via RPC.

### POST /?op=sent
Body: `{ queueId, providerId }`
Marks item as 'sent' and inserts into `send_logs`.

### POST /?op=failed
Body: `{ queueId, error }`
Marks item as 'failed' with error message.

**Auth:** Header `x-ss-secret` must match `QUEUE_SECRET` env var.

## Apps Script

**File:** `supabase/apps-script-example.gs`

### Setup

1. Create new Google Apps Script project
2. Paste the code from `apps-script-example.gs`
3. Set Script Properties:
   - `QUEUE_URL`: `https://<project>.functions.supabase.co/send-queue`
   - `QUEUE_SECRET`: same secret as Edge Function
4. Add trigger:
   - Function: `sendTick`
   - Event: Time-driven → Every minute

### Behavior

Every minute:
1. Pulls up to 10 due items via Edge Function
2. Sends each via GmailApp.sendEmail (HTML body)
3. Reports success/failure back to queue
4. Gentle pacing: 400ms + random jitter between sends

## Deployment Steps

### 1. Database Migration

```bash
supabase migration up
```

Or apply manually:
```sql
-- Run supabase/migrations/20250131000001_send_queue_hardening.sql
```

### 2. Edge Function

```bash
cd supabase/functions/send-queue

supabase functions deploy send-queue --no-verify-jwt
```

Set secrets:
```bash
supabase secrets set QUEUE_SECRET=your-secret-here
```

### 3. Apps Script

1. Open Google Apps Script
2. Create new project
3. Paste `apps-script-example.gs` code
4. Set Script Properties
5. Add time-driven trigger (every minute)

## Testing

### Create Test Campaign

```sql
-- Insert test campaign
INSERT INTO campaigns (subject_template, body_template, daily_cap, cadence_seconds, window_start, window_end)
VALUES ('Test Subject', '<p>Hello {{first_name}}</p>', 3, 45, '08:00', '17:30');

-- Import 2-3 test leads you control
-- Launch via your app's launchCampaign action
```

### Verify Queue

```sql
SELECT * FROM send_queue WHERE status = 'queued' ORDER BY scheduled_at;
```

### Monitor Logs

```sql
SELECT * FROM send_logs ORDER BY sent_at DESC LIMIT 10;
```

### Watch Apps Script Logs

```javascript
// In Apps Script: View → Executions
// Should see "Pulled N items" and send results
```

## Notes

- **Daily Limits:** Campaign `daily_cap` enforced in `buildQueue`
- **Suppression:** BuildQueue skips leads in suppression_list
- **Retries:** `attempts` increments on failures; max retries logic optional
- **Scaling:** For higher volume, replace GmailApp with Gmail API or SMTP providers

## Security

- Edge Function uses service role key
- RLS policies protect by user_id
- Apps Script uses shared secret for API auth
- Claim function runs as SECURITY DEFINER but respects RLS


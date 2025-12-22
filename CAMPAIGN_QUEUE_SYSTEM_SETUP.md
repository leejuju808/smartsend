# Campaign Queue System Setup

This document outlines the email campaign queue system with rate limiting, daily caps, pause/resume, and automatic retries.

## Overview

The system provides:
- **Reliable sending** with rate limits and daily caps
- **Pause/resume** functionality for campaigns
- **Automatic retries** with exponential backoff
- **Clean separation**: enqueue (once) → worker (cron) → Replies Inbox → Reply detection

## Database Setup

### 1. Apply Migrations

Run these migrations in order:

1. `supabase/migrations/20250216000000_campaign_queue_system.sql` - Creates/updates campaigns, campaign_leads, send_queue, suppress_list tables
2. `supabase/migrations/20250216000001_get_campaign_owner_token.sql` - Creates Postgres function for getting Gmail tokens

### 2. Verify Tables

```sql
-- Check campaigns table has required columns
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'campaigns' AND column_name IN ('workspace_id', 'from_name', 'from_email', 'subject_template', 'body_template', 'daily_cap', 'rate_per_min', 'start_at');

-- Check campaign_leads has state tracking
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'campaign_leads' AND column_name IN ('state', 'last_error', 'sent_message_id', 'sent_at');

-- Check send_queue has all required columns
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'send_queue' AND column_name IN ('provider', 'priority', 'attempts', 'max_attempts', 'not_before', 'state', 'error', 'locked_at', 'worker_id');

-- Check suppress_list exists
SELECT * FROM suppress_list LIMIT 1;
```

## Edge Functions Setup

### 1. Deploy Edge Functions

Deploy the edge functions to Supabase:

```bash
# Deploy enqueueCampaign
supabase functions deploy enqueueCampaign

# Deploy sendWorker
supabase functions deploy sendWorker
```

### 2. Set Environment Variables

In Supabase Dashboard → Edge Functions → Settings, add:

- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Your service role key
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret

### 3. Set Up Cron Schedules

In Supabase Dashboard → Database → Cron Jobs:

**sendWorker-1m** (runs every minute):
```sql
SELECT cron.schedule(
  'sendWorker-1m',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/sendWorker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
```

Replace:
- `YOUR_PROJECT` with your Supabase project reference
- `YOUR_SERVICE_ROLE_KEY` with your service role key

## API Routes

The following API routes are available:

### Start Campaign
**POST** `/api/campaigns/start`
```json
{ "id": "campaign-uuid" }
```
- Calls `enqueueCampaign` edge function
- Sets campaign status to "Running"

### Pause Campaign
**POST** `/api/campaigns/pause`
```json
{ "id": "campaign-uuid" }
```
- Sets campaign status to "Paused"

### Resume Campaign
**POST** `/api/campaigns/resume`
```json
{ "id": "campaign-uuid" }
```
- Sets all send_queue items back to "Queued"
- Sets campaign status to "Running"

### Stop Campaign
**POST** `/api/campaigns/stop`
```json
{ "id": "campaign-uuid" }
```
- Sets all send_queue items to "Skipped"
- Sets campaign status to "Stopped"

## UI Component

The `CampaignControls` component is available at:
- `src/app/dashboard/campaigns/[id]/CampaignControls.tsx`

It provides buttons for:
- **Start** (Draft/Scheduled → Running)
- **Pause** (Running → Paused)
- **Resume** (Paused → Running)
- **Stop** (Any status → Stopped)

## How It Works

### 1. Enqueue Flow
1. User clicks "Start Campaign"
2. API calls `enqueueCampaign` edge function
3. Function loads campaign and eligible leads (Pending/Skipped states)
4. Filters out suppressed emails
5. Renders templates (replaces `{{name}}`, `{{company}}`, etc.)
6. Inserts rows into `send_queue`
7. Updates `campaign_leads` state to "Queued"

### 2. Worker Flow
1. Cron job calls `sendWorker` every minute
2. Worker picks up to 25 ready items (state="Queued", not_before <= now)
3. For each item:
   - Locks it (state="Locked")
   - Checks campaign is not paused
   - Enforces daily cap (counts sent today, delays if exceeded)
   - Gets Gmail token via `get_campaign_owner_token()` function
   - Composes MIME message
   - Sends via Gmail API
   - Marks as "Done" on success
   - Updates `campaign_leads` to "Sent"
   - Throttles per `rate_per_min` setting
   - On error: retries with exponential backoff (max 3 attempts)

### 3. State Transitions

**Campaign Status:**
- `Draft` → `Scheduled` (when enqueued) → `Running` (when started)
- `Running` → `Paused` (pause) → `Running` (resume)
- Any → `Stopped` (stop)

**Campaign Leads State:**
- `Pending` → `Queued` → `Sending` → `Sent`
- `Pending` → `Skipped` (if suppressed)
- `Queued` → `Error` (if max retries exceeded)

**Send Queue State:**
- `Queued` → `Locked` → `Done` (success)
- `Queued` → `Locked` → `Queued` (retry)
- `Queued` → `Error` (max attempts reached)
- `Queued` → `Skipped` (campaign stopped)

## Configuration

### Campaign Settings
- `daily_cap`: Maximum emails per day (default: 100)
- `rate_per_min`: Throttle rate (default: 20 emails/minute)
- `start_at`: Scheduled start time (optional)

### Suppression
Add emails to `suppress_list` to skip them:
```sql
INSERT INTO suppress_list (workspace_id, email, reason)
VALUES ('workspace-uuid', 'email@example.com', 'bounced');
```

## Testing

### Test Enqueue
```bash
curl -X POST https://your-project.supabase.co/functions/v1/enqueueCampaign \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"campaign_id": "your-campaign-id"}'
```

### Test Worker
```bash
curl -X POST https://your-project.supabase.co/functions/v1/sendWorker \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

### Monitor Queue
```sql
SELECT state, COUNT(*) 
FROM send_queue 
WHERE campaign_id = 'your-campaign-id'
GROUP BY state;
```

## Troubleshooting

### Emails not sending
1. Check campaign status is "Running"
2. Verify Gmail token exists: `SELECT * FROM email_accounts WHERE workspace_id = ... AND is_active = true`
3. Check daily cap: `SELECT daily_cap, (SELECT COUNT(*) FROM campaign_leads WHERE campaign_id = ... AND sent_at >= CURRENT_DATE) as sent_today FROM campaigns WHERE id = ...`
4. Review send_queue errors: `SELECT error, attempts FROM send_queue WHERE state = 'Error'`

### Worker not running
1. Verify cron job is scheduled: `SELECT * FROM cron.job WHERE jobname = 'sendWorker-1m'`
2. Check worker logs in Supabase Dashboard → Edge Functions → Logs

## Next Steps

After setup:
1. ✅ Apply migrations
2. ✅ Deploy edge functions
3. ✅ Set up cron schedule
4. ✅ Test with a small campaign
5. ✅ Monitor queue and adjust rate limits as needed

The system is now ready for reliable email sending with proper rate limiting and safety caps!


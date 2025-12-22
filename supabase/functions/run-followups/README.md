# Block 21729 — Auto Follow-Up Brain v1

## Overview

This edge function runs as a cron job every 15 minutes to automatically send follow-up emails based on homeowner behavior triggers.

## Triggers Supported

1. **no_reply** - Time-based follow-ups (1h, 24h, 3 days, 7 days)
2. **open_spike** - 4+ email opens in 2 hours (high interest)
3. **click** - Link clicked (estimate/portfolio links)
4. **warm_to_hot** - Status changed from warm to hot

## Setup

### 1. Deploy the Function

```bash
supabase functions deploy run-followups
```

### 2. Set Up Cron Job

In Supabase Dashboard → Database → Cron Jobs, create a new cron job:

```sql
SELECT cron.schedule(
  'run-followups-every-15min',
  '*/15 * * * *', -- Every 15 minutes
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/run-followups',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
    )
  ) AS request_id;
  $$
);
```

Or use Supabase CLI:

```bash
supabase functions deploy run-followups --no-verify-jwt
```

### 3. Environment Variables

Set these in Supabase Dashboard → Project Settings → Edge Functions:

- `SEND_EMAIL_FUNCTION_URL` (optional) - URL to email-send edge function
- `ADD_LEAD_EVENT_URL` (optional) - URL to add-lead-event edge function (defaults to auto-detected)

### 4. Default Templates

The migration seeds default follow-up templates. To customize:

```sql
-- Update a default template
UPDATE follow_up_steps
SET email_subject = 'Your custom subject',
    email_body = 'Your custom body'
WHERE campaign_id IS NULL 
  AND trigger_type = 'no_reply' 
  AND wait_hours = 24;

-- Create campaign-specific template
INSERT INTO follow_up_steps (campaign_id, trigger_type, wait_hours, email_subject, email_body)
VALUES (
  'your-campaign-id',
  'no_reply',
  24,
  'Custom subject',
  'Custom body'
);
```

## How It Works

1. Function calls `fetch_leads_needing_followup()` RPC
2. For each eligible lead:
   - Finds sender account from campaign
   - Personalizes email body with lead's first name
   - Sends follow-up email
   - Logs timeline event
   - Marks follow-up as sent in `follow_up_log`
   - Updates `last_email_sent_at` on lead

## Testing

Test manually:

```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/run-followups \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

## Monitoring

Check logs in Supabase Dashboard → Edge Functions → run-followups → Logs

The function returns:
- `processed` - Total leads processed
- `sent` - Successfully sent follow-ups
- `failed` - Failed sends
- `errors` - Array of error messages











































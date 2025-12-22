# Block 32277 — Warranty Inspection Reminder Engine

## Overview

This edge function sends automatic inspection reminders to homeowners at key intervals:
- **30 days before** due date
- **7 days before** due date
- **On the due date**
- **20 days after** missed inspection

## Setup

### 1. Deploy the Function

```bash
supabase functions deploy warranty-inspection-reminders
```

### 2. Environment Variables

Set these in Supabase Dashboard → Edge Functions → Settings:

- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key
- `VONAGE_SMS_URL` (optional) - Vonage/Nexmo SMS endpoint
- `TWILIO_ACCOUNT_SID` (optional) - Twilio account SID
- `TWILIO_AUTH_TOKEN` (optional) - Twilio auth token
- `TWILIO_PHONE_NUMBER` (optional) - Twilio phone number
- `RESEND_API_KEY` (optional) - Resend API key for email

### 3. Schedule Cron Job

Set up a daily cron job to run this function. In Supabase Dashboard → Database → Cron Jobs:

```sql
-- Run daily at 9 AM
SELECT cron.schedule(
  'warranty-inspection-reminders',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/warranty-inspection-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Or use Supabase's pg_cron extension if available.

## Usage

### Manual Invocation

```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/warranty-inspection-reminders \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

### Automatic Execution

The function automatically:
1. Finds all pending inspections
2. Calculates days until due date
3. Sends SMS + Email reminders at 30, 7, 0, and -20 days
4. Tags inspections as missed after -20 day reminder

## Response Format

```json
{
  "ok": true,
  "processed": 5,
  "sent": 5,
  "errors": []
}
```

## Message Templates

The function uses different messages based on days until due:

- **30 days**: "Your annual roofing inspection is coming up next month..."
- **7 days**: "Your annual roofing inspection is coming up next week..."
- **0 days**: "Your annual roofing inspection is due today..."
- **-20 days**: "You missed your annual roofing inspection — reply to reschedule."


































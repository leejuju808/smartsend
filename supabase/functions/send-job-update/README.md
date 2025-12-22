# Block 31440 — Send Job Update Edge Function

## Overview

This edge function sends customer notifications (SMS + Email) when a job stage changes in the roofing pipeline.

## Setup

### 1. Deploy the Function

```bash
supabase functions deploy send-job-update
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

### 3. Database Trigger Setup

The migration creates a trigger that calls `pg_notify` when job stages change. To connect this to the edge function, you can:

**Option A: Use Supabase Realtime + Webhook**
- Set up a webhook that listens to the `job_stage_changed` channel
- Point it to: `https://YOUR_PROJECT.supabase.co/functions/v1/send-job-update`

**Option B: Use a Cron Job**
- Create a cron job that polls for recent stage changes and calls this function

**Option C: Call Directly from Application**
- When updating a job stage in your app, call this function directly

## Usage

### Manual Invocation

```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/send-job-update \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "uuid-here",
    "stage": "scheduled",
    "lead_id": "uuid-here"
  }'
```

### From Database Trigger (via pg_notify)

The trigger automatically notifies when stages change. You'll need a listener service to call this function.

## Message Templates

The function uses stage-specific messages:

- `estimate`: "We have sent your estimate..."
- `approved`: "Your roofing project has been approved..."
- `insurance`: "We are coordinating with your insurance provider..."
- `materials`: "Your roofing materials have been ordered..."
- `scheduled`: "Your roof installation is scheduled..."
- `in_progress`: "Your roof installation has begun..."
- `completed`: "Your roof project is complete..."

## Response

```json
{
  "ok": true,
  "sms_sent": true,
  "email_sent": true,
  "stage": "scheduled",
  "lead_id": "uuid"
}
```



































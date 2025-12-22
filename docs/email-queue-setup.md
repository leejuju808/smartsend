# Email Queue System Setup Guide

This guide will help you set up the email queue system using Supabase Edge Functions and Resend.

## 1. Environment Variables

Set these in Supabase → Project Settings → Functions → Secrets:

```bash
SUPABASE_URL=...your project url...
SUPABASE_SERVICE_ROLE_KEY=...service role key...
RESEND_API_KEY=...resend key...
FROM_EMAIL="SmartSend <noreply@yourdomain.com>"
BATCH_SIZE=25
TRIGGER_TOKEN=some-long-random-string  # optional, for manual HTTP triggers
```

## 2. Deploy the Edge Function

From your repo root:

```bash
supabase functions deploy send-queued-emails
```

## 3. Set up Database Schema

Run the SQL migration in Supabase SQL editor:

```sql
-- Add helpful columns (if not present)
alter table send_queue
  add column if not exists updated_at timestamptz default now(),
  add column if not exists error_text text,
  add column if not exists retry_count int default 0;

-- Indexes for speed
create index if not exists idx_send_queue_status_scheduled_at
  on send_queue (status, scheduled_at);

-- Send logs
create table if not exists send_logs (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid references send_queue(id) on delete set null,
  to_email text not null,
  provider_id text,
  status text not null, -- sent | failed
  error_text text,
  created_at timestamptz not null default now()
);

-- Minimal RLS for now (tighten later)
alter table send_logs enable row level security;
create policy "allow insert logs (service only)" on send_logs
  for insert to service_role using (true) with check (true);
```

## 4. Create Scheduled Trigger

In Supabase Dashboard:
- Go to Database → Functions
- Create a new Scheduled Trigger:
  - **Cron**: `*/2 * * * *` (every 2 minutes)
  - **Endpoint**: `send-queued-emails`
  - **Method**: POST
  - If you set TRIGGER_TOKEN, add `?token=YOUR_TOKEN` in the trigger URL

## 5. Next.js Environment Variables

Add to your `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=... (same as Supabase URL)
TRIGGER_TOKEN=... (same as in function)
```

## 6. Testing

### Manual Trigger
You can manually trigger the email sending by making a POST request to:
```
/api/trigger-send
```

### Dashboard Component
Add the `SendLogs` component to your dashboard to view email sending logs in real-time.

## 7. Usage

To queue an email, insert a row into the `send_queue` table:

```sql
INSERT INTO send_queue (to_email, subject, body, scheduled_at)
VALUES ('user@example.com', 'Welcome!', 'Welcome to SmartSend!', NOW());
```

The system will automatically process queued emails based on the scheduled time.

## Features

- **Batch Processing**: Processes up to 25 emails per run (configurable)
- **Error Handling**: Logs failed sends with error details
- **Retry Logic**: Built-in retry mechanism (configurable)
- **Real-time Monitoring**: Dashboard component for viewing logs
- **Manual Triggers**: API endpoint for testing and manual processing
- **Scheduled Processing**: Automatic processing every 2 minutes
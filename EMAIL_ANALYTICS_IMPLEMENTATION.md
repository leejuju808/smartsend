# Email Analytics Implementation

This implementation adds email tracking and analytics to the SmartSend platform. Every email sent is now tracked with delivery, open, and reply events for dashboard analytics.

## Changes Made

### 1. Database Migration
**File:** `supabase/migrations/20250101_update_email_logs_for_analytics.sql`

- Added `timestamp` column to `email_logs` table for event timing
- Updated status check constraint to include `'delivered'`, `'opened'`, and `'replied'` statuses
- Added composite indexes for efficient querying by campaign and lead

### 2. Edge Function: Email Webhook
**File:** `supabase/functions/email-webhook/index.ts`

Created a new Edge Function that:
- Receives webhook events for email tracking (sent, delivered, opened, replied)
- Validates the status and creates/updates records in `email_logs` table
- Supports both insert and update operations
- Includes CORS support for cross-origin requests

**Usage:**
```bash
POST /functions/v1/email-webhook
{
  "email": "recipient@example.com",
  "status": "sent|delivered|opened|replied",
  "campaign_id": "uuid",
  "lead_id": "uuid"
}
```

### 3. Provider Send Function Updates
**File:** `supabase/functions/provider-send/index.ts`

- Added `campaign_id` and `lead_id` to `SendRequest` type
- Calls the `email-webhook` function after successful email send
- Passes campaign and lead information for analytics tracking

### 4. Queue Dispatcher Updates  
**File:** `supabase/functions/queue-dispatcher/index.ts`

- Updated `sendViaProvider` to pass `campaign_id` and `lead_id` to provider-send
- Ensures analytics data flows through the entire email sending pipeline

## How It Works

1. **Email Sending Flow:**
   - `queue-dispatcher` processes queued emails
   - Calls `provider-send` with campaign and lead context
   - `provider-send` sends the email via Gmail/Outlook API
   - After success, calls `email-webhook` to log the "sent" event

2. **Webhook Events:**
   - External webhooks (Gmail, Outlook, etc.) can call `email-webhook` to update status
   - Status progresses: `sent` → `delivered` → `opened` → `replied`
   - Each event updates the same `email_logs` record with timestamp

3. **Analytics Dashboard:**
   - Query `email_logs` table by `campaign_id` to see all emails for a campaign
   - Filter by status to see delivery, open, and reply rates
   - Use timestamps to track event timing and response velocity

## Database Schema

```sql
-- email_logs table structure
create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  to_email text not null,
  subject text not null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  opened boolean default false,
  clicked boolean default false,
  status text not null default 'queued' check (
    status in ('queued', 'sent', 'delivered', 'failed', 'skipped_suppressed', 'opened', 'replied')
  ),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  timestamp timestamptz default now()
);
```

## Deployment

1. **Apply Migration:**
```bash
supabase db push
```

2. **Deploy Edge Functions:**
```bash
supabase functions deploy email-webhook
supabase functions deploy provider-send
supabase functions deploy queue-dispatcher
```

## Next Steps

To integrate with Gmail webhooks for automatic delivery/open/reply tracking:

1. Set up Gmail Push Notifications in Google Cloud Console
2. Configure webhook endpoint to call `/functions/v1/email-webhook` with status updates
3. The `email-webhook` function will automatically update `email_logs` records

## Example Dashboard Query

```sql
-- Get campaign performance
SELECT 
  status,
  COUNT(*) as count,
  AVG(EXTRACT(EPOCH FROM (timestamp - sent_at))) as avg_seconds
FROM email_logs
WHERE campaign_id = 'your-campaign-id'
GROUP BY status
ORDER BY timestamp DESC;
```

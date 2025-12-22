# Send Queue System Setup Guide

This document outlines the complete send queue system implementation for SmartSend AI, providing a production-ready email sending pipeline with rate limiting, error handling, and campaign controls.

## Overview

The send queue system provides:
- ✅ Queue-based email sending with atomic job claiming
- ✅ Per-inbox rate limiting (e.g., 8 emails per hour)
- ✅ Exponential backoff retry logic
- ✅ Campaign pause/resume controls
- ✅ Comprehensive error handling
- ✅ Unified email logging

## Architecture

```
Campaign → Enqueue API → send_queue → send-dispatcher (cron) → Provider (Gmail/Outlook) → emails table
```

## Database Setup

### 1. Run Migrations

Execute the migrations in order:

```bash
# Migration 1: Create send_queue table and schema
supabase/migrations/20250131000000_send_queue_system.sql

# Migration 2: Create queue_pick function
supabase/migrations/20250131000001_queue_pick_function.sql
```

Or apply via Supabase Dashboard:
1. Go to SQL Editor
2. Run each migration file in order
3. Verify tables and functions were created

### 2. Verify Schema

Check that the following exist:
- `send_queue` table with all required columns
- `queue_pick` function
- `v_queue_ready` view
- Indexes on `send_queue` table

```sql
-- Check table exists
SELECT * FROM send_queue LIMIT 1;

-- Check function exists
SELECT proname FROM pg_proc WHERE proname = 'queue_pick';

-- Check view exists
SELECT * FROM v_queue_ready LIMIT 1;
```

## Edge Function Setup

### 1. Deploy send-dispatcher

```bash
cd supabase
supabase functions deploy send-dispatcher
```

### 2. Set Environment Variables

In Supabase Dashboard → Edge Functions → send-dispatcher → Settings:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SEND_RATE_PER_HOUR=8
SEND_BATCH_SIZE=10
```

### 3. Schedule Cron Job

**Option 1: Supabase Cron (Recommended)**

In Supabase SQL Editor:

```sql
-- Schedule to run every minute
SELECT cron.schedule(
  'send-dispatcher',
  '* * * * *', -- Every minute
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/send-dispatcher',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);
```

**Option 2: Supabase Dashboard**

1. Go to Database → Cron Jobs
2. Create new job:
   - Name: `send-dispatcher`
   - Schedule: `* * * * *` (every minute)
   - SQL: (same as above)

**Option 3: Vercel Cron**

In `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/send-dispatcher",
      "schedule": "* * * * *"
    }
  ]
}
```

Then create `/app/api/cron/send-dispatcher/route.ts`:

```typescript
export async function GET(req: Request) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  const response = await fetch(
    `${process.env.SUPABASE_URL}/functions/v1/send-dispatcher`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  )

  return new Response(JSON.stringify(await response.json()))
}
```

## API Usage

### Enqueue Emails

**POST** `/api/queue/enqueue`

```typescript
const response = await fetch('/api/queue/enqueue', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    campaignId: 'uuid',
    fromInboxId: 'uuid',
    items: [
      {
        leadId: 'uuid',
        subject: 'Hello {{first_name}}',
        html: '<p>Email content</p>',
        text: 'Email content',
        scheduleAt: '2025-01-31T12:00:00Z', // optional
        priority: 100 // optional, default 100
      }
    ]
  })
})
```

### Campaign Send Controls

Add the `CampaignSendControls` component to your campaign page:

```tsx
import CampaignSendControls from '@/components/campaigns/CampaignSendControls'

export default function CampaignPage({ params }: { params: { id: string } }) {
  return (
    <div>
      <CampaignSendControls campaignId={params.id} />
      {/* ... rest of campaign page ... */}
    </div>
  )
}
```

The component displays:
- Queued count
- Sent in last 24 hours
- Error count
- Pause/Resume button

### Toggle Campaign Pause

**POST** `/api/campaigns/[id]/pause`

```typescript
await fetch(`/api/campaigns/${campaignId}/pause`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ isPaused: true })
})
```

## RLS Policies

The system includes Row Level Security policies that:
- Allow team members to read/insert/update queue items for campaigns in their team
- Allow campaign owners to manage their queue
- Allow service role full access (for edge functions)

Adjust the policies in `20250131000000_send_queue_system.sql` based on your team/workspace structure.

## Error Handling & Retry Logic

The system implements exponential backoff:
- Attempt 1: 1 minute delay
- Attempt 2: 2 minutes
- Attempt 3: 4 minutes
- Attempt 4: 8 minutes
- Attempt 5: 16 minutes
- Attempt 6: 32 minutes
- Attempt 7+: 60 minutes (max)

Failed sends are automatically retried with increasing delays using the `next_attempt_at` column.

## Provider Integration

The `sendEmailViaProvider` function in `send-dispatcher/index.ts` is a placeholder. Wire it to your actual Gmail/Outlook sending logic:

```typescript
async function sendEmailViaProvider(row: QueueRow) {
  // Example Gmail send
  const { data: inbox } = await supabase
    .from('inboxes') // or email_accounts
    .select('*')
    .eq('id', row.from_inbox_id)
    .single()

  // Use inbox.access_token to send via Gmail/Outlook API
  const provider_id = await gmailSend({
    accessToken: inbox.access_token,
    to: lead.email,
    subject: row.subject,
    html: row.body_html,
    text: row.body_text
  })

  return provider_id
}
```

## Monitoring

### Queue Stats

Query queue status:

```sql
-- Pending items
SELECT count(*) FROM send_queue WHERE status = 'pending';

-- Items ready to send
SELECT count(*) FROM v_queue_ready;

-- Errors in last hour
SELECT count(*) FROM send_queue 
WHERE status = 'error' 
AND updated_at > now() - interval '1 hour';
```

### Dispatcher Logs

Monitor the dispatcher edge function logs in Supabase Dashboard:
1. Go to Edge Functions → send-dispatcher
2. View Logs tab
3. Check for errors or processing stats

## Troubleshooting

### Queue Not Processing

1. Check cron job is running:
   ```sql
   SELECT * FROM cron.job WHERE jobname = 'send-dispatcher';
   ```

2. Check dispatcher function is accessible:
   ```bash
   curl -X POST https://your-project.supabase.co/functions/v1/send-dispatcher \
     -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
   ```

3. Verify `queue_pick` function works:
   ```sql
   SELECT * FROM queue_pick(10, 8);
   ```

### Rate Limiting Not Working

1. Verify `SEND_RATE_PER_HOUR` is set correctly
2. Check `sent_at` timestamps in `send_queue`
3. Ensure `from_inbox_id` is properly set

### Campaign Pause Not Working

1. Verify `is_paused` column exists on `campaigns` table
2. Check `queue_pick` function includes the pause check
3. Ensure RLS policies allow reading `campaigns.is_paused`

## Next Steps

1. ✅ Run database migrations
2. ✅ Deploy edge function
3. ✅ Set environment variables
4. ✅ Schedule cron job
5. ✅ Wire provider sending logic
6. ✅ Add `CampaignSendControls` to campaign pages
7. ✅ Test enqueue API
8. ✅ Monitor queue processing

## Notes

- The `inboxes` table referenced in the schema may map to `email_accounts` or `mailboxes` in your system. Update foreign key constraints as needed.
- The RLS policies assume a `team_members` table structure. Adjust if your schema differs.
- The `emails` table insert is optional - remove if you don't need unified email logging.


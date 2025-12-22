# MVP Sending Pipeline

Complete implementation guide for the core email sending MVP with Gmail OAuth integration.

## Overview

This system provides:
- ✅ Campaign email scheduling
- ✅ Queue-based processing
- ✅ Gmail OAuth sending
- ✅ Send logging and tracking
- ✅ Lead activity updates

## Architecture

```
Campaign → Enqueue API → send_queue → send-queue-worker → Gmail API → send_logs
```

## Database Setup

### 1. Run Migration

Execute the migration in Supabase SQL editor:

```bash
# Run this migration
supabase/migrations/20250130000000_create_send_queue_mvp.sql
```

This creates:
- `send_logs` table - immutable log of all sent emails
- `send_queue` table - queue of pending/sending/sent/failed emails

### 2. Verify Tables

```sql
SELECT * FROM send_queue LIMIT 5;
SELECT * FROM send_logs LIMIT 5;
```

## API Endpoints

### Enqueue Campaign Emails

**POST** `/api/campaigns/[id]/enqueue`

Enqueues all contacts for a campaign with smart scheduling.

**Example:**
```bash
curl -X POST https://yourapp.com/api/campaigns/123-abc/enqueue \
  -H "Cookie: sb-access-token=..."
```

**Response:**
```json
{
  "ok": true,
  "enqueued": 45,
  "campaign_id": "123-abc"
}
```

## Edge Function Deployment

### 1. Deploy Worker

```bash
cd supabase
supabase functions deploy send-queue-worker
```

### 2. Set Environment Variables

In Supabase Dashboard → Edge Functions → Settings:

```
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
```

### 3. Schedule Cron Job

In Supabase SQL Editor:

```sql
-- Schedule to run every minute
SELECT cron.schedule(
  'send-queue-worker',
  '* * * * *', -- Every minute
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/send-queue-worker',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);
```

Or use Supabase Dashboard:
- Go to Database → Cron Jobs
- Create new job
- Schedule: `* * * * *` (every minute)
- Command: Call the function URL

## Campaign Templates

Templates support simple handlebars-style variables:

```text
Subject: Hi {{first_name}}, interested in {{company}}?

Body: 
Hi {{first_name}},

We noticed {{company}} might benefit from our services.

Let's connect!

Best,
Team
```

**Supported variables:**
- `{{first_name}}`
- `{{last_name}}`
- `{{company}}`
- `{{email}}`

## Testing

### 1. Create Test Campaign

```typescript
// In your Next.js app
const response = await fetch('/api/campaigns', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Test Campaign',
    workspace_id: 'your-workspace-id',
    subject_template: 'Test: {{first_name}}',
    body_template: '<p>Hi {{first_name}}, testing!</p>',
    start_at: new Date().toISOString()
  })
});
```

### 2. Enqueue

```bash
curl -X POST https://yourapp.com/api/campaigns/YOUR_CAMPAIGN_ID/enqueue
```

### 3. Monitor Queue

```sql
-- Check queue status
SELECT status, COUNT(*) 
FROM send_queue 
GROUP BY status;

-- Check recent sends
SELECT * FROM send_logs 
ORDER BY sent_at DESC 
LIMIT 10;
```

### 4. Check Worker Logs

In Supabase Dashboard → Edge Functions → Logs

## Lead Status Updates

The worker automatically:
- Updates `contacts.updated_at` on successful send
- Stores send history in `send_logs`
- Updates queue status to `sent`

## Error Handling

### Retry Logic
- Failed sends retry up to 3 times
- Exponential backoff between retries
- Status: `pending` → `sending` → `sent` | `failed`

### Common Errors

**"No Gmail connection"**
- Solution: User needs to connect Gmail in Settings → Mailbox

**"Token refresh failed"**
- Solution: Re-authenticate Gmail connection

**"Contact email missing"**
- Solution: Ensure contacts table has email field populated

## Monitoring

### Queue Health

```sql
-- Pending emails count
SELECT COUNT(*) FROM send_queue WHERE status = 'pending';

-- Failed emails needing attention
SELECT * FROM send_queue WHERE status = 'failed' ORDER BY last_attempt_at DESC;

-- Processing rate (last hour)
SELECT COUNT(*) FROM send_logs 
WHERE sent_at > NOW() - INTERVAL '1 hour';
```

### Campaign Performance

```sql
-- Campaign send stats
SELECT 
  c.name,
  COUNT(DISTINCT sq.id) as total_enqueued,
  COUNT(DISTINCT CASE WHEN sq.status = 'sent' THEN sq.id END) as sent,
  COUNT(DISTINCT CASE WHEN sq.status = 'failed' THEN sq.id END) as failed,
  MIN(sq.scheduled_at) as first_send,
  MAX(sq.scheduled_at) as last_send
FROM campaigns c
LEFT JOIN send_queue sq ON sq.campaign_id = c.id
GROUP BY c.id, c.name;
```

## Rate Limiting

- **Staggering**: 45 seconds between emails
- **Batch size**: 25 emails per worker run
- **Schedule**: 1 minute intervals

Adjust these in:
- Enqueue API: `staggerMs` variable
- Worker: `limit(25)` in query

## Security

- ✅ RLS enabled on all tables
- ✅ Workspace-based access control
- ✅ Service role for worker operations
- ✅ Gmail OAuth token refresh handled securely

## Next Steps

1. **Add Reply Detection** - Integrate with existing reply detection
2. **Tracking Pixels** - Add open/click tracking
3. **Bounce Handling** - Catch and suppress bounces
4. **A/B Testing** - Support variant testing
5. **Scheduling Rules** - Time-zone aware scheduling

## Troubleshooting

### Emails Not Sending

1. Check worker is scheduled: `SELECT * FROM cron.job;`
2. Check queue has items: `SELECT * FROM send_queue WHERE status = 'pending';`
3. Check worker logs in Dashboard
4. Verify Gmail connection in mailboxes table

### Performance Issues

- Increase stagger time for fewer simultaneous sends
- Reduce batch size if hitting rate limits
- Check database indexes are created

## Support

For issues or questions:
1. Check worker logs in Supabase Dashboard
2. Review `send_queue` for error messages
3. Verify Gmail connection is active
4. Check rate limiting settings 
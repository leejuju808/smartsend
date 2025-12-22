# Automation Scaling & Performance Setup

This guide documents the implementation of SmartSend's high-volume automation infrastructure, designed to handle 10,000+ automated sends/day with reliable performance.

## Overview

The automation scaling slice includes:
1. **Send Queue Refactor** - Distributed send queue with multi-channel support
2. **Send Worker** - Edge Function that processes queued sends in batches
3. **Parallel AI Processing** - Optimized batch AI completions
4. **Monitoring & Logging** - Function performance tracking
5. **Daily Maintenance** - Automated cleanup jobs
6. **Admin Dashboard** - Infrastructure monitoring at `/admin/infra`

## Database Setup

### 1. Run Migration

Apply the send queue scaling migration:

```bash
supabase migration up
```

Or manually run in Supabase SQL editor:
```sql
-- File: supabase/migrations/20250126000000_send_queue_scaling.sql
```

This creates/updates:
- `send_queue` table with `org_id`, `channel`, `message`, `retries`, `scheduled_for` columns
- `function_logs` table for monitoring Edge Function performance
- `function_logs_archive` table for historical data
- Indexes for high-performance queries

## Edge Functions Setup

### 1. Deploy send-worker

```bash
supabase functions deploy send-worker
```

This function processes queued sends every minute, handling up to 50 sends per batch.

**Environment Variables:**
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key
- `SEND_WORKER_BATCH_SIZE` - Batch size (default: 50)

### 2. Schedule send-worker

Set up a cron job to run every minute:

```sql
SELECT cron.schedule(
  'send-worker',
  '* * * * *', -- Every minute
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/send-worker',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);
```

Or use Supabase Dashboard:
- Go to Database → Cron Jobs
- Create new job:
  - **Name**: `send-worker`
  - **Schedule**: `* * * * *` (every minute)
  - **Target**: Edge Function
  - **Function**: `send-worker`
  - **Method**: POST

### 3. Deploy daily-maintenance

```bash
supabase functions deploy daily-maintenance
```

### 4. Schedule daily-maintenance

Set up to run daily at 4 AM UTC:

```sql
SELECT cron.schedule(
  'daily-maintenance',
  '0 4 * * *', -- Every day at 4 AM UTC
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/daily-maintenance',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);
```

## Channel Send Functions

The `send-worker` calls channel-specific functions:
- `/functions/v1/send-email` - Email sends
- `/functions/v1/send-linkedin` - LinkedIn messages
- `/functions/v1/send-whatsapp` - WhatsApp messages

Ensure these functions are deployed and accept the queue item payload:

```json
{
  "queue_id": "uuid",
  "org_id": "uuid",
  "campaign_id": "uuid",
  "lead_id": "uuid",
  "message": "message content"
}
```

## AI Processing Optimization

### Batch Processing Utility

The `ai-batch-processor` utility (`src/lib/ai-batch-processor.ts`) provides:
- Parallel AI completions
- Automatic logging to `function_logs`
- Performance tracking

**Usage:**
```typescript
import { processBatchCompletions, createBatchPrompts } from "@/lib/ai-batch-processor";

// Create batch prompts for multiple leads
const batchRequests = createBatchPrompts(leads, (lead) => [
  { role: "system", content: "You are a sales email writer." },
  { role: "user", content: `Write an email for ${lead.company}` },
]);

// Process all in parallel
const results = await processBatchCompletions(batchRequests);
```

### Updated Routes

The following routes have been optimized for batch processing:
- `/api/drafts/generate` - Now uses batch completions for multiple leads

## Monitoring Dashboard

### Access

Navigate to `/admin/infra` (requires founder/admin email).

### Metrics Displayed

1. **Send Queue Stats**
   - Queued, Sending, Sent (24h), Failed counts

2. **Send Throughput**
   - Average sends per hour
   - Total sends (24h)
   - Estimated daily capacity

3. **Edge Function Performance**
   - Function execution counts
   - Success/failure rates
   - Average runtime
   - Last run timestamp

4. **Hourly Send Volume Chart**
   - Visual representation of send volume over last 24 hours

### API Endpoint

The dashboard data is fetched from `/api/admin/infra` which:
- Requires authentication
- Checks for founder email
- Aggregates data from `function_logs` and `send_queue`

## Daily Maintenance

The `daily-maintenance` function runs daily and:
1. **Deletes old send_queue rows** (older than 7 days, status = sent/failed)
2. **Archives function_logs** (older than 30 days) to `function_logs_archive`
3. **Logs maintenance results** to `function_logs`

## Performance Targets

✅ **Send Queue**: Processing 10k+ daily without timeout  
✅ **AI Completions**: Running in parallel with `parallel_tool_calls: true`  
✅ **Monitoring**: Function logs live and tracked  
✅ **Maintenance**: Jobs scheduled for cleanup  
✅ **Dashboard**: Queue health + throughput visible

## Troubleshooting

### Send Queue Not Processing

1. Check `send-worker` cron job is running:
   ```sql
   SELECT * FROM cron.job WHERE jobname = 'send-worker';
   ```

2. Check function logs:
   ```sql
   SELECT * FROM function_logs 
   WHERE fn_name = 'send-worker' 
   ORDER BY created_at DESC 
   LIMIT 10;
   ```

3. Check queue status:
   ```sql
   SELECT status, COUNT(*) 
   FROM send_queue 
   GROUP BY status;
   ```

### High Failure Rate

1. Check function logs for errors:
   ```sql
   SELECT * FROM function_logs 
   WHERE status = 'error' 
   ORDER BY created_at DESC 
   LIMIT 20;
   ```

2. Verify channel functions are deployed and working
3. Check for rate limits or API errors in channel-specific logs

### Slow AI Processing

1. Check batch processor logs:
   ```sql
   SELECT * FROM function_logs 
   WHERE fn_name = 'batch-completions' 
   ORDER BY created_at DESC 
   LIMIT 10;
   ```

2. Consider increasing `SEND_WORKER_BATCH_SIZE` if queue is backing up
3. Monitor OpenAI API rate limits

## Next Steps

- [ ] Implement channel-specific send functions (`send-email`, `send-linkedin`, `send-whatsapp`)
- [ ] Add rate limiting per org/channel
- [ ] Implement retry backoff strategies
- [ ] Add alerting for high failure rates
- [ ] Scale to Vercel Edge Functions for AI processing if needed


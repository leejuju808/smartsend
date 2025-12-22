# Block 8100 — SmartSend Campaign Flow Optimizer (Reliable Queue + Scheduler Sync)

## Implementation Summary

This implementation makes SmartSend's sending engine bulletproof by ensuring campaigns always:
- Pull leads in the correct order
- Enqueue them safely
- Sync with the scheduler
- Never double-send or skip

## Architecture

```
Supabase → Edge Function → Reliable Queue → Next.js Server Actions → Logs
```

## Components Created

### 1. Database Migration
**File**: `supabase/migrations/20250131000000_block8100_smartsend_queue.sql`

- Creates `smartsend_queue` table with status tracking
- Adds `next_run` and `send_interval_seconds` fields to `campaigns` table
- Creates RPC function `smartsend_get_next_lead` to safely get next unsent lead
- Sets up proper indexes and RLS policies

### 2. Scheduler Edge Function
**File**: `supabase/functions/smartsend_scheduler/index.ts`

- Runs every minute via cron
- Finds active campaigns where `next_run <= now()`
- Pulls next unsent lead using RPC function
- Enqueues lead into `smartsend_queue`
- Updates campaign's `next_run` based on `send_interval_seconds`

### 3. Worker Edge Function
**File**: `supabase/functions/smartsend_worker/index.ts`

- Runs every minute via cron
- Processes one job at a time (prevents overlap)
- Marks job as "processing" before sending
- Sends email using shared `sendEmail` helper
- Marks as "sent" on success, "retry" or "failed" on error
- Implements exponential backoff for retries (max 3 attempts)
- Logs to `logs` table (gracefully handles if table doesn't exist)

### 4. Server Action for Manual Enqueue
**File**: `src/app/actions/enqueueLead.ts`

- Allows users to manually enqueue a lead
- Validates campaign and lead access
- Prevents duplicate enqueues
- Useful for retrying failed sends

### 5. Cron Configuration
**File**: `supabase/config.toml`

- Added cron jobs for both scheduler and worker
- Both run every minute (`* * * * *`)

## Database Schema

### smartsend_queue Table
```sql
- id: uuid (primary key)
- campaign_id: uuid (references campaigns)
- lead_id: uuid (references leads)
- status: text ('pending', 'processing', 'sent', 'failed', 'retry')
- attempts: int (default 0)
- scheduled_at: timestamptz
- processed_at: timestamptz
- error: text
- created_at: timestamptz
```

### Campaigns Table Additions
```sql
- next_run: timestamptz (when to check for next lead)
- send_interval_seconds: int (default 60, seconds between sends)
```

## Usage

### Starting a Campaign

1. Set campaign `status = 'running'`
2. Set `next_run = now()` (or desired start time)
3. Set `send_interval_seconds` (e.g., 60 for 1 email per minute)
4. Scheduler will automatically start enqueueing leads

### Manual Enqueue

```typescript
import { enqueueLead } from "@/app/actions/enqueueLead";

await enqueueLead(campaignId, leadId);
```

### Monitoring

Query queue status:
```sql
SELECT 
  campaign_id,
  status,
  COUNT(*) as count
FROM smartsend_queue
GROUP BY campaign_id, status;
```

Query campaign metrics:
```sql
SELECT 
  c.id,
  c.name,
  c.next_run,
  COUNT(CASE WHEN q.status = 'pending' THEN 1 END) as pending_count,
  COUNT(CASE WHEN q.status = 'sent' THEN 1 END) as sent_count,
  COUNT(CASE WHEN q.status = 'failed' THEN 1 END) as failed_count
FROM campaigns c
LEFT JOIN smartsend_queue q ON q.campaign_id = c.id
WHERE c.status = 'running'
GROUP BY c.id, c.name, c.next_run;
```

## Deployment Steps

1. **Run Migration**
   ```bash
   # Apply the migration
   supabase migration up
   ```

2. **Deploy Edge Functions**
   ```bash
   supabase functions deploy smartsend_scheduler
   supabase functions deploy smartsend_worker
   ```

3. **Verify Cron Jobs**
   The cron jobs are configured in `supabase/config.toml` and should be automatically set up when you deploy.

4. **Test**
   - Create a test campaign with `status = 'running'`
   - Set `next_run = now()`
   - Add some leads with `status = 'pending'`
   - Watch the queue populate and emails send

## Error Handling

- **Failed sends**: Automatically retried up to 3 times with exponential backoff
- **Missing accounts**: Worker logs error and marks as failed
- **Missing leads/campaigns**: Worker marks job as failed with error message
- **Duplicate enqueues**: Prevented by RPC function and manual enqueue validation

## Future Enhancements

- Add UI indicators for queue count, next run time, errors
- Add dashboard metrics for emails sent today
- Add webhook notifications for failed sends
- Add rate limiting per account/provider
- Add timezone-aware scheduling

## Notes

- The worker processes one job at a time to prevent race conditions
- The scheduler can process multiple campaigns per run
- Both functions are idempotent and safe to run concurrently
- Logs table insert is optional (gracefully fails if table doesn't exist)


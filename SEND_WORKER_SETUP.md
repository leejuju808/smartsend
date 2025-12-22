# Send Worker Job Queue System Setup

This document describes the job queue system with atomic locks, exponential backoff, and automatic retries.

## Architecture

### Components

1. **SQL Migration** (`20251026_send_worker.sql`): Extends `campaign_logs` with job fields and provides atomic dequeue RPC
2. **Deno Edge Function** (`supabase/functions/sendWorker/`): Batch sender with backoff logic
3. **HTTP Trigger** (`src/app/api/queue/run/route.ts`): Optional manual trigger
4. **UI Updates**: Attempt count badge in send queue table

## Database Schema

### `provider_accounts` Table

Stores OAuth'd Gmail/Outlook accounts for sending:

```sql
create table if not exists public.provider_accounts (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('gmail', 'outlook')),
  access_token text not null,
  refresh_token text,
  email_address text not null,
  settings jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### Extended `campaign_logs` Table

New columns for job processing:

- `attempt_count`: Number of retry attempts
- `next_attempt_at`: When to retry next (exponential backoff)
- `locked_at`: Timestamp when job was claimed by worker
- `locked_by`: Worker ID that claimed the job
- `provider_account_id`: FK to connected email account
- `to_email`, `subject`, `body_text`, `body_html`: Email content
- `status`: queued, sending, sent, failed

### Atomic Dequeue Function

`dequeue_campaign_logs(limit, worker_id)`:
- Claims up to N ready jobs atomically
- Implements SKIP LOCKED semantics
- Returns jobs with status 'sending'
- Auto-expires locks after 5 minutes

### Bump Attempt Helper

`bump_attempt_and_set(log_id, status, error, next_at)`:
- Atomically increments attempt count
- Updates status and error message
- Sets next retry time with exponential backoff

## Send Worker Edge Function

### Configuration

Set these environment variables in Supabase Dashboard:

```bash
SEND_WORKER_TOKEN=your-secret-token-here
SEND_WORKER_BATCH=25  # Jobs per run
SEND_MAX_ATTEMPTS=5   # Max retries before giving up
```

### Backoff Schedule

Exponential backoff on failures:
- Attempt 1: Retry in 1 minute
- Attempt 2: Retry in 5 minutes
- Attempt 3: Retry in 15 minutes
- Attempt 4: Retry in 1 hour
- Attempt 5: Retry in 6 hours
- Attempt 6+: Mark as terminal failure

### Sending Providers

Currently supports:
- **Gmail**: Gmail API (users.messages.send)
- **Outlook**: Microsoft Graph API (sendMail)

Token refresh should be handled by a separate process/cron.

## Supabase Scheduled Cron Setup

### In Supabase Dashboard

1. Go to **Edge Functions** → **Schedule**
2. Click **Create Cron Job**
3. Configure:

   **Function**: `sendWorker`
   
   **Cron Expression**: `* * * * *` (every minute)
   
   **Headers**:
   ```
   x-cron-token: YOUR_SECRET_TOKEN
   ```

   **Environment Variables**:
   - `SEND_WORKER_BATCH`: `25`
   - `SEND_MAX_ATTEMPTS`: `5`

4. Click **Save**

### Alternative: Manual Trigger

For manual testing or on-demand runs:

```bash
# Trigger via HTTP
POST /api/queue/run
```

Or directly:

```bash
curl -X POST https://your-project.supabase.co/functions/v1/sendWorker \
  -H "x-cron-token: YOUR_TOKEN"
```

## UI Updates

### Send Queue Table

The send queue now displays attempt counts:

```tsx
{
  accessorKey: "retry_count",
  header: "Attempts",
  cell: ({ row }) => {
    const a = row.original.retry_count ?? 0;
    return <span className="text-xs text-muted-foreground">{a}</span>;
  },
}
```

## Workflow

### 1. Job Creation

Create jobs in `campaign_logs`:

```sql
INSERT INTO campaign_logs (
  lead_id, campaign_id, provider_account_id,
  to_email, subject, body_text, body_html,
  status, next_attempt_at, attempt_count
) VALUES (
  'lead-uuid', 'campaign-uuid', 'account-uuid',
  'recipient@example.com', 'Subject', 'Plain text', '<html>',
  'queued', NOW(), 0
);
```

### 2. Worker Claiming

Worker calls `dequeue_campaign_logs(25, 'worker-id')`:
- Finds jobs where `status = 'queued'` and `next_attempt_at <= now()`
- Atomically updates to `status = 'sending'` and locks
- Returns claimed jobs

### 3. Sending

For each job:
1. Load provider account credentials
2. Send via Gmail API or Graph API
3. On success: Mark as `sent`, release lock
4. On failure: Compute backoff, mark as `queued` with `next_attempt_at` set

### 4. Retry Logic

Failed jobs are rescheduled with exponential backoff:
- Status remains `queued` until max attempts reached
- `attempt_count` increments each retry
- After max attempts, status becomes `failed` (terminal)

## Monitoring

### Check Queue Status

```sql
SELECT 
  status,
  COUNT(*) as count,
  AVG(attempt_count) as avg_attempts
FROM campaign_logs
WHERE status IN ('queued', 'sending', 'failed')
GROUP BY status;
```

### View Recent Failures

```sql
SELECT 
  to_email,
  attempt_count,
  last_error,
  next_attempt_at
FROM campaign_logs
WHERE status = 'failed'
ORDER BY updated_at DESC
LIMIT 20;
```

### Check Locked Jobs

```sql
SELECT 
  COUNT(*) as locked,
  MAX(locked_at) as oldest_lock
FROM campaign_logs
WHERE locked_at IS NOT NULL
  AND locked_at < NOW() - INTERVAL '5 minutes';
```

## Troubleshooting

### Stuck Jobs

If jobs remain locked for >5 minutes:
1. Locks auto-expire after 5 minutes
2. Jobs automatically return to queued state
3. Check worker logs for errors

### Rate Limiting

Consider implementing per-account rate limiting:
- Query `provider_accounts.settings` for `rate_per_min`
- Group jobs by account before processing
- Process fewer jobs per run if rate limits are strict

### Token Refresh

Access tokens expire. Implement a separate refresh cron:

```typescript
// Example token refresh logic
async function refreshToken(account) {
  const newToken = await fetchRefreshToken(account.refresh_token);
  await supabase
    .from('provider_accounts')
    .update({ access_token: newToken.access_token })
    .eq('id', account.id);
}
```

## Notes

- Worker ID is generated per cold start (UUID)
- Locks expire after 5 minutes (safety net)
- Max attempts is configurable (default: 5)
- Batch size should align with rate limits
- Token refresh is not handled here (delegate to separate service)

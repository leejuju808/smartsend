# Send Queue Feature

This feature implements an atomic job claiming system with retries for email sending using Supabase Edge Functions and SQL.

## Components

### 1. SQL Migration (`supabase/migrations/20250124_queue.sql`)
- Creates `email_jobs` table with status tracking
- Implements atomic `claim_email_jobs` RPC function
- Sets up Row Level Security (RLS) policies

### 2. Supabase Edge Function (`supabase/functions/queue-dispatcher/`)
- Processes queued emails in batches
- Implements exponential backoff retry logic
- Handles job claiming atomically to prevent race conditions

### 3. Next.js API Route (`src/app/api/queue-email/route.ts`)
- Enqueues new email jobs
- Validates user authentication
- Inserts jobs into the queue

### 4. UI Hook (`src/components/useQueueEmail.ts`)
- Simple function to call the enqueue API
- Handles errors and responses

## Deployment

### 1. Run the SQL Migration
```bash
supabase db push
```

### 2. Deploy the Edge Function
```bash
# Set environment variables
supabase functions secrets set \
  SUPABASE_URL=your_supabase_url \
  SUPABASE_SERVICE_ROLE_KEY=your_service_role_key \
  PROVIDER_API_KEY=your_email_provider_key \
  BATCH_SIZE=25 \
  --project-ref your_project_ref

# Deploy the function
supabase functions deploy queue-dispatcher --project-ref your_project_ref

# Schedule to run every minute
supabase functions schedule create queue-dispatcher \
  --cron "* * * * *" \
  --project-ref your_project_ref
```

## Usage

```typescript
import { queueEmail } from '@/components/useQueueEmail';

// Queue an email for immediate sending
await queueEmail({
  to: 'user@example.com',
  subject: 'Hello World',
  html: '<p>This is a test email</p>'
});

// Queue an email for future sending
await queueEmail({
  to: 'user@example.com',
  subject: 'Scheduled Email',
  html: '<p>This will be sent later</p>',
  scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now
  maxAttempts: 3
});
```

## Job States

- `queued`: Ready to be processed
- `in_progress`: Currently being processed by a worker
- `sent`: Successfully sent
- `failed`: Failed after max attempts
- `retry_wait`: Waiting for retry (exponential backoff)

## Features

- **Atomic Job Claiming**: Prevents race conditions when multiple workers process jobs
- **Exponential Backoff**: Failed jobs are retried with increasing delays (1, 2, 4, 8... minutes)
- **Configurable Retries**: Set max attempts per job
- **Scheduled Sending**: Queue emails for future delivery
- **Error Tracking**: Store last error message for debugging
- **Worker Safety**: Jobs are locked to prevent duplicate processing
# Send Queue + Scheduler Implementation

This implementation provides a robust, hands-off email scheduling system for SmartSend that allows campaigns to fire automatically without manual intervention.

## Architecture Overview

The system consists of several key components:

1. **Database Schema** - `email_jobs` and `email_sends` tables with proper RLS
2. **PostgreSQL Function** - `lock_due_email_jobs()` for fair job locking
3. **Edge Function** - `process_queue` for processing due jobs
4. **API Route** - `/api/schedule-email` for enqueueing jobs
5. **Client Hook** - `useScheduleEmail` for easy integration
6. **Cron Configuration** - Automatic processing every minute

## Database Schema

### email_jobs Table
```sql
create table if not exists public.email_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  to_email text not null check (to_email <> ''),
  subject text not null,
  body_html text not null,
  provider text not null default 'resend',
  status text not null check (status in ('queued','processing','sent','failed','canceled')) default 'queued',
  attempts int not null default 0,
  max_attempts int not null default 5,
  last_error text,
  scheduled_at timestamptz not null,
  locked_by text,
  locked_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
```

### email_sends Table
```sql
create table if not exists public.email_sends (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.email_jobs(id) on delete cascade,
  provider_id text,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  created_at timestamptz not null default now()
);
```

## Key Features

### 1. Fair Job Locking
The `lock_due_email_jobs()` function ensures jobs are processed fairly:
- Uses `FOR UPDATE SKIP LOCKED` to prevent race conditions
- Processes jobs in chronological order
- Limits batch size to prevent overwhelming the system

### 2. Automatic Processing
- Cron job runs every minute via Supabase Edge Functions
- Processes up to 50 jobs per batch
- Handles failures gracefully with exponential backoff

### 3. Provider Agnostic
- Easy to swap email providers (Resend, SendGrid, AWS SES, etc.)
- Tracks provider-specific message IDs
- Maintains delivery status tracking

### 4. Security & Compliance
- Row Level Security (RLS) ensures users only access their own jobs
- Proper authentication on all API endpoints
- Audit trail through `email_sends` table

## Usage Examples

### Basic Email Scheduling
```typescript
import { scheduleEmail } from '@/lib/useScheduleEmail';

// Schedule an email for tomorrow at 9 AM
await scheduleEmail({
  to: 'customer@example.com',
  subject: 'Welcome to SmartSend!',
  html: '<p>Thank you for signing up...</p>',
  scheduledAt: new Date('2024-01-26T09:00:00Z'),
});
```

### Campaign Email Scheduling
```typescript
await scheduleEmail({
  campaignId: 'campaign-uuid',
  to: 'lead@company.com',
  subject: 'Follow-up: Your Demo Request',
  html: '<p>Hi there, following up on your demo request...</p>',
  scheduledAt: new Date('2024-01-26T14:30:00Z'),
  workspaceId: 'workspace-uuid',
});
```

### React Component Integration
```tsx
import { EmailScheduler } from '@/components/EmailScheduler';

function CampaignPage() {
  return (
    <div>
      <h1>Campaign Management</h1>
      <EmailScheduler />
    </div>
  );
}
```

## Deployment Steps

### 1. Run Database Migrations
```bash
supabase db push
```

### 2. Deploy Edge Function
```bash
supabase functions deploy process_queue --no-verify-jwt
```

### 3. Configure Cron Job
The cron job is automatically configured via `supabase/config.toml`:
```toml
[cron.jobs.process_queue]
schedule = "* * * * *"   # every minute
endpoint = "/functions/v1/process_queue"
```

### 4. Update Environment Variables
Ensure these are set in your Supabase project:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PROVIDER_API_KEY` (for your email provider)

## Monitoring & Observability

### Job Status Tracking
Monitor job status through the `email_jobs` table:
- `queued` - Waiting to be processed
- `processing` - Currently being sent
- `sent` - Successfully delivered
- `failed` - Failed after max attempts
- `canceled` - Manually canceled

### Delivery Tracking
Track delivery events through `email_sends`:
- `delivered_at` - When provider confirmed delivery
- `opened_at` - When recipient opened (if tracking enabled)
- `clicked_at` - When recipient clicked (if tracking enabled)

### Error Handling
- Failed jobs include `last_error` field with detailed error messages
- Exponential backoff prevents overwhelming providers
- Max retry attempts prevent infinite loops

## Integration with Existing System

This implementation integrates seamlessly with SmartSend's existing:
- Campaign management system
- User authentication
- Workspace organization
- Analytics and reporting

The system maintains backward compatibility while adding powerful scheduling capabilities.

## Benefits

1. **Hands-off Operation** - Campaigns fire automatically without manual intervention
2. **Scalable** - Processes hundreds of emails per minute
3. **Reliable** - Built-in retry logic and error handling
4. **Provider Agnostic** - Easy to switch email providers
5. **Secure** - Proper authentication and authorization
6. **Observable** - Comprehensive tracking and monitoring

This implementation moves SmartSend toward its MVP's core functionality while maintaining the flexibility to scale and adapt to future requirements.
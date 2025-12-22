# Send Queue Implementation

This document describes the Send Queue feature implementation for the SmartSend AI application.

## Overview

The Send Queue system provides a robust, scalable email queuing and processing system with:
- Atomic job claiming and locking
- Automatic retry logic with exponential backoff
- Rate limiting per user
- Multiple email provider support (Gmail, Outlook, SMTP)
- Comprehensive job status tracking

## Components

### 1. Database Schema

**Migration**: `supabase/migrations/20250131_send_queue_enhanced.sql`

Creates/updates the `send_queue` table with:
- `id`, `user_id`, `campaign_id`, `recipient_id`
- `to_email`, `subject`, `body_html`
- `provider` ('gmail' | 'outlook' | 'smtp')
- `status` ('pending' | 'locked' | 'sent' | 'failed')
- `attempts`, `last_error`
- `scheduled_at`, `locked_at`, `worker_id`, `sent_at`

**Helper Functions**:
- `claim_send_jobs(p_user_id, p_limit, p_worker_id)` - Atomically claim and lock jobs
- `mark_job_sent(p_id)` - Mark job as successfully sent
- `mark_job_failed(p_id, p_error)` - Mark job as failed with retry logic

### 2. Email Logs Enhancement

**Migration**: `supabase/migrations/20250131_email_logs_enhancement.sql`

Adds missing fields to `email_logs`:
- `body_html` - HTML content of sent email
- `body_text` - Plain text content of sent email
- `provider` - Email provider used
- `provider_message_id` - Provider's message ID for tracking
- `opened_at`, `clicked_at`, `click_url` - Engagement tracking

### 3. Supabase Edge Function

**Location**: `supabase/functions/send-queue/index.ts`

Processes queued emails:
- Claims jobs for a user using atomic locking
- Sends emails via provider (currently stubbed)
- Writes to `email_logs` on success
- Marks jobs as sent or failed
- Implements per-user rate limiting

**Configuration** (via Environment Variables):
- `BATCH_SIZE` - Max jobs to process per user (default: 20)
- `RATE_PER_MIN` - Rate limit per user (default: 60)
- `CRON_SECRET` - Secret for securing cron invocations
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key

**Deploy**:
```bash
supabase functions deploy send-queue
```

**Schedule** (Supabase Dashboard):
1. Go to Edge Functions → send-queue
2. Add schedule: `* * * * *` (every minute)
3. Add header: `Authorization: Bearer ${CRON_SECRET}`

**Invoke via Query Param**:
```bash
# Process single user
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://your-project.supabase.co/functions/v1/send-queue?user_id=USER_UUID

# Process all pending users
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://your-project.supabase.co/functions/v1/send-queue
```

### 4. Enqueue API Route

**Location**: `app/api/campaigns/[id]/enqueue/route.ts`

HTTP endpoint to queue emails for sending:

**POST** `/api/campaigns/[id]/enqueue`

**Request Body**:
```json
{
  "defaultSubject": "Your default subject",
  "defaultBodyHtml": "<p>Your HTML content</p>",
  "provider": "gmail",  // optional, default: "gmail"
  "scheduledAt": "2025-01-31T12:00:00Z",  // optional, default: now()
  "recipients": [
    { "email": "recipient@example.com" },
    { "email": "other@example.com", "subject": "Override subject", "body_html": "Override body" }
  ]
}
```

**Response**:
```json
{
  "queued": 2,
  "message": "Queued 2 emails successfully"
}
```

**Example Client Usage**:
```typescript
const response = await fetch(`/api/campaigns/${campaignId}/enqueue`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    defaultSubject: "Quick question",
    defaultBodyHtml: "<p>Hey {{first_name}}, quick question…</p>",
    provider: "gmail",
    scheduledAt: new Date().toISOString(),
    recipients: leads.map(l => ({ email: l.email })),
  }),
});

const result = await response.json();
console.log(`Queued ${result.queued} emails`);
```

### 5. Enqueue UI Integration

Add to your campaign page:

```tsx
<Button
  onClick={async () => {
    const res = await fetch(`/api/campaigns/${campaign.id}/enqueue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        defaultSubject: campaign.subject,
        defaultBodyHtml: campaign.body_html,
        provider: campaign.provider || "gmail",
        recipients: selectedLeads.map(l => ({ email: l.email })),
      }),
    });
    const result = await res.json();
    
    if (result.error) {
      toast.error("Enqueue failed: " + result.error);
    } else {
      toast.success(`Queued ${result.queued} emails`);
    }
  }}
>
  Queue & Schedule
</Button>
```

## Workflow

1. **Enqueue**: Client calls `/api/campaigns/[id]/enqueue` with recipients
2. **Queue**: API inserts rows into `send_queue` with `status='pending'`
3. **Process**: Cron invokes `/send-queue` every minute
4. **Claim**: Function calls `claim_send_jobs()` to atomically lock jobs
5. **Send**: Stub sends email (implement real provider logic here)
6. **Log**: Write to `email_logs` on success
7. **Mark**: Call `mark_job_sent()` or `mark_job_failed()` with retry logic

## Retry Logic

- Jobs retry up to 4 times
- Failed jobs reschedule with 10-minute delay
- After 4 failed attempts, status becomes 'failed' permanently
- `attempts` counter tracks retry count
- `last_error` stores error message for debugging

## Rate Limiting

- Per-user rate limiting based on `RATE_PER_MIN` environment variable
- Default: 60 emails per minute per user
- Configured via `MS_BETWEEN = 60000 / RATE_PER_MIN`

## Next Steps: Implement Real Email Sending

Replace the stub in `sendEmail()` function in `supabase/functions/send-queue/index.ts`:

**For Gmail**:
```typescript
// Use Gmail API to send as authenticated user
// Store OAuth tokens in Supabase
// Implement token refresh logic
```

**For Outlook**:
```typescript
// Use Microsoft Graph API to send
// Similar OAuth token management
```

**For SMTP**:
```typescript
// Use nodemailer to send via SMTP relay
// Configure SMTP credentials securely
```

## Security Notes

- RLS policies ensure users can only enqueue for their own campaigns
- Service role required for job claiming and status updates
- Cron secret prevents unauthorized function invocations
- All database operations use parameterized queries

## Monitoring

- Check `send_queue` table for `status='failed'` jobs
- Monitor `attempts` to identify problematic recipients
- Track `email_logs` for delivery confirmations
- Use `locked_at` timestamps to detect stuck workers

## Testing

1. Insert test jobs into `send_queue`:
```sql
insert into send_queue (user_id, campaign_id, to_email, subject, body_html)
values (
  'your-user-id',
  'your-campaign-id',
  'test@example.com',
  'Test Subject',
  '<p>Test Body</p>'
);
```

2. Manually trigger the function:
```bash
curl https://your-project.supabase.co/functions/v1/send-queue?user_id=YOUR_USER_ID \
  -H "Authorization: Bearer $CRON_SECRET"
```

3. Verify jobs are processed and `email_logs` entries are created.

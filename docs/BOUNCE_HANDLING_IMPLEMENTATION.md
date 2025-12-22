# Bounce Handling + Domain Health Implementation

## Overview

This implementation adds comprehensive bounce detection, auto-suppression of bad addresses, and domain health tracking to SmartSend AI.

## Features

1. **Hard/Soft Bounce Classification** - Automatically classifies bounces based on status codes and diagnostic messages
2. **Auto-Suppression** - Hard bounces automatically added to suppression list
3. **Bounce Tracking** - Records all bounces in `email_bounces` table
4. **Domain Health Monitoring** - 7-day and 30-day rolling health metrics by recipient domain
5. **Email Log Updates** - Updates `email_logs` with bounce information
6. **Gmail Bounce Scanning** - Automatically scans Gmail inbox for DSN messages

## Database Schema

### email_logs Enhancements

```sql
-- Added columns to email_logs
ALTER TABLE email_logs
  ADD COLUMN IF NOT EXISTS bounced_at timestamptz,
  ADD COLUMN IF NOT EXISTS bounce_type text CHECK (bounce_type IN ('hard','soft')),
  ADD COLUMN IF NOT EXISTS bounce_reason text,
  ADD COLUMN IF NOT EXISTS delivery_status text CHECK (delivery_status IN ('sent','bounced','queued','failed'));
```

### email_bounces Table

```sql
CREATE TABLE IF NOT EXISTS public.email_bounces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_log_id uuid REFERENCES email_logs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_email text NOT NULL,
  type text NOT NULL CHECK (type IN ('hard','soft')),
  status_code text,     -- e.g. 5.1.1
  diagnostic text,      -- SMTP / DSN reason
  provider text,        -- gmail | outlook | smtp
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### Domain Health Views

Two materialized views provide rolling metrics:

- `domain_health_30d` - 30-day rolling metrics
- `domain_health_7d` - 7-day rolling metrics

Both views show:
- Total sent emails
- Total bounces and hard bounces
- Unsubscribes
- Bounce rate percentage
- Unsubscribe rate percentage

## API Endpoints

### POST /api/inbound/bounce

Inbound webhook endpoint for receiving bounce notifications from providers.

**Authentication**: Bearer token with `INBOUND_SECRET`

**Request Body**:
```json
{
  "provider": "gmail|outlook|smtp",
  "user_id": "uuid",
  "to_email": "recipient@example.com",
  "status_code": "5.1.1",
  "diagnostic": "User unknown",
  "type": "hard|soft",
  "email_log_id": "uuid (optional)"
}
```

**Response**:
```json
{
  "ok": true,
  "type": "hard"
}
```

### POST /api/internal/gmail/scan-bounces

Internal cron endpoint that scans Gmail inboxes for bounce messages.

**Authentication**: Bearer token with `CRON_SECRET`

**Functionality**:
- Finds all users with Gmail connected
- Queries inbox for messages from "Mail Delivery Subsystem"
- Parses DSN messages for email and status code
- Sends bounces to `/api/inbound/bounce` for processing

## Bounce Classification

The system automatically classifies bounces as hard or soft based on:

### Hard Bounce Indicators
- Status codes starting with `5.` (permanent failures)
- Diagnostic messages containing:
  - "user unknown"
  - "no such user"
  - "mailbox unavailable"
  - "invalid recipient"
  - "not found"

### Soft Bounce Indicators
- Status codes starting with `4.` (temporary failures)
- Diagnostic messages containing:
  - "mailbox full"
  - "quota"
  - "temporary"
  - "greylist"
  - "rate"
  - "spam filter"
  - "blocked temporarily"

## Auto-Suppression

When a hard bounce is detected:
1. The bounce is recorded in `email_bounces`
2. The corresponding `email_logs` entry is updated with bounce information
3. The email address is automatically added to the `suppressions` table
4. Future sends to this address will be blocked

## Domain Health Dashboard

Access at `/dashboard/health` to view:

### Summary Metrics
- Total sent emails (30 days)
- Bounce rate percentage
- Unsubscribe rate percentage

### By Domain Table
- Domain name
- Sent count (30 days)
- Total bounces
- Hard bounces
- Unsubscribes
- Bounce rate %
- Unsubscribe rate %

## Environment Variables

Add these to your `.env`:

```bash
INBOUND_SECRET=your-secret-for-inbound-webhooks
CRON_SECRET=your-secret-for-cron-jobs
```

## Cron Job Setup

Schedule a cron job to call the Gmail bounce scanner every 10-15 minutes:

```bash
*/15 * * * * curl -X POST https://your-domain.com/api/internal/gmail/scan-bounces \
  -H "Authorization: Bearer $CRON_SECRET"
```

## Usage Examples

### Manually Reporting a Bounce

```bash
curl -X POST https://your-domain.com/api/inbound/bounce \
  -H "Authorization: Bearer $INBOUND_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "smtp",
    "user_id": "user-uuid",
    "to_email": "bad@example.com",
    "status_code": "5.1.1",
    "diagnostic": "User unknown",
    "type": "hard"
  }'
```

### Querying Domain Health

```typescript
const { data } = await supabase
  .from('domain_health_30d')
  .select('*')
  .eq('user_id', userId);

// Returns domains with bounce rates and metrics
```

## Integration with Send Queue

Before sending emails, check if the recipient has been hard-bounced:

```typescript
async function recentlyHardBounced(userId: string, email: string): Promise<boolean> {
  const { data } = await admin
    .from('email_bounces')
    .select('type, created_at')
    .eq('user_id', userId)
    .eq('to_email', email)
    .eq('type', 'hard')
    .order('created_at', { ascending: false })
    .limit(1);
  
  return data && data.length > 0;
}

// In send queue loop
if (await recentlyHardBounced(job.user_id, job.to_email)) {
  await updateSendQueue(job.id, {
    status: 'failed',
    last_error: 'hard-bounce',
    attempts: 9
  });
  continue;
}
```

## Monitoring

Monitor bounce rates to maintain good sender reputation:

- **Excellent**: < 2% bounce rate
- **Good**: 2-5% bounce rate
- **Warning**: 5-10% bounce rate
- **Critical**: > 10% bounce rate

High bounce rates can lead to:
- IP/domain reputation degradation
- Deliverability issues
- Provider throttling
- Account suspension

## Troubleshooting

### Bounces Not Being Recorded

1. Verify `INBOUND_SECRET` environment variable is set
2. Check webhook logs for authentication errors
3. Verify bounce messages include required fields

### Domain Health View Empty

1. Ensure emails have been sent in the last 30 days
2. Check `email_logs` table has bounce data
3. Verify RLS policies allow viewing domain health data

### Gmail Bounce Scanner Not Working

1. Verify Gmail OAuth tokens are valid
2. Check `CRON_SECRET` is set correctly
3. Review cron job logs for errors
4. Ensure cron has proper permissions to call the endpoint

## Security Considerations

- All inbound webhooks require Bearer token authentication
- RLS policies ensure users can only view their own bounce data
- Cron endpoints use separate authentication secret
- Sensitive diagnostic information is logged securely

## Future Enhancements

- [ ] Real-time bounce webhooks from SMTP providers
- [ ] Bounce rate alerts and notifications
- [ ] Automatic sending domain warmup based on health
- [ ] Detailed bounce analytics and reporting
- [ ] Integration with email validation services 
# SmartSend Queue System

Complete email queue and throttled sender system with unsubscribe, tracking, and compliance.

## Schema Overview

The system uses 5 main tables:

1. **sending_accounts** - Gmail/Outlook OAuth accounts with rate limits
2. **smartsend_queue** - Email queue with status tracking
3. **smartsend_campaign_logs** - Event logging (sent, failed, open, unsubscribe)
4. **unsubscribe_tokens** - Token-based unsubscribes
5. **email_opens** - Open tracking with user agent/IP

## API Endpoints

### 1. Enqueue Campaign
```
POST /api/smartsend/[campaignId]/enqueue
```

**Request Body:**
```json
{
  "leads": [
    { "id": "uuid", "email": "user@example.com", "first_name": "John" }
  ],
  "template": {
    "subject": "Hello {{first_name}}!",
    "html": "<p>Hi {{first_name}}, ...</p>"
  },
  "providerAccountId": "uuid",
  "startAt": "2025-01-31T10:00:00Z" // optional
}
```

**What it does:**
- Validates provider account
- Generates unsubscribe tokens for each lead
- Inserts tracking pixels
- Adds unsubscribe links
- Queues emails for sending

### 2. Worker (Triggered via Cron)
```
POST /api/smartsend/worker
```

**What it does:**
- Runs every minute (via Vercel Cron or Supabase Scheduler)
- Loads all sending accounts
- Calculates rate limits (per minute and daily cap)
- Atomically locks and fetches queue items
- Sends emails via Gmail/Outlook API
- Retries failed sends with exponential backoff
- Logs all events to campaign_logs

### 3. Open Tracking Pixel
```
GET /api/pixel/[leadId].png?q=[queueId]
```

Returns a 1x1 transparent PNG and logs the open event.

### 4. Unsubscribe
```
GET /api/u/[token]
```

Marks lead as unsubscribed and shows confirmation page.

## Setup Instructions

### 1. Run Migration
```sql
-- Execute in Supabase SQL Editor:
-- supabase/migrations/20250131_smartsend_queue_system.sql
```

### 2. Configure Cron/Scheduler

**Vercel Cron:**
```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/smartsend/worker",
      "schedule": "*/1 * * * *"
    }
  ]
}
```

**Supabase Edge Function (Alternative):**
```typescript
// supabase/functions/smartsend-worker/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async () => {
  const response = await fetch("https://your-app.vercel.app/api/smartsend/worker", {
    method: "POST"
  })
  return new Response(JSON.stringify(await response.json()))
})
```

### 3. Wire up `CampaignStart` Component

```tsx
import { CampaignStart } from '@/components/campaign/CampaignStart';

export function CampaignPage() {
  const leads = [...]; // Your leads
  const template = {
    subject: "Hi {{first_name}}!",
    html: "<p>Hello {{first_name}}, welcome!</p>"
  };

  return (
    <CampaignStart
      campaignId="campaign-uuid"
      providerAccountId="account-uuid"
      leads={leads}
      template={template}
    />
  );
}
```

## Key Features

### Rate Limiting
- **Per-account rate limits**: Default 12 emails/minute
- **Daily caps**: Default 150 emails/day per account
- Automatically calculated and enforced by worker

### Retry Logic
- Exponential backoff: 2^attempts seconds (max 30s)
- Max 5 attempts before marking as failed
- Automatic rescheduling

### Compliance
- **Unsubscribe link** automatically added to every email
- **Tracking pixel** for opens
- **Lead suppression** via `unsubscribed` flag

### Tracking
- **Campaign logs** record all events
- **Email opens** track user agent and IP
- **Message IDs** stored for delivery verification

## Next Steps

### 1. Implement Actual Email Sending
Replace placeholder in `src/app/api/smartsend/worker/route.ts`:

```typescript
async function sendWithProvider(acct: any, msg: SendMessage) {
  if (acct.provider === 'gmail') {
    // Use Gmail API with acct.oauth_access_token
    const response = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${acct.oauth_access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          raw: btoa(
            `From: ${acct.email_address}\n` +
            `To: ${msg.to}\n` +
            `Subject: ${msg.subject}\n` +
            `Content-Type: text/html; charset=UTF-8\n\n` +
            msg.html
          )
        })
      }
    );
    const data = await response.json();
    return { id: data.id };
  }
  
  // Similar for Outlook...
}
```

### 2. Add Click Tracking
Create redirect endpoint:
```typescript
// app/api/r/route.ts
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('u');
  const queueId = req.nextUrl.searchParams.get('q');
  
  // Log click event
  await supabase.from('smartsend_campaign_logs').insert({
    event_type: 'click',
    details: { queue_id: queueId, url }
  });
  
  // Redirect
  return NextResponse.redirect(url);
}
```

### 3. Add Warmup Mode
Implement gradual ramp-up for new sending accounts to avoid spam filters.

### 4. Add Dashboard Views
- Campaign performance
- Send queue status
- Account health
- Bounce/complaint handling

## Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_APP_URL=https://your-app.com
```

## Database Functions

The migration includes:
- `lock_and_fetch_queue()` - Atomically locks queue items to prevent double-sending
- `trg_touch_updated_at()` - Updates `updated_at` timestamp

## Security

- Service role key used for worker operations
- RLS policies protect user data
- OAuth tokens should be encrypted in production (use Vault/KMS)
- Unsubscribe tokens are cryptographically random

## Notes

- The worker runs with optimistic locking (SKIP LOCKED) to handle concurrent execution
- Failed sends are automatically retried with exponential backoff
- Unsubscribed leads are marked in the database to prevent future sends
- All events are logged for analytics and debugging

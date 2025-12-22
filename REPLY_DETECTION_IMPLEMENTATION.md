# Reply Detection System Implementation

## Overview
This document describes the automatic reply detection system that identifies human replies to cold emails and prevents future sends to those leads.

## Architecture

The system consists of three main components:

1. **Database Layer** (`supabase/migrations/20251101_reply_detection_system.sql`)
   - Creates `lead_status` enum with 'replied' status
   - Adds helpful indexes for fast lookups
   - Implements `mark_lead_replied()` RPC function

2. **Edge Function** (`supabase/functions/reply-detection/index.ts`)
   - Validates webhook requests via `X-Reply-Secret` header
   - Uses OpenAI to classify whether emails are human replies
   - Calls `mark_lead_replied()` to update lead and cancel future sends

3. **Webhook Route** (`src/app/api/webhooks/reply/route.ts`)
   - Public endpoint for receiving inbound emails from various providers
   - Normalizes payload format and forwards to Supabase Edge Function

## Setup

### 1. Environment Variables

#### Supabase Functions (set in Supabase Dashboard → Edge Functions → Settings)
```
OPENAI_API_KEY=sk-...
REPLY_WEBHOOK_SECRET=supersecretvalue
```

#### Next.js (.env.local)
```
SUPABASE_REPLY_FUNCTION_URL=https://<project>.functions.supabase.co/reply-detection
REPLY_WEBHOOK_SECRET=supersecretvalue
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
```

### 2. Deploy Supabase Migration
```bash
supabase db push
```

### 3. Deploy Edge Function
```bash
supabase functions deploy reply-detection
```

### 4. Configure Webhook URLs
Point your email provider's webhook to:
```
https://<your-domain>/api/webhooks/reply
```

## Database Schema

### `leads` table
- `status`: enum including 'replied' status
- Index on `(workspace_id, lower(email))` for fast lead lookups

### `send_queue` table
- Index on `(workspace_id, lead_id, status)` for efficient cancellation queries

### `mark_lead_replied()` RPC
```sql
mark_lead_replied(
  _workspace_id uuid,
  _lead_id uuid,
  _campaign_id uuid DEFAULT NULL,
  _source text DEFAULT 'unknown',
  _snippet text DEFAULT NULL
)
```

This function:
- Updates lead status to 'replied'
- Cancels all pending queued/sending items for the lead
- Logs the event in `campaign_logs`

## Usage

### Webhook Payload Format
The webhook accepts any payload and normalizes it to the expected format:

```typescript
{
  email: string;           // sender's email (required)
  subject?: string;
  body?: string;
  provider?: string;       // 'gmail','outlook','sendgrid', etc.
  thread_id?: string;
  workspace_id?: string;
  campaign_id?: string;
  lead_id?: string;
}
```

### Example Webhook Call
```bash
curl -X POST https://your-domain.com/api/webhooks/reply \
  -H "Content-Type: application/json" \
  -d '{
    "from_email": "lead@example.com",
    "subject": "Re: Your proposal",
    "body": "Thanks for reaching out! I am interested in learning more.",
    "provider": "gmail"
  }'
```

### Response Codes

- `200 OK`: Request processed successfully
  - `classified: "human_reply"` - Lead marked as replied
  - `classified: "non-human/ignore"` - Auto-reply detected, ignored
  - `info: "lead not found; skipping"` - No matching lead found
- `400 Bad Request`: Missing required fields
- `401 Unauthorized`: Invalid or missing `X-Reply-Secret` header
- `500 Internal Server Error`: Processing error

## AI Classification

The system uses OpenAI's `gpt-4o-mini` to classify emails as human replies vs automated messages:

**Human Replies (classifies as `is_human_reply: true`):**
- Confirmations ("yes", "interested", "let's talk")
- Questions or objections
- Scheduling requests
- Pricing inquiries

**Non-Human Replies (classifies as `is_human_reply: false`):**
- Out-of-office messages
- Bounce notifications
- Delivery status updates
- Auto-responders
- Promotional emails
- Legal disclaimers

## Idempotency

The system is idempotent:
- Multiple replies from the same lead won't cause errors
- If a lead is already marked 'replied', subsequent replies are safely ignored
- Already-canceled queue items remain canceled

## UI Integration

The `StatusBadge` component already supports the "replied" status with a green badge display (✅ Replied). Leads with this status will appear in:
- Dashboard leads table
- Campaign leads table
- Send queue view (excluded from future sends)

## Testing

### Test Human Reply
```bash
curl -X POST http://localhost:3000/api/webhooks/reply \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "subject": "Interested",
    "body": "This sounds great! Let us schedule a call."
  }'
```

Expected: Lead status → 'replied', queued sends → 'canceled'

### Test Auto-Reply
```bash
curl -X POST http://localhost:3000/api/webhooks/reply \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "subject": "Out of Office",
    "body": "I am currently out of the office until..."
  }'
```

Expected: Response `{ok: true, classified: "non-human/ignore"}`, no DB changes

## Monitoring

Monitor the system via:
- `campaign_logs` table for all reply detection events
- Lead status changes (realtime updates in UI)
- Send queue cancellations (status = 'canceled')

## Future Enhancements

- Add webhook signatures for additional security
- Support for thread-based detection when thread_id is available
- Configurable AI classification rules
- Reply content extraction and summary storage
- Notification system for replied leads


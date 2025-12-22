# Inbox Reply Webhook → Classify → Auto-Calendar → Store Analytics

## Overview

This slice provides a single webhook endpoint to receive email replies from email providers (Resend, Mailgun, SendGrid, etc.), persist them to Supabase, classify intent using AI, and automatically trigger calendar invites for interested prospects.

**Key Benefits:**
- Single unified endpoint for all inbound email replies
- Automatic intent classification (MEETING_INTENT, NO_INTENT, etc.)
- Auto-calendar flow triggers when intent = Interested
- Full analytics persistence for MB/100 tracking

## What Was Implemented

### 1. API Route: `/src/app/api/inbox/replies/route.ts`

A serverless webhook endpoint that:
- Accepts inbound email payloads from email providers
- Verifies HMAC signatures for security
- Normalizes payload from different providers
- Persists messages to Supabase `messages` table
- Calls `/api/reply-intent` classifier
- Updates message with classified intent
- Triggers auto-calendar flow for MEETING_INTENT

### 2. Database Migration: `supabase/migrations/20251016000000_create_messages_table.sql`

Creates the `messages` table with:
- `direction` enum: 'inbound' or 'outbound'
- Email metadata: from, to, subject, body_text, body_html
- Intent tracking: reply_intent, intent_updated_at
- Provider metadata: provider, provider_message_id, thread_id
- Raw payload storage for audit/debug
- Proper indexes for analytics queries
- RLS policies for user data isolation

### 3. Environment Variables

Added to `env.template`:
```bash
PROVIDER_WEBHOOK_SECRET=your_provider_webhook_secret_here
```

Required existing variables:
- `NEXT_PUBLIC_APP_URL` - App base URL for internal API calls
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role for webhook inserts
- `OPENAI_API_KEY` - For reply intent classification

## Setup Instructions

### Step 1: Environment Configuration

Add to your `.env.local`:

```bash
# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Supabase (should already exist)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Webhook Security
PROVIDER_WEBHOOK_SECRET=replace_me_with_strong_random_string

# OpenAI (should already exist from reply-intent setup)
OPENAI_API_KEY=your_openai_api_key
```

Generate a secure webhook secret:
```bash
openssl rand -hex 32
```

### Step 2: Apply Database Migration

In Supabase SQL Editor, run:
```bash
supabase/migrations/20251016000000_create_messages_table.sql
```

Or using Supabase CLI:
```bash
supabase db push
```

### Step 3: Configure Email Provider

Point your email provider's inbound webhook to:
```
POST https://your-domain.com/api/inbox/replies
```

#### Provider-Specific Mapping

**Resend:**
```javascript
{
  "from": "prospect@example.com",
  "to": "you@smartsend.ai",
  "subject": "Re: Your email",
  "text": "I'm interested!",
  "html": "<p>I'm interested!</p>",
  "provider": "resend",
  "sent_at_iso": "2025-10-16T19:05:00.000Z",
  "message_id": "msg_abc123",
  "signature": "your_hmac_signature"
}
```

**Mailgun:**
Map these fields:
- `sender` → `from`
- `recipient` → `to`
- `Subject` → `subject`
- `body-plain` → `text`
- `body-html` → `html`
- Add `provider: "mailgun"`
- Add HMAC signature to `signature` field

**SendGrid:**
Map these fields:
- `from` → `from`
- `to` → `to`
- `subject` → `subject`
- `text` → `text`
- `html` → `html`
- Add `provider: "sendgrid"`
- Add HMAC signature to `signature` field

#### HMAC Signature Setup

Configure your provider to sign webhook payloads with your `PROVIDER_WEBHOOK_SECRET`:

1. In your email provider dashboard, find webhook settings
2. Enable webhook signing/HMAC
3. Set secret key to match `PROVIDER_WEBHOOK_SECRET`
4. Configure to send signature in payload as `signature` field

## Testing

### Local Development Test

```bash
# Start dev server
npm run dev

# Test webhook endpoint
curl -X POST http://localhost:3000/api/inbox/replies \
  -H "Content-Type: application/json" \
  -d '{
    "from": "prospect@example.com",
    "to": "founder@smartsend.ai",
    "subject": "Re: Your cold email",
    "text": "Hey, I'\''m interested. Can we talk this week?",
    "provider": "resend",
    "sent_at_iso": "2025-10-16T19:05:00.000Z",
    "signature": "",
    "raw": {"debug": "sample"}
  }'
```

**Expected Response:**
```json
{
  "id": "uuid-of-message",
  "intent": "MEETING_INTENT",
  "meeting_created": true,
  "calendly_url": "https://calendly.com/your-handle/intro-call-30"
}
```

### Verify Database

Check Supabase `messages` table:
```sql
SELECT 
  id,
  direction,
  from_email,
  to_email,
  subject,
  reply_intent,
  intent_updated_at,
  created_at
FROM messages
ORDER BY created_at DESC
LIMIT 10;
```

### Verify Meeting Creation

Check Supabase `meetings` table:
```sql
SELECT 
  id,
  message_id,
  sender_email,
  calendly_url,
  detected_at
FROM meetings
ORDER BY detected_at DESC
LIMIT 10;
```

## Acceptance Criteria

✅ **Webhook receives and processes inbound emails**
- POST to `/api/inbox/replies` returns 200 OK
- Response includes `{ id, intent, meeting_created, calendly_url }`

✅ **Messages stored in Supabase**
- New row in `messages` table with `direction = 'inbound'`
- `reply_intent` field populated (MEETING_INTENT or NO_INTENT)
- Timestamps captured: `reply_received_at`, `intent_updated_at`

✅ **Intent classification works**
- Positive replies → `intent = "MEETING_INTENT"`
- Negative/neutral replies → `intent = "NO_INTENT"`

✅ **Auto-calendar triggered for interested prospects**
- When `intent = "MEETING_INTENT"`, meeting row created
- Calendly URL and ICS blob stored in `meetings` table
- Email sent with calendar invite (handled by existing `/api/reply-intent` route)

✅ **Security validation**
- Invalid signatures rejected with 401 Unauthorized
- Valid signatures accepted and processed

## Architecture Flow

```
Email Provider (Resend/Mailgun/SendGrid)
  ↓
POST /api/inbox/replies
  ↓
1. Verify HMAC signature
  ↓
2. Insert to messages table (user_id = NULL)
  ↓
3. Call /api/reply-intent classifier
  ↓
4. Update message with reply_intent
  ↓
5. If MEETING_INTENT → auto-calendar flow triggers
  ↓
Response: { id, intent, meeting_created, calendly_url }
```

## What's Next

### Small Follow-up Slices

1. **User Resolution** (`/api/inbox/resolve-user/route.ts`)
   - Map `to_email` → `user_id` (workspace owner)
   - Backfill existing messages with correct user_id
   - Enable per-user analytics and RLS filtering

2. **Analytics UI** (Dashboard page)
   - Total Replies count
   - Interested count (MEETING_INTENT)
   - Meetings Booked count
   - MB/100 metric calculation
   - Time-series charts

3. **Intent Categories Expansion**
   - Add more intent types: "OOO", "FOLLOW_UP_LATER", "NOT_INTERESTED"
   - Conditional workflows based on intent
   - Auto-responders for each intent type

## Troubleshooting

### Webhook returns 401 Unauthorized
- Check `PROVIDER_WEBHOOK_SECRET` matches in both app and email provider
- Verify signature is being sent correctly
- For dev/testing, leave `signature` empty or remove `PROVIDER_WEBHOOK_SECRET`

### Classification fails (202 with warning)
- Check `/api/reply-intent` route is accessible
- Verify `OPENAI_API_KEY` is set correctly
- Check logs for classifier errors
- Message is still stored, can be re-classified later

### Messages not appearing in dashboard
- Currently `user_id = NULL` for webhook messages
- Implement user resolution to map to_email → user_id
- Or query messages by `to_email` instead of `user_id`

### Missing meeting creation
- Verify reply text shows clear interest (e.g., "Yes, I'm interested")
- Check `meetings` table for entries with matching `message_id`
- Review `/api/reply-intent` route logs

## Performance Notes

- Webhook responds within 2-5 seconds (includes external classifier call)
- Asynchronous processing recommended for high-volume (future enhancement)
- Consider rate limiting for production (e.g., 100 req/min per IP)

## Security Considerations

- Always use HMAC signature verification in production
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to client-side
- RLS policies prevent unauthorized data access
- Raw webhook payloads stored for audit trail
- Consider IP whitelisting for webhook endpoint

## Cost Implications

- OpenAI API calls: ~$0.001 per classification (GPT-4o-mini)
- Supabase: 2 writes per inbound email (messages + update)
- Estimated cost: ~$0.01 per 10 inbound replies

---

**Implementation Date:** October 16, 2025  
**Status:** ✅ Complete and tested  
**Next Slice:** User Resolution or Analytics Dashboard

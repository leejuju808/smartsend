# Provider Webhooks Implementation

**Date:** December 2024  
**Status:** ✅ Complete

## Overview

This slice implements production-grade webhook endpoints for receiving inbound email replies from SendGrid, Postmark, and Mailgun. All providers are normalized to a common format and forwarded to the Supabase Edge Function `reply-intent-detector` for meeting booking detection.

## What Was Implemented

### 1. Database Schema
- **File:** `supabase/migrations/20241216000000_create_inbound_messages.sql`
- Created `inbound_messages` table with:
  - Provider tracking (sendgrid, postmark, mailgun)
  - User ownership via `owner_user_id`
  - Message metadata (sender, subject, body, message_id)
  - Raw payload storage (JSONB)
  - Processing status tracking (received → forwarded → error)
  - Detector status (booked, no_meeting, error)
- Enabled RLS with user-scoped SELECT policy

### 2. Shared Utilities

#### Normalization Layer
- **File:** `src/lib/replies/normalize.ts`
- Converts provider-specific payloads to unified `NormalizedReply` type
- Handles both JSON and multipart/form-data formats
- Three normalizer functions:
  - `normalizeSendGrid()` - Parses SendGrid Inbound Parse webhooks
  - `normalizePostmark()` - Handles Postmark inbound webhooks
  - `normalizeMailgun()` - Processes Mailgun route webhooks
- Extracts: sender email, subject, body text, message ID

#### Detector Forwarding
- **File:** `src/lib/replies/forward.ts`
- `forwardToDetector()` - Sends normalized replies to Edge Function
- Uses service role key for authenticated forwarding
- Returns detector result (status: booked | no_meeting)

#### Webhook Authentication
- **File:** `src/lib/webhook/auth.ts`
- `verifySecret()` - Validates `x-ss-signature` header
- `requireUserIdFromQuery()` - Extracts user mapping from `?user=<auth_user_id>`

### 3. Webhook Endpoints

All endpoints follow the same pattern:
1. Verify webhook signature
2. Extract user ID from query params
3. Normalize provider payload
4. Insert to `inbound_messages` (status: received)
5. Forward to detector Edge Function
6. Update row with detector result (status: forwarded)

#### SendGrid
- **File:** `src/app/api/webhooks/replies/sendgrid/route.ts`
- **URL:** `POST /api/webhooks/replies/sendgrid?user=<USER_ID>`
- **Auth:** Header `x-ss-signature` must match `WEBHOOK_SECRET_SENDGRID`
- Handles multipart/form-data and JSON formats

#### Postmark
- **File:** `src/app/api/webhooks/replies/postmark/route.ts`
- **URL:** `POST /api/webhooks/replies/postmark?user=<USER_ID>`
- **Auth:** Header `x-ss-signature` must match `WEBHOOK_SECRET_POSTMARK`
- Expects JSON payload with `FromFull`, `Subject`, `TextBody`

#### Mailgun
- **File:** `src/app/api/webhooks/replies/mailgun/route.ts`
- **URL:** `POST /api/webhooks/replies/mailgun?user=<USER_ID>`
- **Auth:** Header `x-ss-signature` must match `WEBHOOK_SECRET_MAILGUN`
- Supports both form-data and JSON

### 4. Inbound Messages UI
- **File:** `src/app/(dashboard)/inbound/page.tsx`
- **Route:** `/inbound`
- Displays last 50 inbound messages
- Shows: timestamp, provider, sender, subject, processing status, detector status
- Helps debug webhook configuration and detector quality

## Environment Variables Required

Add to `.env.local`:

```bash
# Supabase (existing)
NEXT_PUBLIC_SUPABASE_URL=<YOUR_URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<YOUR_KEY>
SUPABASE_SERVICE_ROLE_KEY=<YOUR_SERVICE_KEY>

# Webhook Secrets (generate strong random strings)
WEBHOOK_SECRET_SENDGRID=<STRONG_RANDOM>
WEBHOOK_SECRET_POSTMARK=<STRONG_RANDOM>
WEBHOOK_SECRET_MAILGUN=<STRONG_RANDOM>

# Edge Function URL
SUPABASE_EDGE_FN_DETECTOR_URL=${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/reply-intent-detector
```

## Provider Configuration

### SendGrid Inbound Parse
1. Go to Settings → Inbound Parse
2. Add hostname & URL: `https://your-domain.com/api/webhooks/replies/sendgrid?user=<AUTH_USER_ID>`
3. Add custom header: `x-ss-signature: <WEBHOOK_SECRET_SENDGRID>`

### Postmark Inbound Webhook
1. Go to Settings → Webhooks
2. Add inbound webhook URL: `https://your-domain.com/api/webhooks/replies/postmark?user=<AUTH_USER_ID>`
3. Add custom header: `x-ss-signature: <WEBHOOK_SECRET_POSTMARK>`

### Mailgun Routes
1. Go to Sending → Routes
2. Create route with action: Forward to `https://your-domain.com/api/webhooks/replies/mailgun?user=<AUTH_USER_ID>`
3. Add custom header: `x-ss-signature: <WEBHOOK_SECRET_MAILGUN>`

## Testing

### Local Testing with cURL

**SendGrid (multipart):**
```bash
curl -X POST "http://localhost:3000/api/webhooks/replies/sendgrid?user=<USER_ID>" \
  -H "x-ss-signature: ${WEBHOOK_SECRET_SENDGRID}" \
  -F "from=Lead <lead@example.com>" \
  -F "subject=Let's book this week" \
  -F "text=Yes Thursday afternoon works. Send me your link." \
  -F "headers=Message-ID: <abc123@example.com>"
```

**Postmark (JSON):**
```bash
curl -X POST "http://localhost:3000/api/webhooks/replies/postmark?user=<USER_ID>" \
  -H "Content-Type: application/json" \
  -H "x-ss-signature: ${WEBHOOK_SECRET_POSTMARK}" \
  -d '{
    "FromFull":{"Email":"lead@example.com"},
    "Subject":"Book a call?",
    "TextBody":"Yes, tomorrow morning is fine.",
    "MessageID":"pmk-123"
  }'
```

**Mailgun (form-data):**
```bash
curl -X POST "http://localhost:3000/api/webhooks/replies/mailgun?user=<USER_ID>" \
  -H "x-ss-signature: ${WEBHOOK_SECRET_MAILGUN}" \
  -F "sender=lead@example.com" \
  -F "subject=Schedule" \
  -F "stripped-text=Let's do Friday." \
  -F "Message-Id=<mg-789@example.com>"
```

### Acceptance Criteria
- ✅ Each webhook returns `{ ok: true, detector: { status: "booked" | "no_meeting" } }`
- ✅ Visit `/inbound` to see new rows with `processed_status=forwarded`
- ✅ Detector status populated correctly
- ✅ RLS enforced - users can only see their own messages
- ✅ Visit `/meetings` to see booked meetings appear for positive replies

## Architecture Benefits

1. **Provider-Agnostic:** Single normalized interface for all email providers
2. **Extensible:** Add new providers by creating a normalizer + route
3. **Observable:** Every inbound message logged with full lifecycle tracking
4. **Secure:** Signature verification + RLS + user mapping
5. **Resilient:** Errors captured in `processed_status` for debugging

## Files Created

```
src/
├── app/
│   ├── (dashboard)/
│   │   └── inbound/
│   │       └── page.tsx                    # Inbound messages UI
│   └── api/
│       └── webhooks/
│           └── replies/
│               ├── sendgrid/
│               │   └── route.ts            # SendGrid webhook
│               ├── postmark/
│               │   └── route.ts            # Postmark webhook
│               └── mailgun/
│                   └── route.ts            # Mailgun webhook
└── lib/
    ├── replies/
    │   ├── normalize.ts                    # Provider normalization
    │   └── forward.ts                      # Detector forwarding
    └── webhook/
        └── auth.ts                         # Webhook auth helpers

supabase/
└── migrations/
    └── 20241216000000_create_inbound_messages.sql
```

## Integration with Existing System

This slice integrates with:
- **Supabase Edge Function:** `reply-intent-detector` (already deployed)
- **Meetings Table:** Detector creates records when `status=booked`
- **Auth System:** RLS uses `auth.uid()` for user isolation

## Next Steps

The spec suggests these follow-on slices:

1. **Lite Analytics** - `/analytics` page showing MB/100, reply→meeting %, sender health
2. **CSV Import** - Dedupe + suppression list for safer volume scaling  
3. **Bounce Guard** - Hooks from sending provider to pause/ramp intelligently

## Why This Matters (MB/100)

- Eliminates manual simulation - production replies flow automatically
- Normalized path enables multi-provider strategy without vendor lock-in
- Logging + RLS enables quality inspection and prompt iteration
- Direct correlation: replies → meetings → revenue metrics

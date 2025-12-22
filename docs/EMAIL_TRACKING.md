# Email Tracking Implementation

This document describes the email tracking system that tracks email opens and clicks using a tracking pixel and signed redirect URLs.

## Overview

The tracking system consists of:

1. **Tracking Pixel** - A 1x1 transparent GIF that loads when an email is opened
2. **Link Rewriting** - Rewrites all links to go through a tracking redirect
3. **Event Logging** - Stores open and click events in the database

## Database Schema

### email_logs
Tracks each sent email and its metadata.

- `id` - UUID primary key
- `user_id` - User who sent the email
- `to_email` - Recipient email address
- `subject` - Email subject
- `campaign_id` - Optional campaign reference
- `opened` - Boolean flag if email was opened
- `clicked` - Boolean flag if any link was clicked
- `status` - Send status (queued, sent, failed, skipped_suppressed)
- `sent_at` - Timestamp when email was sent
- `created_at` - Timestamp when log was created

### email_events
Logs individual tracking events (opens and clicks).

- `id` - Serial primary key
- `email_log_id` - Reference to email_logs
- `event_type` - Either 'open' or 'click'
- `url` - URL for click events
- `ip` - IP address of the event
- `ua` - User agent string
- `created_at` - Timestamp of the event

## Components

### Token Signing (`src/lib/tracking/token.ts`)

Signs and verifies tracking tokens using HMAC-SHA256.

**Types:**
- `OpenPayload` - Token payload for open tracking
- `ClickPayload` - Token payload for click tracking

**Functions:**
- `sign(payload)` - Signs a payload and returns a token
- `verify(token)` - Verifies and decodes a token

### HTML Processing (`src/lib/tracking/withTracking.ts`)

Rewrites HTML to add tracking.

**Function:**
- `rewriteLinksAndInjectPixel(html, emailLogId, appUrl)` - Rewrites all links and injects tracking pixel

### API Endpoints

#### `/api/o.gif` - Open Tracking Pixel

Returns a 1x1 transparent GIF and logs open events.

**Query Parameters:**
- `t` - Signed token containing email_log_id

**Behavior:**
1. Verifies the tracking token
2. Extracts IP and User-Agent
3. Logs event to email_events
4. Updates email_logs.opened
5. Returns 1x1 transparent GIF

#### `/api/t` - Click Tracking Redirect

Redirects to the destination URL and logs click events.

**Query Parameters:**
- `t` - Signed token containing email_log_id and destination URL

**Behavior:**
1. Verifies the tracking token
2. Extracts destination URL
3. Logs click event to email_events
4. Updates email_logs.clicked
5. Redirects to destination URL

### Email Sending (`src/lib/tracking/sendEmail.ts`)

Wrapper function for sending emails with tracking.

**Usage:**
```typescript
import { sendEmail } from '@/lib/tracking/sendEmail';

const result = await sendEmail({
  to: 'recipient@example.com',
  subject: 'Test Email',
  body: '<html>...</html>',
  user_id: 'user-uuid',
  campaign_id: 'campaign-uuid' // optional
});
```

## Environment Variables

Required environment variables:

```bash
TRACKING_SECRET=your-super-long-random-string-here
NEXT_PUBLIC_APP_URL=https://smartsend.ai
```

## Security Considerations

1. **Token Expiry**: Tokens expire after 7 days
2. **HMAC Verification**: Tokens are cryptographically signed
3. **RLS Policies**: Database access is protected by Row Level Security
4. **No Authentication Required**: Tracking endpoints don't require auth to avoid blocking tracking

## Implementation Notes

- The tracking pixel is injected before the closing `</body>` tag if present, otherwise appended
- Links are rewritten using a naive regex; for production, consider using an HTML parser
- The system fails gracefully - tracking failures don't block email delivery
- Multiple opens/clicks are all logged (deduplication can be done in analytics)

## Testing

To test tracking:

1. Send a test email using the `sendEmail` function
2. Open the email (tracking pixel fires)
3. Click a link (redirect handler fires)
4. Query `email_events` table to verify events were logged

## Migration

Run the migration to create the necessary tables:

```bash
supabase migration up 20251025_tracking
```

Or apply the SQL file directly in Supabase dashboard. 
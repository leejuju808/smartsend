# Bounce & Complaint Webhook System - Implementation Guide

## Overview

This implementation provides a **provider-agnostic bounce and complaint webhook** that accepts events from SendGrid, Mailgun, and Amazon SES. It includes:

- ✅ Signature verification for all three providers
- ✅ Bounce detection and tracking
- ✅ Spam complaint detection and tracking
- ✅ Automatic suppression list management
- ✅ Sender-level and campaign-level alerts
- ✅ Webhook event logging for debugging
- ✅ UI for managing suppressions

## Files Created/Modified

### Database Migration
- `supabase/migrations/20251018_bounce_webhooks.sql`
  - Adds bounce/complaint columns to `messages` table
  - Creates `webhook_events` table for debugging
  - Creates `senders` and `sender_alerts` tables
  - Creates `campaign_alerts` table
  - Creates `v_sender_health` view with bounce/complaint metrics

### API Routes
- `src/app/api/webhooks/bounce/route.ts` - Main webhook handler
- `src/app/api/suppressions/list/route.ts` - List suppressions
- `src/app/api/suppressions/add/route.ts` - Add manual suppression

### UI
- `src/app/suppressions/page.tsx` - Suppressions management page

### Testing
- `test-bounce-webhooks.sh` - Automated test script

## Setup Instructions

### 1. Environment Variables

Add these to your `.env.local` file:

```bash
# Required (already should exist)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Optional: Signature Verification
# Leave empty to bypass verification (for testing)

# SendGrid (use your SendGrid public key from webhook settings)
SENDGRID_PUBLIC_KEY=

# Mailgun (use your Mailgun signing key from webhook settings)
MAILGUN_SIGNING_KEY=

# Amazon SES/SNS (set to "true" to enable basic SNS verification)
AWS_SNS_VERIFY=false
```

### 2. Apply Database Migration

Apply the migration to your Supabase database:

```bash
# If using Supabase CLI locally
supabase db push

# Or manually run the SQL in Supabase Studio:
# Copy contents of supabase/migrations/20251018_bounce_webhooks.sql
# and run in SQL Editor
```

### 3. Start Development Server

```bash
npm run dev
```

## Testing

### Run Automated Tests

```bash
./test-bounce-webhooks.sh
```

Or test against a different URL:

```bash
./test-bounce-webhooks.sh https://your-domain.com
```

### Manual Testing

#### Test 1: SendGrid Bounce

```bash
curl -X POST http://localhost:3000/api/webhooks/bounce \
  -H "Content-Type: application/json" \
  -H "User-Agent: SendGrid/1.0" \
  -d '[
    {
      "email":"bounced@example.com",
      "event":"bounce",
      "reason":"550 5.1.1 user unknown",
      "sg_message_id":"abc123.transport"
    }
  ]'
```

**Expected Response:**
```json
{
  "success": true,
  "processed": 1
}
```

#### Test 2: Mailgun Bounce

```bash
curl -X POST http://localhost:3000/api/webhooks/bounce \
  -H "Content-Type: application/json" \
  -H "User-Agent: Mailgun/1.0" \
  -d '{
    "signature": {"timestamp":"1234567890", "token":"test", "signature":"test"},
    "event-data": {
      "event":"failed",
      "reason":"bounce",
      "recipient":"hardbounce@example.com",
      "delivery-status":{"message":"hard fail"},
      "message":{"headers":{"message-id":"<mg-123@domain>"}}
    }
  }'
```

#### Test 3: SES Bounce

```bash
curl -X POST http://localhost:3000/api/webhooks/bounce \
  -H "Content-Type: application/json" \
  -H "X-Amz-Sns-Message-Type: Notification" \
  -d '{
    "notificationType":"Bounce",
    "mail":{"messageId":"ses-123"},
    "bounce":{
      "bounceType":"Permanent",
      "bounceSubType":"General",
      "bouncedRecipients":[{"emailAddress":"sesbounce@example.com"}]
    }
  }'
```

#### Test 4: SendGrid Spam Complaint

```bash
curl -X POST http://localhost:3000/api/webhooks/bounce \
  -H "Content-Type: application/json" \
  -H "User-Agent: SendGrid/1.0" \
  -d '[
    {
      "email":"complainer@example.com",
      "event":"spamreport",
      "sg_message_id":"spam456.transport"
    }
  ]'
```

#### Test 5: SES Complaint

```bash
curl -X POST http://localhost:3000/api/webhooks/bounce \
  -H "Content-Type: application/json" \
  -H "X-Amz-Sns-Message-Type: Notification" \
  -d '{
    "notificationType":"Complaint",
    "mail":{"messageId":"ses-complaint-789"},
    "complaint":{
      "complainedRecipients":[{"emailAddress":"sesComplaint@example.com"}]
    }
  }'
```

### UI Testing

1. **Visit Suppressions Page**: http://localhost:3000/suppressions
2. **Add Manual Suppression**: Enter an email and optional reason, click "Add"
3. **Verify List**: Confirm suppressed emails appear in the table

### Database Verification

Check the following tables after testing:

```sql
-- Check webhook events log
SELECT * FROM webhook_events ORDER BY received_at DESC LIMIT 10;

-- Check suppressions
SELECT * FROM suppressions ORDER BY created_at DESC LIMIT 10;

-- Check messages marked as bounced
SELECT id, email_to, bounce, bounced_at, complaint, complained_at 
FROM messages 
WHERE bounce = true OR complaint = true;

-- Check sender alerts
SELECT sa.*, s.email as sender_email
FROM sender_alerts sa
JOIN senders s ON s.id = sa.sender_id
ORDER BY sa.created_at DESC LIMIT 10;

-- Check campaign alerts
SELECT * FROM campaign_alerts ORDER BY created_at DESC LIMIT 10;

-- Check sender health metrics
SELECT * FROM v_sender_health;
```

## Provider Configuration

### SendGrid Setup

1. Go to SendGrid → Settings → Mail Settings → Event Webhook
2. Set webhook URL: `https://your-domain.com/api/webhooks/bounce`
3. Enable events: Bounces, Dropped, Spam Reports, Unsubscribes
4. Enable "Signature Verification" and save your public key to `SENDGRID_PUBLIC_KEY`

### Mailgun Setup

1. Go to Mailgun → Sending → Webhooks
2. Add webhook URL: `https://your-domain.com/api/webhooks/bounce`
3. Enable events: Permanent Failure, Temporary Failure, Complained
4. Copy your "HTTP webhook signing key" to `MAILGUN_SIGNING_KEY`

### Amazon SES Setup

1. Create an SNS topic for bounce/complaint notifications
2. Subscribe your webhook URL to the SNS topic: `https://your-domain.com/api/webhooks/bounce`
3. In SES → Configuration Sets → Event Destinations:
   - Add SNS destination for Bounces
   - Add SNS destination for Complaints
4. Set `AWS_SNS_VERIFY=true` if you want basic verification

## How It Works

### Flow Diagram

```
Webhook Event → Signature Verification → Provider Detection
                                              ↓
                                    Event Mapping (Unified)
                                              ↓
                                    Log to webhook_events
                                              ↓
                    ┌─────────────────────────┴─────────────────────────┐
                    ↓                                                     ↓
          Mark message (bounce/complaint)                    Add to suppressions
                    ↓                                                     
          ┌─────────┴─────────┐
          ↓                   ↓
    Sender Alert       Campaign Alert
```

### Data Flow

1. **Receive webhook** from provider (SendGrid/Mailgun/SES)
2. **Verify signature** (if configured)
3. **Detect provider** from headers/body
4. **Map to unified format** (`UniEvent`)
5. **Log raw payload** to `webhook_events` table
6. **For each event**:
   - Find message by `transport_message_id` or fallback to `email_to`
   - Mark message as `bounce=true` or `complaint=true`
   - Add email to `suppressions` table
   - Create `sender_alerts` if sender exists
   - Create `campaign_alerts` if campaign exists

### Suppression Logic

The system automatically suppresses emails that:
- **Bounce** (hard bounces, user unknown, mailbox full, etc.)
- **Complain** (spam reports, abuse complaints)

The `upsertSuppression()` function uses `onConflict: "email"` to ensure no duplicates.

### Alert System

**Sender-level alerts** (`sender_alerts` table):
- Created when a bounce/complaint occurs for a known sender
- Level: `warning` for bounces, `error` for complaints
- Code: `BOUNCE_EVENT` or `COMPLAINT_EVENT`

**Campaign-level alerts** (`campaign_alerts` table):
- Created when a bounce/complaint occurs for a message with `campaign_id`
- Helps track campaign-specific deliverability issues

## Production Deployment

### Security Considerations

1. **Enable Signature Verification**: Always set provider keys in production
2. **Use HTTPS**: Webhook URLs must use HTTPS
3. **Rate Limiting**: Consider adding rate limits to prevent abuse
4. **IP Whitelisting**: Optionally whitelist provider IPs

### Monitoring

Monitor these metrics:
- `webhook_events` table size (clean up old entries periodically)
- Bounce rates via `v_sender_health` view
- Complaint rates via `v_sender_health` view
- Alert counts by sender/campaign

### Cleanup Job (Optional)

Consider a cron job to clean old webhook events:

```sql
DELETE FROM webhook_events 
WHERE received_at < NOW() - INTERVAL '30 days';
```

## Troubleshooting

### Webhook not receiving events

1. Check provider webhook settings
2. Verify URL is publicly accessible (use ngrok for local testing)
3. Check webhook logs: `SELECT * FROM webhook_events ORDER BY received_at DESC`

### Signature verification failing

1. Ensure environment variables are set correctly
2. For SendGrid: Verify public key format (base64)
3. For Mailgun: Verify signing key matches
4. Temporarily disable verification to test (set env vars to empty)

### Messages not being marked

1. Check if `transport_message_id` matches your outbound messages
2. Verify `email_to` is lowercase in both webhook and messages table
3. Check fallback logic in `resolveAndMark()` function

### Alerts not appearing

1. Verify `senders` table has entries for your sender emails
2. Verify `campaign_id` is set on messages if expecting campaign alerts
3. Check `sender_alerts` and `campaign_alerts` tables directly

## Next Steps

- [ ] Set up production webhook URLs with providers
- [ ] Enable signature verification in production
- [ ] Create safety dashboard to display alerts
- [ ] Implement bounce rate monitoring and auto-pausing
- [ ] Add email notifications for high bounce/complaint rates
- [ ] Create cleanup cron job for old webhook events

## Support

For issues or questions, check:
- Webhook events log: `webhook_events` table
- Application logs: `console.error()` in route handler
- Provider documentation for webhook formats

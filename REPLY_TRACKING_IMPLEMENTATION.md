# Reply Tracking Implementation Summary

## Overview
This implementation adds comprehensive reply tracking to the SmartSend sequence system. When recipients reply to sequence emails, the system automatically detects the replies, marks jobs as "replied", and optionally pauses future sequence steps for that contact.

## Implementation Details

### 1. Database Schema Changes
**File:** `supabase/migrations/20250130000000_add_reply_tracking_to_sequence_jobs.sql`

Added the following fields to `sequence_jobs` table:
- `replied_at` (timestamptz) - When the reply was received
- `reply_from` (text) - Email address of the replier
- `reply_subject` (text) - Subject line of the reply
- `reply_snippet` (text) - First 240 characters of the reply body
- `reply_message_id` (text) - Message ID of the reply

Also added an index on `provider_message_id` for efficient lookups.

### 2. Email Correlation Headers
**File:** `supabase/functions/sequence-worker/index.ts`

Updated the `sendResend` function to:
- Accept optional headers parameter
- Include `X-SmartSend-Job: {job_id}` header in all outgoing emails
- This allows the webhook to correlate replies back to specific jobs

### 3. Inbound Webhook Endpoint
**File:** `src/app/api/smartsend/inbound/route.ts`

Created a comprehensive webhook handler that:
- Accepts Resend JSON webhooks (`email.received` events)
- Accepts SendGrid Inbound Parse webhooks (multipart/form-data)
- Extracts reply correlation data from headers (`X-SmartSend-Job`, `In-Reply-To`, `References`)
- Updates job status to "replied" with reply metadata
- Automatically cancels queued jobs for the same contact/sequence (auto-pause)

### 4. UI Updates
**File:** `src/app/smartsend/runs/page.tsx`

Enhanced the runs page to:
- Display "replied" status with blue badge
- Show reply information (timestamp, sender, subject snippet)
- Filter by "replied" status
- Added new "Reply" column to the table

## Setup Instructions

### Resend Webhook Setup
1. Go to Resend Dashboard → Webhooks → Add
2. URL: `https://your-domain.com/api/smartsend/inbound`
3. Events: Select `email.received`
4. (Optional) Enable signing for additional security

### SendGrid Inbound Parse Setup
1. Add a receiving subdomain (e.g., `reply.yourdomain.com`)
2. Set MX record for that subdomain → `mx.sendgrid.net` (priority 10)
3. In SendGrid Settings → Inbound Parse, map the host to your webhook URL
4. Test by sending an email to `any@reply.yourdomain.com`

### Testing the System
1. **Create a test sequence** with at least 2 steps
2. **Schedule a job** to your own email address
3. **Verify the email** includes the `X-SmartSend-Job` header (check email source)
4. **Reply to the email** from another inbox
5. **Check the webhook** receives the reply (check server logs)
6. **Verify the UI** shows "replied" status with reply details
7. **Confirm auto-pause** works by checking that subsequent steps are canceled

## Key Features

### Reply Detection Methods
1. **Explicit Header**: Uses `X-SmartSend-Job` header for direct correlation
2. **In-Reply-To/References**: Falls back to standard email threading headers
3. **Provider Message ID**: Matches against stored `provider_message_id`

### Auto-Pause Functionality
When a reply is detected:
1. The original job is marked as "replied"
2. All queued jobs for the same contact + sequence are automatically canceled
3. This prevents sending follow-up emails to contacts who have already responded

### Multi-Provider Support
- **Resend**: JSON webhook with `email.received` events
- **SendGrid**: Inbound Parse with multipart/form-data
- **Extensible**: Easy to add support for other providers

## Security Considerations

### Webhook Verification
- The webhook includes placeholder for HMAC signature verification
- For production, implement proper signature verification based on provider docs
- Consider rate limiting and IP whitelisting

### Data Privacy
- Only stores reply snippets (first 240 characters)
- Reply metadata is stored securely in the database
- Consider data retention policies for reply data

## Monitoring and Debugging

### Logging
- Webhook endpoint logs successful reply processing
- Auto-pause cancellation errors are logged but don't fail the main operation
- Check server logs for webhook delivery issues

### Common Issues
1. **Webhook not receiving replies**: Check DNS/MX records, webhook URL configuration
2. **Replies not correlating**: Verify `X-SmartSend-Job` header is present in sent emails
3. **Auto-pause not working**: Check that job has valid `sequence_id` and `contact_email`

## Future Enhancements

### Potential Improvements
1. **Reply Analysis**: Use AI to analyze reply sentiment/intent
2. **Smart Responses**: Auto-generate responses to common reply types
3. **Reply Templates**: Pre-defined responses for different reply scenarios
4. **Analytics**: Track reply rates, response times, conversation metrics
5. **Integration**: Connect with CRM systems to sync reply data

### Additional Providers
- **Gmail Push Notifications**: Use Google Pub/Sub for real-time reply detection
- **Outlook**: Microsoft Graph API for Office 365 reply tracking
- **Custom SMTP**: Direct SMTP server integration for enterprise setups

## API Endpoints

### Webhook Endpoint
- **URL**: `/api/smartsend/inbound`
- **Method**: POST
- **Content Types**: 
  - `application/json` (Resend)
  - `multipart/form-data` (SendGrid)
- **Response**: `{"ok": true}` on success

### Jobs API (Enhanced)
- **URL**: `/api/smartsend/jobs`
- **Method**: GET
- **New Fields**: `replied_at`, `reply_from`, `reply_subject`, `reply_snippet`
- **New Status**: `"replied"` added to status filter options

This implementation provides a robust foundation for reply tracking that can be extended and customized based on specific business needs.
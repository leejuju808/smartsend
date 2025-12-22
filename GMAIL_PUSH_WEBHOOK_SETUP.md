# Gmail Push Webhook Setup

This document explains how to set up and use the Gmail push webhook integration for receiving email replies.

## Overview

The Gmail push webhook allows you to receive email replies through two methods:
1. **Direct JSON POST** from tools like Zapier, cron jobs, or relay services
2. **Google Pub/Sub Push Notifications** from Gmail Watch API

Both methods securely store replies in the `email_replies` table and trigger the AI reply detection Edge Function.

## Files Created

- `src/app/api/gmail/push/route.ts` - Webhook handler endpoint
- `supabase/migrations/20250103_gmail_push_webhook_replies.sql` - Database schema
- `test-gmail-push-webhook.sh` - Test script
- `GMAIL_PUSH_WEBHOOK_SETUP.md` - This documentation

## Setup Instructions

### 1. Environment Variables

Add the following environment variable to your Vercel project or `.env.local`:

```bash
GMAIL_WEBHOOK_SECRET=your-long-random-string-here
```

Generate a secure random string:
```bash
openssl rand -hex 32
```

### 2. Run Database Migration

Apply the database migration to add the necessary columns and triggers:

```bash
# If using Supabase CLI
supabase db push

# Or manually apply the SQL file in the Supabase dashboard
```

### 3. Enable pg_net Extension (Optional but Recommended)

If you want the trigger to automatically call your Edge Function:

```sql
CREATE EXTENSION IF NOT EXISTS pg_net;
```

### 4. Deploy

Deploy your application to Vercel or your hosting platform.

## Usage

### Endpoint

```
POST https://your-app.com/api/gmail/push
```

**Required Header:**
```
x-webhook-secret: <GMAIL_WEBHOOK_SECRET>
```

### Method 1: Direct JSON POST

Send a JSON payload directly to the webhook:

```bash
curl -X POST https://your-app.com/api/gmail/push \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: your-secret-here" \
  -d '{
    "workspace_id": "123e4567-e89b-12d3-a456-426614174000",
    "from_email": "customer@example.com",
    "subject": "Re: Quick question",
    "body": "Sure, lets talk Monday.",
    "provider_message_id": "18c7f0a2b1d3c9e7",
    "thread_id": "186fe7f3a9a8c2d1",
    "received_at": "2025-01-03T19:22:03Z"
  }'
```

**Payload Fields:**
- `workspace_id` (optional): UUID of the workspace
- `lead_id` (optional): UUID of the lead - if not provided, will try to resolve by email
- `from_email` (required): Email address of the sender
- `subject` (optional): Email subject
- `body` (required): Email body content
- `provider_message_id` (optional): Message ID from provider (Gmail, etc.)
- `thread_id` (optional): Thread ID for conversation tracking
- `received_at` (optional): ISO timestamp, defaults to now

### Method 2: Google Pub/Sub Push

Configure Google Pub/Sub to send push notifications to your webhook.

**Pub/Sub Payload Format:**
```json
{
  "message": {
    "data": "<base64-encoded-json>",
    "messageId": "123456789"
  },
  "subscription": "projects/myproject/subscriptions/mysubscription"
}
```

The base64-encoded data should contain the same fields as the direct JSON payload.

### Lead Resolution

The webhook will attempt to resolve the lead in this order:
1. **Explicit lead_id**: If provided in the payload
2. **Email match**: Look for existing lead with matching `from_email` and `workspace_id`
3. **Thread match**: Look for existing email with matching `thread_id`
4. **Store anyway**: If no match, still stores the reply with a placeholder lead_id

## How It Works

1. **Webhook receives request** → Validates secret header
2. **Parse payload** → Handles both direct JSON and Pub/Sub formats
3. **Resolve lead** → Finds matching lead or creates placeholder
4. **Insert reply** → Stores in `email_replies` table
5. **Trigger Edge Function** → Database trigger calls `ai-reply-detection` function
6. **Process reply** → AI determines if it's a real reply and updates lead status

## Database Schema

The `email_replies` table includes:
- `id`: UUID primary key
- `workspace_id`: Associated workspace
- `lead_id`: Associated lead (foreign key)
- `from_email`: Sender email
- `subject`: Email subject
- `body`: Email body content
- `provider_message_id`: Provider-specific message ID
- `thread_id`: Conversation thread ID
- `raw`: Full payload stored as JSONB
- `received_at`: Timestamp when received

## Testing

Use the provided test script:

```bash
# Set environment variables
export GMAIL_WEBHOOK_SECRET="test-secret-12345"
export GMAIL_PUSH_WEBHOOK_URL="http://localhost:3000/api/gmail/push"

# Run tests
./test-gmail-push-webhook.sh
```

## Security

- **Webhook Secret**: Protects endpoint from unauthorized access
- **RLS Policies**: Row-level security ensures users can only see their workspace's replies
- **Service Role**: Only service role can insert via webhook

## Integration Examples

### Zapier Integration

Create a Zap that triggers on new Gmail emails and sends to the webhook:

```json
{
  "workspace_id": "{{workspace_id}}",
  "from_email": "{{from_email}}",
  "subject": "{{subject}}",
  "body": "{{body_text}}",
  "provider_message_id": "{{message_id}}",
  "thread_id": "{{thread_id}}"
}
```

### Google Apps Script

Use Google Apps Script to forward Gmail replies:

```javascript
function forwardReplyToWebhook(e) {
  const webhookUrl = 'https://your-app.com/api/gmail/push';
  const secret = 'your-secret-here';
  
  const payload = {
    workspace_id: 'your-workspace-id',
    from_email: e.from,
    subject: e.subject,
    body: e.plainBody,
    provider_message_id: e.messageId,
    thread_id: e.threadId,
    received_at: new Date().toISOString()
  };
  
  UrlFetchApp.fetch(webhookUrl, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-webhook-secret': secret
    },
    payload: JSON.stringify(payload)
  });
}
```

## Troubleshooting

### 401 Unauthorized
- Check that `x-webhook-secret` header matches `GMAIL_WEBHOOK_SECRET` env var

### 400 Bad Request
- Verify JSON payload is valid
- Ensure required fields (`from_email`, `body`) are present

### Reply not showing up
- Check database for inserted record in `email_replies` table
- Verify Edge Function is being triggered (check logs)
- Ensure `pg_net` extension is enabled for trigger HTTP calls

### Lead not found
- Verify `workspace_id` is correct
- Check if lead exists with matching email
- Reply will still be stored with placeholder lead_id

## Next Steps

1. Set up Gmail Watch API to push notifications to Pub/Sub
2. Create a Cloud Function to process Gmail history and post to webhook
3. Configure AI reply detection Edge Function
4. Set up notifications for new replies in your application

## Related Documentation

- [Gmail API Watch Setup](./GMAIL_INTEGRATION_SETUP.md)
- [Gmail Reply Detection](./GMAIL_REPLY_DETECTION_SETUP.md)
- [Inbox Webhook Integration](./INBOX_WEBHOOK_IMPLEMENTATION_SUMMARY.md) 
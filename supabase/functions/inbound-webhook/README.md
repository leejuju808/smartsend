# Inbound Webhook Function

Handles Gmail and Outlook push notifications for inbound email replies.

## Deployment

```bash
supabase functions deploy inbound-webhook --no-verify-jwt
```

## Setup

### Gmail Webhook

1. Enable Gmail API and Pub/Sub in Google Cloud Console
2. Create a Pub/Sub topic and subscription
3. Enable watch on the Gmail inbox:
   ```
   POST https://gmail.googleapis.com/gmail/v1/users/me/watch
   {
     "topicName": "projects/YOUR_PROJECT/topics/gmail-webhook",
     "labelIds": ["INBOX"]
   }
   ```
4. Configure Pub/Sub to forward messages to this function URL:
   ```
   https://YOUR_PROJECT.functions.supabase.co/inbound-webhook
   ```
5. When Gmail posts a notification with `historyId`, fetch the full message using Gmail API `/messages/{id}` and POST to this function

### Outlook Webhook

1. Subscribe to Outlook Graph API webhooks:
   ```
   POST https://graph.microsoft.com/v1.0/subscriptions
   {
     "changeType": "created",
     "notificationUrl": "https://YOUR_PROJECT.functions.supabase.co/inbound-webhook",
     "resource": "me/mailFolders('Inbox')/messages",
     "expirationDateTime": "2025-12-31T00:00:00Z"
   }
   ```
2. Handle validation challenge: When Microsoft sends a `validationToken` query param, echo it back
3. Process notification payloads with message details

## Payload Format

### Gmail Example
```json
{
  "from": "lead@example.com",
  "to": "you@example.com",
  "subject": "Re: Your email",
  "html": "<p>Reply body</p>",
  "text": "Reply body",
  "snippet": "Reply body",
  "messageId": "<msg-id>",
  "inReplyTo": "<original-msg-id>",
  "threadId": "thread-id",
  "campaign_id": "uuid",
  "lead_id": "uuid"
}
```

### Outlook Example
```json
{
  "from": "lead@example.com",
  "to": "you@example.com",
  "subject": "Re: Your email",
  "html": "<p>Reply body</p>",
  "text": "Reply body",
  "messageId": "msg-id",
  "inReplyTo": "original-msg-id",
  "conversationId": "conv-id",
  "campaign_id": "uuid",
  "lead_id": "uuid"
}
```

## Headers

- `x-provider`: `gmail` or `outlook` (defaults to `gmail`)

## Matching Logic

The function matches inbound messages to threads/leads/campaigns using:

1. **SmartSend Headers**: Custom headers `x-smartsend-campaign` and `x-smartsend-lead`
2. **In-Reply-To**: Matches `in_reply_to` to `send_logs.provider_message_id`
3. **Email + Campaign**: Falls back to matching lead email with campaign

## Response

Success:
```json
{
  "ok": true,
  "thread_id": "uuid",
  "campaign_id": "uuid",
  "lead_id": "uuid"
}
```

Error:
```json
{
  "error": "Error message"
}
```

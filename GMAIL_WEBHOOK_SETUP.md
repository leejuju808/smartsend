# Gmail Webhook Implementation

## Overview

The Gmail webhook (`app/api/gmail/webhook/route.ts`) receives Gmail Pub/Sub push notifications when new emails arrive in the inbox. It:

1. Verifies the webhook is authorized
2. Parses the Pub/Sub notification
3. Looks up the connected Gmail account
4. Fetches the newest inbox message
5. Maps the sender to a lead
6. Calls the `ai-reply-detection` edge function

## Environment Variables

Add these to your `.env` file (or Vercel environment variables):

```bash
# Pub/Sub webhook authentication token
PUBSUB_WEBHOOK_TOKEN=super-long-random-string-change-in-production

# Supabase configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Google OAuth credentials (for token refresh)
GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret

# Optional: shared secret for ai-reply-detection function
FN_AI_REPLY_SECRET=optional-shared-secret
```

## Database Requirements

Ensure you have the following tables:

### `email_accounts`
```sql
CREATE TABLE email_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  email_address TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'gmail',
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `leads`
```sql
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL,
  status TEXT DEFAULT 'active'
);
```

### `logs`
```sql
CREATE TABLE logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  level TEXT NOT NULL,
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  meta JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Testing the Webhook

### 1. Generate a test Pub/Sub payload

```bash
# Base64 encode the Gmail watch data
echo '{"emailAddress":"you@sender.com","historyId":"123"}' | base64
# Output: eyJlbWFpbEFkZHJlc3MiOiJ5b3VAc2VuZGVyLmNvbSIsImhpc3RvcnlJZCI6IjEyMyJ9
```

### 2. Test with curl

```bash
curl -X POST 'https://your-app.vercel.app/api/gmail/webhook?token=super-long-random-string' \
  -H 'Content-Type: application/json' \
  -d '{
    "message": {
      "data": "eyJlbWFpbEFkZHJlc3MiOiJ5b3VAc2VuZGVyLmNvbSIsImhpc3RvcnlJZCI6IjEyMyJ9"
    }
  }'
```

### 3. Prerequisites for successful test

Ensure you have:
- A row in `email_accounts` for the email address (`you@sender.com`)
- A valid Gmail `access_token` (will auto-refresh if needed)
- A matching lead in `leads` table with the sender's email

## Gmail Watch Setup

To enable Gmail push notifications:

1. Set up a Google Cloud Pub/Sub topic and subscription
2. Configure Gmail API watch:
```javascript
POST https://gmail.googleapis.com/gmail/v1/users/me/watch
{
  "topicName": "projects/YOUR_PROJECT/topics/gmail_notifications",
  "labelIds": ["INBOX"]
}
```

3. Point the Pub/Sub subscription to your webhook URL:
```
https://your-app.vercel.app/api/gmail/webhook?token=super-long-random-string
```

## Flow Diagram

```
Gmail Pub/Sub → Webhook Route
  ↓
Verify token
  ↓
Parse watch data (emailAddress)
  ↓
Lookup email_accounts
  ↓
Fetch newest INBOX message
  ↓
Extract sender email
  ↓
Lookup lead by email
  ↓
Call ai-reply-detection function
```

## Error Handling

The webhook gracefully handles:
- Invalid or missing data (returns `noop`)
- No linked Gmail account (logs warning)
- Token refresh failures (uses existing token)
- No matching lead (logs info, continues)
- AI detection failures (logs error)

All errors are logged to the `logs` table for monitoring.

## Security

- Webhook token prevents unauthorized access
- Only processes messages from verified Gmail accounts
- Uses service role key for database access
- HMAC tokens for AI function calls (optional)

## Monitoring

Check the `logs` table for webhook activity:

```sql
SELECT level, message, meta, created_at
FROM logs
WHERE source = 'gmail-webhook'
ORDER BY created_at DESC
LIMIT 50;
``` 
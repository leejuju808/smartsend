# Gmail Poller System Setup

This implementation provides automatic Gmail inbox polling to detect replies and forward them to the reply detection system.

## Overview

The Gmail poller system consists of:
1. **Database tables**: `connected_accounts` and `inbox_messages` for storing OAuth accounts and received messages
2. **Edge Function**: `gmailPoller` that runs on a schedule to fetch and process new emails
3. **Reply Detection**: Automatic AI-powered reply detection that marks leads as "Replied"

## Components

### 1. Database Tables

#### `connected_accounts` Table
Stores Gmail OAuth credentials:
- `id`, `user_id`, `provider`, `email`
- `access_token`, `refresh_token`, `expires_at`
- `last_checked_at` (polling watermark)
- Created by migration: `20250228000000_gmail_oauth_connected_accounts.sql`
- Additional polling column: `20250103000000_add_last_checked_to_connected_accounts.sql`

#### `inbox_messages` Table
Stores all received Gmail messages:
- `id`, `provider`, `account_email`, `message_id`, `thread_id`
- `from_email`, `to_email`, `subject`, `snippet`, `body_plain`
- `received_at`, `lead_id`, `is_reply`, `processed_at`
- Created by migration: `20250102000005_create_inbox_messages_gmail.sql`

### 2. Gmail Poller Function

**File**: `supabase/functions/gmailPoller/index.ts`

**Purpose**: Polls Gmail accounts every 5 minutes for new messages

**Features**:
- Automatic token refresh using refresh tokens
- Fetches messages newer than 1 day
- Skips promotions and social categories
- Forwards potential replies to `replyDetection` function
- Updates polling watermarks to prevent duplicates
- Stores all messages in `inbox_messages` for audit trail

### 3. Reply Detection Integration

**Function**: `supabase/functions/replyDetection/index.ts`

**Purpose**: AI-powered reply detection using OpenAI

**Features**:
- Uses GPT-4o-mini for cost-effective classification
- Detects if an email is a "replied" or "not replied"
- Updates `leads.status` to "replied" on detection
- Updates `inbox_messages.is_reply` flag
- Can pause sequences for replied leads

## Environment Variables

Add these to your Supabase Edge Functions environment:

### Required
```bash
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OPENAI_API_KEY=your_openai_api_key  # for replyDetection function
```

### Optional
```bash
CRON_SECRET=some-long-random-string  # for securing scheduled invocations
```

## Setup Steps

### 1. Run Database Migrations

Apply the SQL migrations in your Supabase SQL editor:

```bash
# Migration 1: Ensure connected_accounts exists with polling column
supabase db push

# Or run manually:
```

```sql
-- From 20250228000000_gmail_oauth_connected_accounts.sql
-- From 20250103000000_add_last_checked_to_connected_accounts.sql
-- From 20250102000005_create_inbox_messages_gmail.sql
```

### 2. Deploy Edge Functions

Deploy both the poller and reply detection functions:

```bash
# Deploy gmailPoller
supabase functions deploy gmailPoller

# Deploy replyDetection (if not already deployed)
supabase functions deploy replyDetection
```

### 3. Set Environment Variables

In Supabase Dashboard → Functions → Settings:

1. Go to "Secrets" section
2. Add all required environment variables listed above
3. Save

### 4. Schedule the Cron Job

In Supabase Dashboard → Functions:

Create a new scheduled invocation:

- **Name**: `gmail-poller-cron`
- **Cron**: `*/5 * * * *` (every 5 minutes) or `0 * * * *` (hourly)
- **Invoke URL**: `/functions/v1/gmailPoller`
- **Headers**: `authorization: Bearer {{CRON_SECRET}}` (if you set CRON_SECRET)

Or use Supabase CLI:

```bash
supabase functions schedule create gmailPoller \
  --cron "*/5 * * * *" \
  --invoke-url "/functions/v1/gmailPoller" \
  --headers "authorization=Bearer ${CRON_SECRET}"
```

### 5. Connect Gmail Accounts

Use your OAuth flow to store credentials in `connected_accounts`:

```sql
INSERT INTO connected_accounts (
  user_id, provider, email, 
  access_token, refresh_token, expires_at
) VALUES (
  'user-uuid', 'gmail', 'user@gmail.com',
  'access_token_here', 'refresh_token_here',
  NOW() + INTERVAL '1 hour'
);
```

## OAuth Flow (Next Step)

Create a "Connect Gmail" UI that:
1. Initiates Google OAuth flow
2. Stores `access_token`, `refresh_token`, `token_expires_at`, and `email`
3. Inserts/updates `connected_accounts` table

See the user's request for this implementation in Step 5.

## Testing

### Manual Trigger

Test the poller manually:

```bash
curl -X POST https://your-project.functions.supabase.co/functions/v1/gmailPoller \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected response:
```json
{
  "ok": true,
  "results": [
    { "email": "user@gmail.com", "fetched": 5, "saved": 3 }
  ]
}
```

### Check Results

```sql
-- See recent inbox messages
SELECT * FROM inbox_messages 
ORDER BY received_at DESC 
LIMIT 10;

-- Check reply detection status
SELECT 
  email, 
  is_reply, 
  processed_at, 
  lead_id 
FROM inbox_messages 
WHERE is_reply = true 
ORDER BY received_at DESC;
```

## Dashboard Integration

### Realtime Updates

Add a Postgres realtime subscription for live updates:

```typescript
// In your Next.js dashboard
const supabase = createClient(...)

supabase
  .channel('replies')
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'leads',
      filter: 'status=eq.Replied'
    },
    (payload) => {
      console.log('Lead replied!', payload.new)
      // Update UI badge, pause sequences, etc.
    }
  )
  .subscribe()
```

## What You Get

After this setup:

✅ New emails are ingested on a schedule (every 5 min by default)  
✅ All messages stored in `inbox_messages` (auditable trail)  
✅ AI Reply Detection runs automatically  
✅ Leads marked as "Replied"  
✅ Follow-ups can be paused by status (already enabled by your send queue logic)  
✅ Bounce detection and suppression handling  
✅ Thread tracking for conversation context  

## Next Steps

1. **OAuth Connect Flow**: Build the "Connect Gmail" UI and API route
2. **Dashboard Updates**: Add realtime subscription for instant badge updates
3. **Reply Management**: Create UI to view/manage replies
4. **Follow-up Automation**: Extend pause logic to work with sequences

## Troubleshooting

### No messages being fetched

1. Check `connected_accounts` has valid tokens
2. Verify `last_checked_at` is updating
3. Check cron is running: `supabase functions logs gmailPoller --tail`

### Reply detection not working

1. Verify `OPENAI_API_KEY` is set
2. Check `replyDetection` function logs
3. Ensure `inbox_messages.processed_at` is being set

### Token refresh failures

1. Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are correct
2. Check refresh_token hasn't been revoked
3. Re-run OAuth flow to get fresh tokens

## Related Files

- `supabase/functions/gmailPoller/index.ts` - Main poller function
- `supabase/functions/replyDetection/index.ts` - AI reply detector
- `supabase/migrations/20250228000000_gmail_oauth_connected_accounts.sql` - OAuth table
- `supabase/migrations/20250102000005_create_inbox_messages_gmail.sql` - Messages table
- `supabase/migrations/20250103000000_add_last_checked_to_connected_accounts.sql` - Polling column


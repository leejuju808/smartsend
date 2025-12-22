# Mail Providers OAuth + Cursors System

This system implements OAuth token management and sync cursors for Gmail and Outlook mailboxes.

## Overview

The system provides:
- Secure OAuth token storage in the database
- Automatic token refresh when expired
- Gmail push notifications via Google Pub/Sub
- Outlook delta link polling
- Provider-specific cursors for incremental sync

## Quick Connect Flow (Block 36)

1. **Environment**  
   - Provide `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REDIRECT_URI`  
   - Provide `OUTLOOK_CLIENT_ID`, `OUTLOOK_CLIENT_SECRET`, `OUTLOOK_REDIRECT_URI`  
   - Expose the Supabase Edge adapter via `PROVIDER_SEND_URL` (e.g. `https://<project>.functions.supabase.co/provider-send`).

2. **OAuth Clients**  
   - Gmail: create a Web OAuth client with scope `https://www.googleapis.com/auth/gmail.send` and redirect `https://app.smartsend.ai/api/auth/gmail/callback`.  
   - Outlook: register an Azure app with scopes `Mail.Send offline_access` and redirect `https://app.smartsend.ai/api/auth/outlook/callback`.

3. **Application Routes**  
   - Users start OAuth at `/api/auth/gmail/start` or `/api/auth/outlook/start`.  
   - Callbacks persist tokens in `public.mail_accounts` and enforce per-account quotas.

4. **Send Orchestrator**  
   - Supabase Edge function `provider-send` relays send requests to Gmail or Outlook, rotates tokens, and increments `quota_used`.  
   - The send worker calls the adapter using `PROVIDER_SEND_URL`.

## Database Schema

### Mailboxes Table

The `mailboxes` table stores connected mailboxes with OAuth tokens and sync cursors:

```sql
create table mailboxes (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  provider text check (provider in ('gmail','outlook')) not null,
  email text not null,
  -- OAuth
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  -- Provider-specific cursors
  gmail_history_id text,           -- for Gmail users.history.list
  outlook_delta_link text,         -- for Graph delta
  -- Gmail watch metadata
  gmail_watch_expire_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (provider, email)
);
```

RLS policies allow team members to read mailboxes and only admins to manage them.

## Setup Instructions

### 1. Database Migration

Apply the migration:

```bash
supabase db push
```

This creates the `mailboxes` table with RLS policies.

### 2. Environment Variables

Add these to Supabase → Functions → Settings → Secrets:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Microsoft OAuth (Azure App)
MS_TENANT_ID=your_azure_tenant_id
MS_CLIENT_ID=your_azure_client_id
MS_CLIENT_SECRET=your_azure_client_secret

# Gmail Watch
GCP_PUBSUB_TOPIC=projects/your-gcp-project/topics/gmail-push
```

### 3. Deploy Edge Functions

```bash
# Shared token utilities
# No deployment needed - imported by other functions

# Gmail functions
supabase functions deploy gmailStartWatch
supabase functions deploy gmailRenewAll
supabase functions deploy gmailPush
supabase functions deploy gmailSync
supabase functions deploy mailboxUpdateHistory

# Outlook function
supabase functions deploy outlookPoll
```

### 4. Google Cloud Pub/Sub Setup

#### Create Pub/Sub Topic

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **Pub/Sub** → **Topics**
3. Create a new topic named `gmail-push`
4. Note the full topic name: `projects/YOUR-GCP-PROJECT/topics/gmail-push`

#### Create Push Subscription

1. In the Pub/Sub topic, click **Create Subscription**
2. Choose **Push subscription**
3. Set the endpoint URL: `https://YOUR-PROJECT-REF.functions.supabase.co/gmailPush`
4. Set **Acknowledgment deadline**: 600 seconds (10 minutes)
5. Keep defaults for retry and expiration

#### Grant Publisher Permission

Your Gmail API service account needs publish permission on the topic:

1. In Pub/Sub, select the `gmail-push` topic
2. Click **Show Info Panel** → **Permissions**
3. Add your Google service account email with **Pub/Sub Publisher** role

### 5. Scheduled Jobs

Set up scheduled functions in Supabase Dashboard:

#### Gmail Watch Renewal (Daily)

1. Go to **Database** → **Scheduler** → **New Job**
2. Configure:
   - **Name**: `gmail-renew-watches`
   - **Schedule**: `0 2 * * *` (2 AM daily)
   - **Target**: Edge Function
   - **Function**: `gmailRenewAll`
   - **Method**: POST
   - **Headers**: `{"Content-Type": "application/json"}`
   - **Body**: `{}`

#### Outlook Polling (Every 3 Minutes)

1. Go to **Database** → **Scheduler** → **New Job**
2. Configure:
   - **Name**: `outlook-poll`
   - **Schedule**: `*/3 * * * *` (every 3 minutes)
   - **Target**: Edge Function
   - **Function**: `outlookPoll`
   - **Method**: POST
   - **Headers**: `{"Content-Type": "application/json"}`
   - **Body**: `{}`

## How It Works

### Gmail Flow

1. **Initial Setup**: Call `gmailStartWatch` with a mailbox ID to register for push notifications
2. **Push Notification**: When new emails arrive, Google Pub/Sub sends a notification to `gmailPush`
3. **Sync Trigger**: `gmailPush` triggers `gmailSync` to fetch new messages
4. **Message Classification**: `gmailSync` calls `classifyEmail` for each new message
5. **Watch Renewal**: `gmailRenewAll` runs daily to renew expiring watches

### Outlook Flow

1. **Initial Poll**: `outlookPoll` fetches the delta link or starts from the beginning
2. **Delta Sync**: Uses Microsoft Graph delta API for incremental sync
3. **Message Classification**: Calls `classifyEmail` for each new message
4. **Checkpoint**: Stores the delta link for the next poll
5. **Scheduled**: Runs every 3 minutes via Supabase Scheduler

### Token Management

All functions use the shared `_shared/token.ts` utilities:

- `ensureGmailAccess()`: Checks expiration and refreshes Google tokens
- `ensureGraphAccess()`: Checks expiration and refreshes Microsoft tokens
- `getMailbox()`: Fetches a mailbox by ID
- `saveMailbox()`: Updates mailbox data

Tokens are automatically refreshed when expired (60 second skew for safety).

## Functions Reference

### gmailStartWatch

Starts a Gmail watch for a mailbox.

**Request:**
```json
{
  "mailboxId": "uuid"
}
```

**Response:**
```json
{
  "ok": true,
  "watch": {
    "historyId": "...",
    "expiration": "..."
  }
}
```

### gmailRenewAll

Renews all Gmail watches expiring within 24 hours. Should be scheduled daily.

**Request:** None (runs on schedule)

**Response:**
```
OK
```

### gmailPush

Receives Pub/Sub push notifications from Google. Should not be called directly.

**Request:** Pub/Sub message format

**Response:**
```
OK
```

### gmailSync

Syncs new messages for a mailbox since the last history ID.

**Request:**
```json
{
  "mailboxId": "uuid"
}
```

**Response:**
```json
{
  "ok": true,
  "processed": 5
}
```

### outlookPoll

Polls Outlook for new messages using delta links.

**Request:** None (runs on schedule)

**Response:**
```json
{
  "ok": true,
  "processed": 3
}
```

### mailboxUpdateHistory

Updates the Gmail history ID for a mailbox.

**Request:**
```json
{
  "mailboxId": "uuid",
  "historyId": "12345"
}
```

**Response:**
```json
{
  "ok": true
}
```

## Testing

### Test Gmail Watch

```bash
curl -X POST https://YOUR-PROJECT-REF.functions.supabase.co/gmailStartWatch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -d '{"mailboxId": "mailbox-uuid"}'
```

### Test Outlook Poll

```bash
curl -X POST https://YOUR-PROJECT-REF.functions.supabase.co/outlookPoll \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
```

### Monitor Logs

View function logs in Supabase Dashboard → Edge Functions → Logs

## Troubleshooting

### Gmail Push Not Working

1. Check Pub/Sub subscription is active
2. Verify endpoint URL is correct
3. Check Pub/Sub logs for delivery errors
4. Ensure GCP project has Gmail API enabled

### Outlook Poll Not Working

1. Verify Microsoft Graph permissions in Azure App
2. Check token refresh is working
3. Review function logs for delta link errors
4. Ensure mailbox has emails in Inbox

### Token Refresh Failures

1. Verify environment variables are set correctly
2. Check OAuth client IDs and secrets match
3. Ensure refresh tokens haven't been revoked
4. Check Azure tenant ID is correct

## Next Steps

- Add UI for connecting mailboxes
- Implement thread mapping for better lead/campaign association
- Add error notifications for failed syncs
- Create mailbox health dashboard


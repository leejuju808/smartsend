# Gmail Polling System Setup

This implementation provides automatic Gmail inbox polling to detect replies and forward them to the reply detection system.

## Components Created

### 1. Database Schema (`supabase/migrations/20250125000000_email_accounts.sql`)
- **Table**: `email_accounts`
- **Purpose**: Stores connected Gmail/Outlook accounts with encrypted tokens
- **Key Fields**:
  - `provider`: 'gmail' or 'outlook'
  - `access_token` & `refresh_token`: Encrypted OAuth tokens
  - `last_checked_at`: Watermark for polling to avoid duplicates
  - `is_active`: Enable/disable polling per account

### 2. Gmail Poller Function (`supabase/functions/gmail-poller/index.ts`)
- **Purpose**: Polls Gmail accounts every 3 minutes for new messages
- **Features**:
  - Automatic token refresh using refresh tokens
  - Intelligent querying (only inbox, newer than 1 day, not from self)
  - Forwards potential replies to existing `reply-detector` function
  - Updates polling watermarks to prevent duplicate processing

### 3. Cron Schedule (`supabase/migrations/20250125000001_gmail_poller_cron.sql`)
- **Schedule**: Every 3 minutes (`*/3 * * * *`)
- **Function**: Calls `gmail-poller` Edge Function automatically
- **Manual Trigger**: `trigger_gmail_poll()` SQL function for testing

### 4. UI Status Indicator (`src/components/InboxSyncStatus.tsx`)
- **Location**: Dashboard header (next to other status badges)
- **Features**:
  - Shows "Inbox Sync: Active" when Gmail accounts are connected
  - Displays last sync time (now, 3m, 1h, etc.)
  - Animated pulse indicator for active sync
  - Auto-refreshes every 30 seconds

### 5. Test Endpoint (`src/app/api/test-gmail-poller/route.ts`)
- **Purpose**: Manual testing of Gmail poller
- **Usage**: `POST /api/test-gmail-poller` with optional `workspaceId`

## Environment Variables Required

Add these to your Supabase Edge Functions environment:

```bash
GOOGLE_OAUTH_CLIENT_ID=your_google_client_id
GOOGLE_OAUTH_CLIENT_SECRET=your_google_client_secret
REPLY_DETECTOR_KEY=optional_auth_key_for_reply_detector
```

## Setup Steps

1. **Run Migrations**:
   ```bash
   supabase db push
   ```

2. **Deploy Edge Function**:
   ```bash
   supabase functions deploy gmail-poller
   ```

3. **Set Environment Variables** in Supabase Dashboard → Edge Functions → Variables

4. **Connect Gmail Accounts**: Use your existing OAuth flow to insert records into `email_accounts` table

## How It Works

1. **Cron Trigger**: Every 3 minutes, the cron job calls the `gmail-poller` function
2. **Account Loading**: Function loads active Gmail accounts, ordered by `last_checked_at`
3. **Token Refresh**: Automatically refreshes expired access tokens using refresh tokens
4. **Message Polling**: Queries Gmail API for new messages since last check
5. **Reply Detection**: Forwards inbound messages to existing `reply-detector` function
6. **Watermark Update**: Updates `last_checked_at` to prevent duplicate processing

## Testing

### Manual Test
```bash
curl -X POST http://localhost:54321/functions/v1/gmail-poller \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"workspaceId": "optional-workspace-id"}'
```

### SQL Test
```sql
SELECT trigger_gmail_poll();
```

### Check Status
```sql
SELECT 
  email, 
  provider, 
  is_active, 
  last_checked_at,
  expires_at
FROM email_accounts 
WHERE provider = 'gmail' 
ORDER BY last_checked_at ASC;
```

## Monitoring

- **UI Indicator**: Shows sync status in dashboard header
- **Logs**: Check Supabase Edge Functions logs for polling activity
- **Database**: Monitor `last_checked_at` timestamps to ensure regular polling

## Integration with Existing System

This system integrates seamlessly with your existing:
- **Reply Detection**: Uses existing `reply-detector` function
- **Lead Management**: Automatically marks leads as "replied" when replies detected
- **Email Logging**: Logs detections in `email_send_logs` table
- **UI Components**: Adds status indicator to existing dashboard layout
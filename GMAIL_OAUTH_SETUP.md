# Gmail OAuth Integration - Setup Complete ✅

This document describes the Gmail OAuth integration that has been implemented for your SmartSend AI application.

## What Was Implemented

### 1. Database Schema (`supabase/migrations/20250128_connected_accounts.sql`)
- Created `connected_accounts` table to store Gmail OAuth tokens
- Supports multiple providers (currently Gmail)
- Row-level security (RLS) enabled
- Automatic token refresh support
- Unique constraint on `(workspace_id, provider, account_email)`

### 2. OAuth Helpers (`src/lib/google.ts`)
- `getGoogleOAuth()` - Creates OAuth2 client
- `upsertAccount()` - Saves/updates Gmail tokens
- `getWorkspaceGmail()` - Fetches connected Gmail for a workspace
- `refreshIfNeeded()` - Auto-refreshes tokens when expired
- `gmailSend()` - Sends emails via Gmail API
- `buildRFC822()` - Builds RFC 822 email format
- `base64url()` - Encodes messages for Gmail API

### 3. OAuth Flow Routes
- **`/api/oauth/google/start`** - Initiates OAuth flow, redirects to Google
- **`/api/oauth/google/callback`** - Handles OAuth callback, saves tokens to database

### 4. Internal Endpoints (for worker)
- **`/api/internal/refresh-gmail`** - Refreshes Gmail tokens (requires `x-worker-key`)
- **`/api/internal/gmail-send`** - Sends emails via Gmail (requires `x-worker-key`)

### 5. UI Updates (`src/app/settings/integrations/page.tsx`)
- Connect Gmail button
- Shows connection status with email address
- Disconnect functionality
- Error handling for OAuth failures

### 6. Send Worker Updates (`supabase/functions/sendWorker/index.ts`)
- Fetches connected Gmail accounts from `connected_accounts` table
- Refreshes tokens automatically
- Sends real emails via Gmail API instead of stubs
- Handles cases where no Gmail is connected (marks as failed)

## Setup Instructions

### 1. Run Database Migration

Apply the migration to your Supabase database:

```bash
supabase db push
```

Or manually in Supabase SQL Editor:
```sql
-- Copy contents of supabase/migrations/20250128_connected_accounts.sql
```

### 2. Configure Environment Variables

Add these to your **Vercel** project settings and **Supabase Edge Functions** environment:

```env
# Google OAuth Credentials
GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
GOOGLE_OAUTH_REDIRECT_URI=https://your-domain.com/api/oauth/google/callback

# Worker Secret (for internal endpoints)
WORKER_SECRET=your-random-secret-key
```

### 3. Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable Gmail API
4. Go to **APIs & Services** → **Credentials**
5. Click **Create Credentials** → **OAuth 2.0 Client ID**
6. Application type: **Web application**
7. Authorized redirect URIs: `https://your-domain.com/api/oauth/google/callback`
8. Add scopes:
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/gmail.readonly` (optional)
9. Copy the Client ID and Client Secret

### 4. Test the Integration

1. Navigate to **Settings → Integrations**
2. Click **Connect Gmail**
3. Approve Google OAuth consent
4. You should see "Connected (your-email@gmail.com)"
5. Import leads and start a campaign
6. The worker will send real emails via your Gmail account

## How It Works

### OAuth Flow
1. User clicks "Connect Gmail"
2. Redirects to `/api/oauth/google/start`
3. Generates OAuth URL with workspace_id in `state` parameter
4. User approves on Google
5. Callback receives code + state
6. Exchanges code for tokens
7. Fetches user email
8. Saves to `connected_accounts` table
9. Redirects to `/settings/integrations?connected=gmail`

### Email Sending Flow
1. Worker processes `send_queue` jobs
2. Fetches connected Gmail for the workspace
3. If no Gmail → marks as failed with error "No Gmail connected"
4. Calls `/api/internal/refresh-gmail` to refresh token if needed
5. Calls `/api/internal/gmail-send` with email content
6. Updates queue with `message_id` from Gmail
7. Updates lead status to "sent"

### Token Refresh
- Tokens are stored with `token_expiry` timestamp
- `refreshIfNeeded()` checks if token expires within 60 seconds
- If expired, uses refresh_token to get new access_token
- Updates database with new token and expiry time
- This happens automatically before each send

## Troubleshooting

### "No Gmail connected" error
- User needs to connect Gmail in Settings → Integrations
- Check `connected_accounts` table has a row for the workspace

### "Unauthorized" error on internal endpoints
- Check `WORKER_SECRET` environment variable is set
- Worker must include `x-worker-key` header

### Token refresh fails
- Check `refresh_token` is stored in database
- Verify OAuth flow included `access_type: "offline"` and `prompt: "consent"`
- User may need to re-authorize

### Gmail send fails
- Check token is valid in database
- Verify `gmail.send` scope was granted
- Check sender email matches connected account

## Database Schema

```sql
connected_accounts (
  id uuid PRIMARY KEY,
  workspace_id uuid REFERENCES workspaces(id),
  provider text, -- 'gmail'
  account_email text,
  access_token text,
  refresh_token text,
  scope text,
  token_expiry timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  UNIQUE (workspace_id, provider, account_email)
)
```

## Next Steps

1. Test the complete flow end-to-end
2. Monitor email delivery in Gmail Sent folder
3. Check `send_queue` table for delivery status
4. Monitor logs for any OAuth or sending errors
5. Consider adding multiple Gmail accounts per workspace

## Files Modified/Created

- ✅ `supabase/migrations/20250128_connected_accounts.sql`
- ✅ `src/lib/google.ts`
- ✅ `src/app/api/oauth/google/start/route.ts`
- ✅ `src/app/api/oauth/google/callback/route.ts`
- ✅ `src/app/api/internal/refresh-gmail/route.ts`
- ✅ `src/app/api/internal/gmail-send/route.ts`
- ✅ `src/app/settings/integrations/page.tsx`
- ✅ `supabase/functions/sendWorker/index.ts`

All implementations are complete and ready for testing! 🚀

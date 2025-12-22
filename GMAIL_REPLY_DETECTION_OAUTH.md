# Gmail OAuth Integration for Reply Detection

## Overview

This implementation adds Google OAuth integration specifically for Gmail reply detection. Users can connect their Gmail inboxes with read-only access to enable automatic reply detection and stop email sequences when recipients reply.

## What Was Implemented

### 1. Database Migration (`supabase/migrations/20260102000001_connected_accounts_oauth.sql`)

- **Enhanced `connected_accounts` table**: Added support for polling and reply detection
  - Added `last_checked_at` column for polling watermark
  - Added `token_expires_at` column (supports both `expires_at` and `token_expires_at` for compatibility)
  - Email normalization trigger
  - Unique index on `(user_id, provider, email)`
  - Polling index on `last_checked_at`

- **Safe Public View** (`connected_accounts_public`): 
  - Excludes sensitive tokens
  - Provides token expiry and last checked timestamps
  - Compatible with both `expires_at` and `token_expires_at` columns

- **RLS Policies**: 
  - Users can only access their own connected accounts
  - Full CRUD for owners
  - Service role can access for server operations

### 2. OAuth Routes

**Start Route** (`src/app/api/oauth/google/start/route.ts`):
- Initiates OAuth flow with **read-only** scope: `gmail.readonly`
- Uses PKCE for security
- Redirects to Google's consent screen
- Sets httpOnly cookies for state and code verifier

**Callback Route** (`src/app/api/oauth/google/callback/route.ts`):
- Handles OAuth callback from Google
- Exchanges authorization code for access/refresh tokens
- Fetches Gmail profile to get email address
- Upserts tokens into `connected_accounts` table
- Redirects to integrations page with success/error status

**Integrations API** (`src/app/api/integrations/accounts/route.ts`):
- Public route that returns connected accounts from safe view
- Filters for Gmail provider
- Uses RLS for security

### 3. UI Integration (`src/app/dashboard/integrations/page.tsx`)

- Updated Gmail connection status to use `connected_accounts_public` view
- "Connect Gmail" button links to OAuth start route
- Shows connected email and status
- Displays token expiry and last checked timestamps
- Handles success/error query params

### 4. Server Helper

**Supabase Admin** (`src/lib/supabaseAdmin.ts`):
- Already exists, provides service role client
- Used for secure token storage via OAuth callback

## Environment Variables Required

Add these to your `.env.local`:

```bash
# Google OAuth
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=${NEXT_PUBLIC_APP_URL}/api/oauth/google/callback

# Supabase (already configured)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key

# App URL
NEXT_PUBLIC_APP_URL=https://yourapp.com
```

## Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project or select existing
3. Enable **Gmail API**
4. Go to "APIs & Services" → "Credentials"
5. Create "OAuth 2.0 Client ID"
6. Set authorized redirect URI: `https://yourapp.com/api/oauth/google/callback`
7. Copy Client ID and Secret to `.env.local`

## Database Migration

Run the migration:

```bash
supabase db push
```

Or apply manually in Supabase SQL Editor.

## How It Works

### Flow

1. **User initiates**: Clicks "Connect Gmail" on integrations page
2. **OAuth start**: Route redirects to Google consent screen
3. **User consents**: Grants read-only Gmail access
4. **Callback**: Google redirects back with authorization code
5. **Token exchange**: Server exchanges code for access/refresh tokens
6. **Profile fetch**: Gets Gmail email address
7. **Storage**: Tokens saved to `connected_accounts` table
8. **Redirect**: User sent back to integrations page with success status

### Reply Detection

Your existing `gmailPoller` can now:
- Query `connected_accounts` for accounts with expired `last_checked_at`
- Use `access_token` to fetch new messages via Gmail API
- Update `last_checked_at` after polling
- Call `reply_detection_edge` function for new messages
- Automatic trigger on `emails` insert updates `leads.status` to "Replied"

### Security

- **Tokens server-only**: Never exposed to client
- **Read-only scope**: Minimal permissions required
- **RLS enabled**: Users can only access their own accounts
- **Public view**: Sensitive tokens hidden from client
- **PKCE**: Code verifier pattern for CSRF protection

## Next Steps

### Testing

1. Connect a Gmail account via the UI
2. Verify row in `connected_accounts` with correct email and `expires_at`
3. Manually trigger poller or wait for cron
4. Send test reply from connected inbox
5. Verify `leads.status` updates to "Replied"

### Future Enhancements

- **Disconnect/Revoke**: Add DELETE route to revoke tokens
- **Realtime badge**: Channel subscription for instant status updates
- **Gmail "watch"**: Push webhooks to reduce polling (advanced)
- **Auto-refresh**: Background job to refresh expired tokens
- **Multiple accounts**: Support for connecting multiple Gmail accounts per user

## Troubleshooting

**OAuth fails with "redirect_uri_mismatch"**:
- Check `GOOGLE_REDIRECT_URI` matches exactly in Google Cloud Console
- Must use `https://`, no trailing slashes

**Tokens not saving**:
- Check `SUPABASE_SERVICE_ROLE_KEY` is set correctly
- Verify `connected_accounts` table migration ran
- Check for unique constraint violations (user already connected)

**No data in view**:
- Ensure RLS policies are created
- Check user is authenticated
- Verify email normalization trigger exists

## Related Files

- Migration: `supabase/migrations/20260102000001_connected_accounts_oauth.sql`
- Routes: `src/app/api/oauth/google/start/route.ts`, `src/app/api/oauth/google/callback/route.ts`
- API: `src/app/api/integrations/accounts/route.ts`
- UI: `src/app/dashboard/integrations/page.tsx`
- Helper: `src/lib/supabaseAdmin.ts`, `src/server/supabase.ts`

## Integration with Existing Systems

This integration works with:
- **Reply detection trigger**: `supabase/migrations/20250101000003_reply_detection_trigger.sql`
- **Gmail poller**: Your existing polling infrastructure
- **Lead management**: Automatic status updates on reply detection
- **Campaign sequences**: Auto-stop on reply detection


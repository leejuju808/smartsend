# Gmail OAuth Implementation

This document describes the Gmail OAuth integration for connecting Gmail inboxes to the SmartSend application.

## Files Created

### 1. Database Migration
**File:** `supabase/migrations/20250131_upsert_gmail_account_rpc.sql`

Creates a PostgreSQL RPC function `upsert_gmail_account` that:
- Takes user_id, email, access_token, refresh_token, and expires_in_seconds
- Automatically creates or retrieves the user's workspace_id
- Inserts/updates email accounts in the `email_accounts` table
- Handles token expiration calculation
- Returns the account ID

### 2. OAuth Start Route
**File:** `app/api/oauth/google/start/route.ts`

Initiates the OAuth flow by:
- Generating a unique state token for CSRF protection
- Redirecting to Google's OAuth authorization endpoint
- Requesting Gmail readonly and modify scopes
- Setting `access_type=offline` to get refresh tokens
- Setting `prompt=consent` to ensure refresh token is provided

### 3. OAuth Callback Route
**File:** `app/api/oauth/google/callback/route.ts`

Handles the OAuth callback by:
- Extracting the authorization code from Google
- Exchanging code for access/refresh tokens
- Decoding the JWT id_token to get user's email address
- Saving credentials using the `upsert_gmail_account` RPC function
- Redirecting user back to the application with success/error status

### 4. Client Component
**File:** `components/ConnectGmailButton.tsx`

A reusable button component that:
- Fetches the current user's ID from Supabase
- Links to the OAuth start route with user ID
- Provides basic styling for the connect button

## Environment Variables Required

Add these to your `.env.local` or deployment environment:

```bash
# Google OAuth Credentials (from Google Cloud Console)
GOOGLE_OAUTH_CLIENT_ID=your_client_id
GOOGLE_OAUTH_CLIENT_SECRET=your_client_secret
GOOGLE_OAUTH_REDIRECT_URI=https://app.yourdomain.com/api/oauth/google/callback

# App Configuration
NEXT_PUBLIC_APP_URL=https://app.yourdomain.com
NEXT_PUBLIC_SUPABASE_URL=https://your_project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Setup Steps

1. **Google Cloud Console Setup:**
   - Create a new OAuth 2.0 Client ID
   - Authorized redirect URIs: `https://app.yourdomain.com/api/oauth/google/callback`
   - Download credentials

2. **Database Migration:**
   ```bash
   # Apply the migration
   supabase db push
   # Or if using migrations directory
   supabase migration up
   ```

3. **Usage:**
   ```tsx
   import ConnectGmailButton from '@/components/ConnectGmailButton';
   
   export default function SettingsPage() {
     return (
       <div>
         <ConnectGmailButton />
       </div>
     );
   }
   ```

## OAuth Flow

1. User clicks "Connect Gmail" button
2. Redirected to Google OAuth consent screen
3. User authorizes the application
4. Google redirects to `/api/oauth/google/callback?code=...`
5. Callback route exchanges code for tokens
6. Tokens are saved to `email_accounts` table
7. User is redirected back to the application

## Database Schema

The implementation uses the existing `email_accounts` table:

- `workspace_id` - Links to workspace
- `user_id` - Links to user
- `provider` - Set to 'gmail'
- `email` - User's Gmail address
- `access_token` - OAuth access token
- `refresh_token` - OAuth refresh token
- `expires_at` - Token expiration timestamp
- `is_active` - Account status

## Security Features

- State token for CSRF protection in OAuth flow
- Service role key used in server-side operations
- Tokens stored in secure Supabase database
- Workspace isolation via RLS policies

## Next Steps

1. Implement Gmail Watch API endpoint (`/api/gmail/watch`)
2. Add token refresh mechanism for expired tokens
3. Add account management UI (disconnect, status)
4. Implement error handling and user feedback
5. Add Gmail-specific features (read inbox, send emails)

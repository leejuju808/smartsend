# Email Reply System Implementation

This document describes the email reply system implementation that allows users to send replies via connected Gmail accounts.

## Files Created/Updated

### 1. Database Migration
**File:** `supabase/migrations/20250228000003_replies_provider_accounts.sql`

Creates:
- `provider_accounts` table - stores OAuth credentials for Gmail/Outlook accounts
- `replies` table - stores sent replies with thread linkage
- Status fields on `emails` table (`status`, `replied_at`)
- Trigger to automatically mark emails as 'replied' when a reply is inserted
- RLS policies for both tables

### 2. Supabase Edge Function
**File:** `supabase/functions/send-email/index.ts`

Handles:
- Fetching provider account credentials from database
- Refreshing Google OAuth tokens when expired
- Sending emails via Gmail API (Outlook stub included)
- Returns success/error responses

**Deploy:**
```bash
supabase functions deploy send-email --no-verify-jwt
```

### 3. Next.js API Route
**File:** `src/app/api/reply/route.ts`

Endpoint: `POST /api/reply`

Accepts:
- `thread_id` (uuid) - references emails.id
- `to` (email)
- `subject` (string)
- `body` (string, plain text)

Flow:
1. Validates request and authenticates user
2. Inserts reply record (triggers email status update)
3. Calls edge function to send email
4. Returns reply and updated thread data

### 4. UI Components

**Updated:** `src/components/replies/SmartReplyPanel.tsx`
- Updated to use `/api/reply` endpoint
- Checks `provider_accounts` table for connection status
- Updated redirect to `/settings/email`

### 5. Settings Page
**File:** `src/app/settings/email/page.tsx`

Features:
- Shows connected provider account email
- "Connect Gmail" button to start OAuth flow
- Handles OAuth callback and completion

**OAuth Routes:**
- `/api/oauth/provider-accounts/start` - Initiates OAuth flow
- `/api/oauth/provider-accounts/callback` - Handles OAuth callback
- `/settings/email/complete` - Client-side completion page

## Environment Variables

### Next.js (.env.local)

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Google OAuth (for provider accounts)
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Supabase Edge Functions

Set these in Supabase Dashboard > Settings > Edge Functions > Environment Variables:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

## Setup Steps

1. **Run Database Migration:**
   ```bash
   supabase db push
   ```

2. **Deploy Edge Function:**
   ```bash
   supabase functions deploy send-email --no-verify-jwt
   ```

3. **Configure Google OAuth:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Enable Gmail API
   - Create OAuth 2.0 credentials
   - Add authorized redirect URI: `https://your-domain.com/api/oauth/provider-accounts/callback`
   - Copy Client ID and Secret to environment variables

4. **Set Environment Variables:**
   - Add to `.env.local` for Next.js
   - Add to Supabase Edge Functions environment

## Usage

1. **Connect Gmail Account:**
   - Navigate to `/settings/email`
   - Click "Connect Gmail"
   - Complete OAuth flow
   - Account stored in `provider_accounts` table

2. **Send Reply:**
   - Use `SmartReplyPanel` component or call `/api/reply` directly
   - Reply is stored in `replies` table
   - Email status automatically updated to 'replied'
   - Email sent via Gmail API

## Database Schema

### provider_accounts
- `id` (uuid, primary key)
- `user_id` (uuid, references auth.users)
- `provider` (text: 'gmail' | 'outlook')
- `email_address` (text, unique)
- `access_token` (text)
- `refresh_token` (text)
- `expires_at` (bigint, unix seconds)
- `created_at` (timestamptz)

### replies
- `id` (uuid, primary key)
- `thread_id` (uuid, references emails.id)
- `to_email` (text)
- `body` (text)
- `user_id` (uuid, references auth.users)
- `created_at` (timestamptz)

### emails
- `status` (text: 'open' | 'replied' | 'snoozed' | 'closed')
- `replied_at` (timestamptz)

## Notes

- Token refresh is handled automatically in the edge function
- RLS policies ensure users can only access their own provider accounts and replies
- The trigger automatically marks emails as replied when a reply is inserted
- Outlook support is stubbed for future implementation


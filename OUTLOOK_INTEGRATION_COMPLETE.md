# Outlook Integration - Complete

This document summarizes the Outlook email integration implementation for SmartSend AI.

## What Was Implemented

### 1. Database Migration
- **File**: `supabase/migrations/20251031_outlook_provider.sql`
- Added Outlook support to `connected_accounts` provider check constraint
- Created index for Outlook polling optimization
- Kept existing RLS/workspace policies intact

### 2. NPM Packages
Added to `package.json`:
- `@microsoft/microsoft-graph-client@^3.0.7` - Microsoft Graph API client
- `@azure/identity@^4.8.0` - Azure authentication
- `isomorphic-fetch@^3.0.0` - Fetch polyfill for Node.js

### 3. Outlook Helper Library
**File**: `src/lib/outlook.ts`
- `refreshMsToken()` - Refresh Microsoft OAuth tokens
- `ensureAccessToken()` - Auto-refresh tokens if expired
- `buildMime()` - Build MIME format emails

### 4. OAuth Routes
**Files**:
- `src/app/api/auth/outlook/authorize/route.ts` - Initiates OAuth flow
- `src/app/api/auth/outlook/callback/route.ts` - Handles OAuth callback

Features:
- Microsoft Azure AD OAuth 2.0 flow
- Scopes: offline_access, Mail.Read, Mail.Send, Mail.ReadWrite
- Stores tokens in `connected_accounts` table
- Workspace-aware connection management

### 5. Outbox Sender (Multi-Provider)
**File**: `src/app/api/outbox/send/route.ts`
- Updated to support both Gmail and Outlook providers
- Provider-specific sending logic:
  - **Gmail**: Uses Gmail API with MIME encoding
  - **Outlook**: Uses Microsoft Graph API `/me/sendMail` endpoint
- Auto token refresh for both providers
- Thread management for replies
- Provider message ID tracking

### 6. Outlook Polling Route
**File**: `src/app/api/providers/outlook/poll/route.ts`
- Polls last 24 hours of inbound emails
- Maps Microsoft `conversationId` to internal `thread_id`
- Creates `email_messages` and `provider_messages` records
- Skips self-messages and duplicates
- Lead matching by email address

### 7. UI Integration
**File**: `src/app/settings/integrations/page.tsx`
- Added Outlook connect button
- Connection status display
- Disconnect functionality
- Separate state management for Gmail and Outlook

## Environment Variables Needed

Add to your `.env` file:

```env
# Microsoft/Azure AD OAuth
MS_CLIENT_ID=your_microsoft_app_client_id
MS_CLIENT_SECRET=your_microsoft_app_client_secret
MS_TENANT_ID=common  # or your specific tenant ID
MS_REDIRECT_URI=https://yourdomain.com/api/auth/outlook/callback
```

## Setup Instructions

### 1. Azure AD App Registration
1. Go to https://portal.azure.com
2. Navigate to "Azure Active Directory" > "App registrations"
3. Create a new registration
4. Set redirect URI to your callback URL
5. Add API permissions: `Mail.Read`, `Mail.Send`, `Mail.ReadWrite`, `offline_access`
6. Create a client secret
7. Copy Client ID and Client Secret to `.env`

### 2. Database Migration
Run the migration in Supabase:
```bash
supabase db push
```
Or apply manually via SQL editor.

### 3. Install Dependencies
```bash
npm install
```

### 4. Test the Integration
1. Go to `/settings/integrations`
2. Click "Connect Outlook"
3. Complete OAuth flow
4. Verify connection status

## Features

✅ **Send emails via Outlook**
- Native Graph API sending
- Automatic token refresh
- Thread-aware replies

✅ **Receive emails from Outlook**
- Polling every 2-5 minutes (same as Gmail)
- AI reply detection works automatically
- Auto-flip leads to "Replied" status

✅ **Multi-provider support**
- Send via Gmail OR Outlook
- Unified outbox system
- Same lead management

✅ **Enterprise-ready**
- Workspace-scoped connections
- Secure token storage
- RLS policies enforced

## Architecture

```
User clicks "Connect Outlook"
  ↓
/api/auth/outlook/authorize
  ↓
Microsoft OAuth flow
  ↓
/api/auth/outlook/callback
  ↓
Store tokens in connected_accounts
  ↓
User can now send/receive emails
```

## Sending Flow

```
Campaign creates outbox jobs
  ↓
/api/outbox/send picks up job
  ↓
Checks provider (Gmail/Outlook)
  ↓
Gmail: Gmail API
Outlook: Graph API /me/sendMail
  ↓
Update provider_messages & email_messages
  ↓
Job marked as "sent"
```

## Receiving Flow

```
Cron triggers /api/providers/outlook/poll
  ↓
Fetches last 24h from Graph API
  ↓
Maps to existing leads
  ↓
Creates email_messages & provider_messages
  ↓
AI reply detection runs (existing system)
  ↓
Lead status updates to "Replied"
```

## Next Steps

1. **Setup cron job** for Outlook polling:
   ```bash
   # Every 5 minutes
   */5 * * * * curl -X POST https://yourdomain.com/api/providers/outlook/poll
   ```

2. **Test end-to-end**:
   - Send test email via Outlook
   - Receive reply via Outlook
   - Verify AI detection works

3. **Monitor**:
   - Check token refresh logs
   - Watch for Graph API rate limits
   - Verify deliverability

## Troubleshooting

### Token refresh fails
- Check MS_CLIENT_SECRET is correct
- Verify MS_TENANT_ID (use "common" for all tenants)
- Check token expiry in database

### Sending fails
- Verify Mail.Send permission granted
- Check Graph API rate limits
- Review outbox error logs

### Polling doesn't find emails
- Check OAuth scopes include Mail.Read
- Verify conversationId mapping
- Check timezone for 24h window

## Notes

- Outlook integration mirrors Gmail architecture
- Same `connected_accounts`, `outbox`, `provider_messages` tables
- Compatible with existing AI reply detection
- No changes needed to frontend campaign flows
- Works alongside Gmail (can use both providers)

## Result

🎉 **SmartSend AI now supports both Gmail AND Outlook!**

Users can:
- Connect either or both providers
- Send emails from any connected account
- Receive replies in unified inbox
- Auto-detect AI replies from both sources
- Use same campaign/compose flows

Perfect for SMBs using mixed email stacks! 🚀


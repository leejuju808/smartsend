# Gmail OAuth Quick Replies Implementation

Complete Gmail OAuth integration for sending in-thread replies via Gmail API.

## What Was Built

### 1. Database Schema
- **Migration**: `supabase/migrations/20250203000000_oauth_connections.sql`
- New `oauth_connections` table to store OAuth tokens per user
- Row-level security policies for user isolation
- Auto-refresh timestamp trigger

### 2. Environment Variables
Added to `env.template`:
```bash
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret  
GOOGLE_REDIRECT_URI=http://localhost:3000/api/oauth/google/callback
```

**Note**: The implementation supports both `GOOGLE_*` and `GOOGLE_OAUTH_*` env vars for backward compatibility.

### 3. OAuth Flow
- **Start Route**: `src/app/api/oauth/google/start/route.ts`
  - Redirects to Google OAuth consent screen
  - Requests `gmail.send` and `gmail.readonly` scopes
  - Ensures offline access (refresh token)
  
- **Callback Route**: `src/app/api/oauth/google/callback/route.ts`
  - Exchanges authorization code for tokens
  - Fetches Gmail email address
  - Stores tokens in `oauth_connections` table
  - Redirects back to integrations page

### 4. Token Management
- **Utility**: `src/lib/google/ensureToken.ts`
  - `getGmailAccessToken()` function
  - Auto-refreshes expired tokens
  - Returns fresh access token + email
  - Throws error if Gmail not connected

### 5. Gmail Send
- **Utility**: `src/lib/google/sendGmailReply.ts`
  - `sendGmailReply()` function
  - Builds RFC822 email message
  - Base64URL encodes for Gmail API
  - Sends via Gmail API with threadId for in-thread replies

### 6. Quick Reply API
- **Route**: `src/app/api/send-quick-reply/route.ts`
  - Fetches lead information
  - Gets valid Gmail access token
  - Sends reply in-thread via Gmail API
  - Returns success/error

### 7. UI Components
- **Integrations Page**: `src/app/settings/integrations/page.tsx`
  - Updated to check `oauth_connections` table
  - Shows Gmail connection status
  - Connect/disconnect flow
  - Link to OAuth start flow

- **SmartReplyPanel**: `src/components/replies/SmartReplyPanel.tsx`
  - Checks Gmail connection status on load
  - Disables Send button when not connected
  - Shows warning banner with Connect link
  - Redirects to integrations page to connect

## How It Works

### User Flow
1. User goes to Settings → Integrations
2. Clicks "Connect Gmail"
3. Redirected to Google OAuth consent screen
4. Grants Gmail.send + Gmail.readonly scopes
5. Callback stores tokens in `oauth_connections` table
6. User sees "Connected ✅" status

### Reply Flow
1. User opens a reply in inbox
2. SmartReplyPanel checks `oauth_connections` table
3. If connected, shows "Generate" and "Send" buttons
4. If not connected, shows warning + Connect button
5. On Send, API calls `getGmailAccessToken()`
6. Token auto-refreshes if expired
7. Email sent via Gmail API in-thread
8. Reply appears in Gmail thread

### Token Refresh
- Access tokens expire after 1 hour
- `getGmailAccessToken()` checks expiry
- If expired, calls Google refresh token endpoint
- Updates `oauth_connections` with new token
- Returns fresh access token
- Zero user friction

## Security

- **RLS Policies**: Users can only see/manage their own OAuth tokens
- **Tokens Stored**: Access token, refresh token, expiry time
- **Scope**: Minimal permissions (send + readonly)
- **Auto-Refresh**: Prevents token expiry issues
- **Server-Side**: All OAuth operations on server (no client exposure)

## Testing

1. **Apply Migration**:
   ```bash
   supabase db push
   ```

2. **Set Environment Variables**:
   ```bash
   # Add to .env.local
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REDIRECT_URI=http://localhost:3000/api/oauth/google/callback
   ```

3. **Connect Gmail**:
   - Go to `/settings/integrations`
   - Click "Connect Gmail"
   - Grant permissions

4. **Send Quick Reply**:
   - Open reply in inbox
   - Click "Generate" to create draft
   - Click "Send"
   - Verify email appears in Gmail thread

5. **Test Auto-Refresh**:
   - Wait 1 hour
   - Send another reply
   - Verify it still works (token auto-refreshed)

## Next Steps

- [ ] Add Outlook OAuth support (similar flow)
- [ ] Fetch original subject from thread
- [ ] Add tracking pixels to outbound replies
- [ ] Click redirect service for links
- [ ] Scheduler reliability improvements

## Files Changed

### New Files
- `supabase/migrations/20250203000000_oauth_connections.sql`
- `src/lib/google/ensureToken.ts`
- `src/lib/google/sendGmailReply.ts`

### Modified Files
- `env.template` - Added Google OAuth vars
- `src/app/api/oauth/google/start/route.ts` - Simplified OAuth flow
- `src/app/api/oauth/google/callback/route.ts` - Use oauth_connections table
- `src/app/api/send-quick-reply/route.ts` - Implement Gmail send
- `src/app/settings/integrations/page.tsx` - Check oauth_connections
- `src/components/replies/SmartReplyPanel.tsx` - Add connection check

## Success Criteria ✅

- ✅ OAuth tokens stored securely
- ✅ Auto token refresh works
- ✅ In-thread replies via Gmail API
- ✅ UI gates on connection status
- ✅ Zero user friction
- ✅ Proper error handling
- ✅ RLS policies enforced


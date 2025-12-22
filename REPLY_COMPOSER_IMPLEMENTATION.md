# SmartSend — Reply Composer (Gmail + Outlook) Implementation Summary

## Overview
Implemented a complete reply composer system that sends replies via Gmail and Outlook OAuth accounts and logs outbound messages in the `email_messages` table.

## Components Implemented

### 1. Database Schema ✅
- **email_accounts table**: Already exists with proper RLS policies
  - Stores OAuth tokens for Gmail and Outlook
  - Supports token refresh with `expires_at` tracking
  - Located at: `supabase/migrations/20250125000000_email_accounts.sql`

- **email_messages table**: Added direction column
  - Migration: `supabase/migrations/20250131000001_add_direction_to_email_messages.sql`
  - New column: `direction` (default: 'out') for tracking outbound/inbound
  - Index: `idx_email_messages_direction`

### 2. API Route: `/api/inbox/send` ✅
**File**: `src/app/api/inbox/send/route.ts`

**Features**:
- **Token Refresh**: Automatic refresh for both Gmail and Outlook tokens
- **Gmail Support**: 
  - RFC 2822 raw message construction
  - Thread support via `threadId` parameter
  - Base64URL encoding
- **Outlook Support**: 
  - Microsoft Graph API integration
  - JSON payload construction
  - Conversation-based threading (future enhancement)
- **SMTP Fallback**: Falls back to mailboxes table for non-OAuth accounts
- **Logging**: 
  - Inserts into `inbox_messages` for thread continuity
  - Inserts into `email_messages` with `direction='out'` for campaign tracking
  - Updates thread `last_message_at`

**Token Refresh Helpers**:
```typescript
refreshGmailToken(refreshToken: string)
refreshOutlookToken(refreshToken: string)
```

**Gmail RFC 2822 Builder**:
```typescript
buildRFC2822({ from, to, subject, html })
```

### 3. UI Integration ✅
**File**: `src/app/dashboard/inbox/[id]/page.tsx`

**Updates**:
- Modified `sendReply()` function to use new `/api/inbox/send` endpoint
- Extracts contact email from thread data structure
- Sends both `bodyText` and `bodyHtml` for better formatting
- Proper error handling with user feedback
- Auto-reloads thread after successful send

## API Contract

### Request (POST /api/inbox/send)
```json
{
  "threadId": "uuid",
  "to": "recipient@example.com",
  "subject": "Re: Original Subject",
  "bodyText": "Reply text",
  "bodyHtml": "<p>Reply HTML</p>",
  "threadId_provider": "optional-gmail-thread-id",
  "replyToMessageId": "optional-message-id"
}
```

### Response
```json
{
  "ok": true,
  "messageId": "provider-message-id",
  "threadId": "provider-thread-id"
}
```

## Security Notes

⚠️ **Production Considerations**:
1. **User Authentication**: Currently uses Service Role for brevity. In production:
   - Implement proper session-based auth
   - Derive `userId` from server-side session
   - Use RLS-constrained user-scoped Supabase client
   - Add request validation middleware

2. **Token Storage**: OAuth tokens are stored in `email_accounts` table
   - Consider encryption at rest for production
   - Implement token rotation policies

3. **RLS Policies**: Existing RLS policies enforce:
   - Users can only access their own email accounts
   - Service role has full access for server functions

## Provider-Specific Details

### Gmail
- **Scopes**: `https://www.googleapis.com/auth/gmail.send` (plus read scopes if ingesting mail)
- **Threading**: Pass `threadId` to Gmail API for proper threading
- **Reply Headers**: Automatically handled by Gmail when `threadId` is provided

### Outlook
- **Scopes**: `Mail.Send` (plus `Mail.Read` if needed)
- **Threading**: Currently uses `sendMail` endpoint (simple)
- **Future Enhancement**: Use `/me/messages/{id}/reply` or `replyAll` for proper threading
- **Thread IDs**: Use `conversationId` for thread tracking

## OAuth Setup Requirements

### Environment Variables
```bash
# Gmail
GOOGLE_CLIENT_ID=your_gmail_client_id
GOOGLE_CLIENT_SECRET=your_gmail_client_secret
GOOGLE_OAUTH_REDIRECT_URL=https://yourdomain.com/oauth/google/callback

# Outlook
MICROSOFT_CLIENT_ID=your_microsoft_client_id
MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret
MICROSOFT_OAUTH_REDIRECT_URL=https://yourdomain.com/oauth/outlook/callback
```

## Testing Checklist

- [ ] Connect Gmail OAuth account
- [ ] Connect Outlook OAuth account  
- [ ] Send reply via Gmail from inbox thread
- [ ] Send reply via Outlook from inbox thread
- [ ] Verify token refresh works (wait for expiration)
- [ ] Check `email_messages` table for `direction='out'` entries
- [ ] Verify thread continuity in inbox UI
- [ ] Test SMTP fallback when OAuth not connected

## Next Enhancements

1. **Rich-Text Editor**: 
   - Add WYSIWYG editor with formatting
   - Support for images and attachments
   
2. **Quick Templates**:
   - "Book a call" template
   - "Send calendar link" template
   - Custom templates per campaign

3. **SLA Timers**:
   - Track response time
   - Add labels (Important, Follow Up, Closed)
   - Auto-assign based on rules

4. **Team Collaboration**:
   - Assign threads to teammates
   - Add internal notes
   - @mentions in replies

5. **Outlook Advanced Threading**:
   - Implement `/me/messages/{id}/reply` endpoint
   - Store `internetMessageId` for proper threading
   - Support `replyAll` functionality

## Files Modified

1. `src/app/api/inbox/send/route.ts` - Main API endpoint
2. `src/app/dashboard/inbox/[id]/page.tsx` - UI integration
3. `supabase/migrations/20250131000001_add_direction_to_email_messages.sql` - Schema update
4. `REPLY_COMPOSER_IMPLEMENTATION.md` - This documentation

## References

- Gmail API: https://developers.google.com/gmail/api/reference/rest
- Microsoft Graph API: https://learn.microsoft.com/en-us/graph/api/user-sendmail
- RFC 2822: https://www.rfc-editor.org/rfc/rfc2822.txt


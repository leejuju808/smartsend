# Replies Inbox Implementation

This document outlines the complete implementation of the Replies Inbox system for SmartSend AI.

## Overview

The Replies Inbox system provides a Gmail-like interface for managing email conversations with leads. It includes:

- **Thread-based UI**: Three-pane layout with thread list, messages, and lead info
- **Real-time updates**: Messages update automatically via Supabase Realtime
- **Search & pagination**: Find conversations quickly
- **Mark as read**: Automatic read status management
- **Send replies**: In-app reply composer with optimistic UI

## File Structure

### Database Migration

**File**: `supabase/migrations/20251031_replies_inbox_primitives.sql`

Creates:
1. **email_messages table**: Stores all messages (inbound/outbound)
   - Fields: id, thread_id, lead_id, campaign_id, direction, subject, body_text, body_html, sent_at, provider_message_id, error, is_read, created_at
   - Indexes on thread_id, lead_id, and is_read
2. **inbox_threads view**: Materialized view for fast thread list
   - Aggregates latest message, unread count, lead info
   - Ordered by last activity
3. **RLS policies**: Workspace-based security
   - Users can only see messages for leads in their workspaces
4. **Realtime**: Enabled for live updates

### Type Definitions

**File**: `src/lib/supabase/inbox-types.ts`

Exports:
- `ThreadRow`: Thread list item type
- `EmailMessage`: Individual message type

### Query Functions

**File**: `src/lib/supabase/inbox-queries.ts`

Functions:
- `fetchThreads(opts)`: Get paginated thread list with optional search
- `fetchMessages(threadId)`: Get all messages in a thread
- `markThreadRead(threadId)`: Mark thread as read
- `sendReply(input)`: Send a new reply

### API Routes

**Files**: 
- `src/app/api/replies/mark-read/route.ts`
- `src/app/api/replies/send-inbox/route.ts`

Endpoints:
- `POST /api/replies/mark-read`: Mark all inbound messages in thread as read
- `POST /api/replies/send-inbox`: Insert outbound message (ready for queue processing)

### UI Components

**Files**:
- `src/app/(dashboard)/replies-inbox/page.tsx`: Main page wrapper
- `src/components/replies/RepliesInbox.tsx`: Main inbox component with state management
- `src/components/replies/ThreadList.tsx`: Left pane thread list
- `src/components/replies/MessagePane.tsx`: Middle pane message view + composer

### Component Responsibilities

#### RepliesInbox
- Manages search, pagination, selected thread state
- Handles realtime subscriptions
- Orchestrates thread loading and read marking
- Optimistic UI for sending

#### ThreadList
- Displays searchable, paginated thread list
- Shows unread badges
- Handles thread selection

#### MessagePane
- Displays message history
- Provides reply composer
- Auto-scrolls to latest message

## Data Flow

### Loading Threads
1. User opens page → `loadThreads()` called
2. `fetchThreads()` queries `inbox_threads` view
3. Results displayed in ThreadList

### Selecting Thread
1. User clicks thread → `onSelectThread()` called
2. `markThreadRead()` API called to mark all inbound as read
3. `loadMessages()` fetches full thread
4. Thread count updates via `loadThreads()`

### Sending Reply
1. User types & clicks Send → `onSend()` called
2. Optimistic message added to UI immediately
3. `sendReply()` API inserts record
4. On success: message stays
5. On failure: optimistic message rolled back

### Realtime Updates
1. Supabase broadcast received for `email_messages` table
2. If current thread updated: reload messages
3. Always reload thread list to reflect new ordering/unreads

## RLS Security

All access is scoped by workspace membership:
- Messages inherit workspace from leads table
- Policies check `workspace_members` for user access
- Service role key used in API routes for write operations

## Next Steps

### Immediate
1. Run migration: `supabase migration up`
2. Add navigation link to `/replies-inbox`
3. Test with sample data

### Future Enhancements
1. **Background sender**: Edge Function to process outbound messages
2. **Rich text**: HTML rendering in MessagePane
3. **Attachments**: Display inline images/files
4. **Thread actions**: Archive, assign, tags
5. **Push notifications**: Desktop/mobile alerts
6. **Smart compose**: AI draft suggestions
7. **Keyboard shortcuts**: Vim-like navigation

## Environment Variables

Required (already in place):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Testing

### Manual Test Plan

1. **Setup**:
   ```sql
   -- Insert test lead
   INSERT INTO leads (workspace_id, email, first_name, last_name, company)
   VALUES ('<workspace-id>', 'test@example.com', 'Test', 'User', 'Test Co');

   -- Insert inbound message
   INSERT INTO email_messages (thread_id, lead_id, direction, subject, body_text)
   VALUES (
     gen_random_uuid(),
     (SELECT id FROM leads WHERE email = 'test@example.com'),
     'in',
     'Test Subject',
     'This is a test message'
   );
   ```

2. **Verify**:
   - Thread appears in list
   - Clicking loads messages
   - Sending reply creates optimistic update
   - Realtime updates work when inserting via SQL

3. **Test Search**: Filter by name/email

4. **Test Pagination**: Navigate through pages

## Known Limitations

- Client-side search (consider Postgres FTS for large datasets)
- No draft saving (yet)
- No message threading logic (assumes correct thread_id)
- Basic HTML rendering (no link/image handling)

## References

- Supabase Realtime: https://supabase.com/docs/guides/realtime
- Supabase RLS: https://supabase.com/docs/guides/auth/row-level-security
- Supabase Migrations: https://supabase.com/docs/guides/cli/local-development#database-migrations

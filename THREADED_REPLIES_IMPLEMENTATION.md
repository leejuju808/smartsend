# Threaded Replies Implementation

This document summarizes the threaded replies system implementation for SmartSend AI.

## Overview

The threaded replies system groups email replies by normalized subject line and lead, creating a thread-like experience similar to Gmail. This allows users to see the full conversation history and reply within context.

## Components

### 1. Database Schema

**Migration: `supabase/migrations/20250102000000_threads_and_replies_wiring.sql`**
- Creates `threads` table with unique index on (lead_id, lower(subject))
- Adds `thread_id`, `raw_body`, and `from_email` columns to existing `replies` table
- Sets up RLS policies for both tables

**Migration: `supabase/migrations/20250102000001_thread_rpc_functions.sql`**
- Adds RPC functions:
  - `inc_unread_for_thread(p_thread_id uuid)`: Increments unread count
  - `mark_thread_read(p_thread_id uuid)`: Marks all replies as read and resets unread count
- Adds `is_read`, `body`, and `is_reply` columns to `replies` table
- Creates index for efficient read/unread lookups

### 2. Utility Functions

**File: `src/lib/threadUtils.ts`**

Three main functions:

- `normalizeSubject(s)`: Removes "Re:" and "Fwd:" prefixes from subjects
- `trimQuotedEmail(txt)`: Strips quoted content, headers, and cleans up whitespace
- `upsertThreadAndInsertReply({ lead_id, campaign_id, subject, rawBody, fromEmail, supabase })`: Main ingestion function that:
  1. Normalizes the subject
  2. Trims quoted text from body
  3. Finds or creates a thread based on lead_id and normalized subject
  4. Inserts the reply with proper threading
  5. Increments unread count

### 3. React Hook

**File: `src/hooks/useThreads.ts`**

Custom hook that:
- Fetches thread list with lead information
- Supports filtering by campaign_id
- Provides realtime updates via Supabase subscriptions
- Returns `{ rows, loading, refetch }`

### 4. UI Components

**File: `src/app/dashboard/replies-threads/page.tsx`**

Thread-focused replies inbox that:
- Displays list of threads with unread badges
- Shows last message snippet and timestamp
- Opens thread detail in a Sheet (side panel)
- Includes inline composer for replies
- Calls `mark_thread_read` when thread is opened
- Auto-updates via realtime subscriptions

### 5. Gmail Send API

**File: `src/app/api/gmail/send/route.ts`**

API route for sending email replies that:
- Resolves thread and lead information
- Gets authenticated Gmail account
- Refreshes OAuth token if needed
- Sends via Gmail API with proper formatting
- Inserts outbound message echo into replies table
- Updates thread metadata (snippet, timestamp)

## Data Flow

### Inbound Reply Flow

1. **Gmail Poller** (existing `supabase/functions/gmail-poller/index.ts`) fetches new messages
2. Forward to **reply-detector** or other ingestion endpoint
3. Call `upsertThreadAndInsertReply()` from `threadUtils.ts`:
   - Normalize subject
   - Trim quoted text
   - Find/create thread
   - Insert reply
   - Increment unread count
4. Thread appears in UI with realtime update

### Outbound Reply Flow

1. User opens thread in UI (`/dashboard/replies-threads`)
2. Types message and clicks "Send"
3. Frontend calls `POST /api/gmail/send` with `{ thread_id, body }`
4. API:
   - Gets thread and Gmail credentials
   - Sends via Gmail API
   - Inserts echo to replies table
   - Updates thread metadata
5. Thread refreshes via realtime

## Integration Points

### Existing System Integration

To fully integrate with your existing reply ingestion, update your ingestion points to use `upsertThreadAndInsertReply`:

```typescript
import { upsertThreadAndInsertReply } from "@/lib/threadUtils";

// In your Gmail poller or webhook handler:
await upsertThreadAndInsertReply({
  lead_id: lead.id,
  campaign_id: campaignId || null,
  subject: subject,
  rawBody: bodyText || bodyHtml,
  fromEmail: fromEmail,
  supabase: supabaseAdmin,
});
```

### Key Integration Files

- **Gmail Webhook**: `src/app/api/gmail/push/route.ts`
- **Reply Webhook**: `src/app/api/reply-webhook/route.ts`
- **Inbound Email**: `src/app/api/inbound/reply/route.ts`

Update these to call `upsertThreadAndInsertReply` instead of direct inserts.

## Database Tables

### threads

```sql
create table threads (
  id uuid primary key,
  lead_id uuid not null references leads(id),
  campaign_id uuid references campaigns(id),
  subject text,
  last_message_snippet text,
  last_message_at timestamptz not null,
  unread_count int not null default 0,
  created_at timestamptz default now(),
  unique(lead_id, lower(subject))
);
```

### replies

Columns added for threading:
- `thread_id uuid references threads(id)`
- `raw_body text` - Full body before trimming
- `from_email text` - Normalized sender
- `is_read boolean` - Read status
- `body text` - Trimmed body
- `is_reply boolean` - Whether this is a reply

## Testing Checklist

- [ ] Run database migrations
- [ ] Connect Gmail account
- [ ] Send test campaign email
- [ ] Receive reply to test email
- [ ] Verify thread appears in `/dashboard/replies-threads`
- [ ] Open thread and verify unread count resets
- [ ] Send reply from within thread
- [ ] Verify outbound echo appears in replies
- [ ] Test subject normalization (Re: Fwd: etc)
- [ ] Test quote trimming
- [ ] Verify realtime updates work

## Next Steps

1. **Integrate with existing ingestion**: Update your current reply detection/polling to use `upsertThreadAndInsertReply`
2. **Add message history view**: Load and display actual messages in the thread detail sheet
3. **Add attachments support**: Handle attachments in replies
4. **Add AI reply suggestions**: Integrate with your AI to suggest responses
5. **Add thread search**: Allow filtering/searching across threads
6. **Add thread templates**: Allow pre-written responses

## Notes

- Subject normalization removes "Re:" and "Fwd:" prefixes to group variations together
- Quoted text is trimmed to show only the new content
- Unread counts are thread-level, not message-level
- Outbound messages are echoed into replies table for complete history
- RLS policies ensure users only see their own threads and replies

## Related Files

- `supabase/migrations/20250102000000_threads_and_replies_wiring.sql`
- `supabase/migrations/20250102000001_thread_rpc_functions.sql`
- `src/lib/threadUtils.ts`
- `src/hooks/useThreads.ts`
- `src/app/dashboard/replies-threads/page.tsx`
- `src/app/api/gmail/send/route.ts`
- `src/lib/mime.ts` (for RFC822 message building)


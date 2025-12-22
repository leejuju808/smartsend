# Threaded View + Reply Composer Implementation

## Overview

A minimal, org-scoped threading system for managing email conversations with leads. This slice provides a clean inbox view of threads and a reply composer.

## What's Implemented

### 1. Database Schema ✅

**Migration**: `supabase/migrations/20250110001000_threaded_view_reply_composer.sql`

Two new tables:

#### `threads_new`
- Org-scoped conversation threads
- Links to campaigns and leads (optional)
- Tracks `last_message_at`, `subject`, and `status` (open/replied/archived)
- Indexes for efficient querying

#### `messages_new`
- Individual messages within threads
- Supports both `inbound` and `outbound` directions
- Stores both `body_text` and `body_html`
- Array-based `to_email` for multiple recipients
- Tracks `external_provider` and `external_id` for Gmail/Outlook integration

**RLS Policies:**
- Org-member based access control
- Helper function `is_org_member()` for reusable checks

### 2. React Hooks ✅

**`src/hooks/useThreadsNew.ts`**
- Fetches threads for the current org
- Supports email search filtering
- Real-time updates via Supabase subscriptions
- Returns `{ threads, loading }`

**`src/hooks/useThreadNew.ts`**
- Fetches messages for a specific thread
- Real-time message insertion updates
- Returns `{ messages, loading }`

### 3. API Route ✅

**`src/app/api/replies-new/send/route.ts`**
- Sends replies as outbound messages
- Updates thread `last_message_at` and `status`
- Validates org membership via RLS
- Ready for provider integration (Gmail/Outlook)

### 4. UI Components ✅

**`src/components/replies-new/MessageBubble.tsx`**
- Displays individual messages
- Different styling for inbound vs outbound
- Supports HTML rendering with fallback to text
- Shows sender and timestamp

**`src/components/replies-new/ReplyBox.tsx`**
- Reply composer with textarea
- Shows from/to addresses
- Sends via API route
- Loading states and error handling

### 5. Pages ✅

**`src/app/dashboard/replies-new/page.tsx`**
- Threads inbox with search
- Lists threads by `last_message_at`
- Shows lead email, subject, and status
- Links to thread detail page

**`src/app/dashboard/replies-new/[threadId]/page.tsx`**
- Thread detail view
- Chronological message list
- Reply composer at bottom
- Action buttons (Mark Open/Replied/Archive)

## Usage

### Access the Inbox

Navigate to `/dashboard/replies-new` to see all threads for your org.

### View a Thread

Click any thread to open the detail view at `/dashboard/replies-new/[threadId]`.

### Send a Reply

1. Open a thread
2. Type your message in the reply box
3. Click "Send"

The message will be:
- Inserted into `messages_new` as `outbound`
- Thread `last_message_at` updated
- Thread `status` set to `replied`

### Search Threads

Use the search input to filter threads by lead email.

### Status Actions

Use the buttons at the bottom to:
- **Mark open**: Set status to `open`
- **Mark replied**: Set status to `replied`
- **Archive**: Set status to `archived`

## Next Steps (Future Slices)

### 1. Provider Send Integration
- Gmail: Store `gmail_thread_id` on threads, call API with thread ID
- Outlook: Store `ms_thread_id`, use Graph API threading
- Queue via Supabase Edge Function

### 2. AI Reply Detection
- Server function to auto-mark threads as `replied` when inbound arrives
- Skip OOO/bounces
- Update `threads_new.status` automatically

### 3. Lead Context Panel
- Right rail showing lead fields, campaign, last open/click
- Notes and tags
- Enrichment data

### 4. Quick Templates
- Slash commands in ReplyBox (`/book`, `/pricing`, `/calendar`)
- Template system for common responses

## Database Migration

To apply this schema, run:

```bash
# Apply migration
supabase migration up
```

Or if using Supabase CLI directly:

```bash
supabase db push
```

## Files Created

```
supabase/migrations/
  └── 20250110001000_threaded_view_reply_composer.sql

src/
  ├── hooks/
  │   ├── useThreadsNew.ts
  │   └── useThreadNew.ts
  ├── app/
  │   ├── api/replies-new/
  │   │   └── send/route.ts
  │   └── dashboard/replies-new/
  │       ├── page.tsx
  │       └── [threadId]/page.tsx
  └── components/replies-new/
      ├── MessageBubble.tsx
      └── ReplyBox.tsx
```

## Testing

1. **Test Database Migration**
   ```bash
   supabase db push
   ```

2. **Test Inbox View**
   - Navigate to `/dashboard/replies-new`
   - Ensure org membership is working

3. **Test Thread Creation**
   - Create a thread via direct DB insert or your webhook system
   - Verify it appears in the inbox

4. **Test Reply Sending**
   - Open a thread
   - Send a reply
   - Verify message appears in thread
   - Verify thread status updates

5. **Test Real-time**
   - Open two browser tabs on the same thread
   - Send a reply from one tab
   - Verify it appears in the other tab instantly

## RLS Security

All access is controlled via Row Level Security (RLS):

- `threads_new`: Only accessible to org members
- `messages_new`: Only accessible to org members
- Helper function `is_org_member()` checks `org_members` table

## Org Integration

This system integrates with your existing org system:
- Uses `public.orgs` and `public.org_members` tables
- All queries filtered by `org_id`
- Works with your existing org switching logic

## Notes

- Tables use `_new` suffix to avoid conflicts with existing tables
- When ready, you can migrate data and rename
- External provider integration (Gmail/Outlook) is TODO
- Currently hardcoded `fromEmail`, replace with user's connected mailbox

## Definition of Done ✅

- ✅ `/dashboard/replies-new` shows all threads (searchable)
- ✅ Clicking a thread opens `/dashboard/replies-new/[threadId]` with chronological messages
- ✅ ReplyBox sends a message (DB) and bumps thread status to replied
- ✅ Real-time updates append new inbound or outbound messages
- ✅ Actions: Mark Open/Replied/Archive

## Support

For issues or questions, refer to:
- Existing org system in `src/lib/org.ts`
- Supabase RLS policies in migration
- Real-time subscriptions in hooks


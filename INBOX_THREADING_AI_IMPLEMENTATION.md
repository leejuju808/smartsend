# Inbox Threading & AI Reply Detection - Implementation Complete

## Overview

This implementation adds email threading, reply detection, and AI classification for Gmail and Outlook providers. The system tracks email threads, detects replies, automatically stops future campaign steps, and classifies inbound messages.

## What Was Implemented

### 1. Database Schema ✅

**File:** `supabase/migrations/20250220000000_inbox_threading_ai_system.sql`

- **`inbox_threads`** table: Tracks email threads with campaign/lead linkage
  - Stores provider thread IDs (Gmail threadId / Outlook conversationId)
  - Tracks `replied_at` and `stopped_by_reply` flags
  - Unique constraint on `(account_id, provider_thread_id)`

- **`inbox_messages`** table: Individual messages within threads
  - Tracks both inbound and outbound messages
  - Stores provider message IDs and reply relationships
  - Includes AI classification fields (`ai_label`, `ai_confidence`, `ai_intent`)

- **`send_logs`** updates: Added `provider_message_id` and `provider_thread_id` columns
  - Indexes for fast lookup by provider IDs

- **Views & Functions:**
  - `v_thread_by_campaign_lead`: Quick lookup view for threads
  - `heuristic_label()`: Simple regex-based labeler (upgradeable to LLM)
  - `classify_recent_inbound()`: RPC to classify unclassified messages

### 2. Send Adapters Updated ✅

**File:** `supabase/functions/send-email/index.ts`

**Gmail:**
- Returns `{ ok: true, provider_message_id: resp.id, provider_thread_id: resp.threadId }`
- Gmail API returns both IDs immediately after send

**Outlook:**
- Fetches most recent sent message after `sendMail` call
- Extracts `internetMessageId` and `conversationId`
- Returns `{ ok: true, provider_message_id, provider_thread_id }`

### 3. Dispatcher Enhanced ✅

**File:** `supabase/functions/dispatch-send/index.ts`

- **Stores provider IDs** in `send_logs` after successful send
- **Creates thread entries** for outbound messages
- **Reply-stop guard**: Checks `stopped_by_reply` before sending
- **Auto-creates `inbox_threads`** and `inbox_messages` entries on send

### 4. Poll Replies Function ✅

**File:** `supabase/functions/poll-replies/index.ts`

- **Gmail polling**: Uses Gmail API to fetch recent inbox messages
  - Filters by `newer_than:7d -from:{account_email}`
  - Extracts HTML, headers, and threading info
  - Links messages to threads via `threadId`

- **Outlook polling**: Uses Microsoft Graph API
  - Filters by `receivedDateTime >= sinceISO`
  - Extracts conversation ID and internet message ID

- **Thread linking**: Automatically finds campaigns via `send_logs`
- **Auto-stops campaigns**: Marks `replied_at`, sets `stopped_by_reply=true`
- **Cancels future queue**: Calls `cancel_future_queue_for_thread()`

### 5. AI Classification ✅

**File:** `supabase/functions/label-replies/index.ts`

- Calls `classify_recent_inbound()` RPC every 10 minutes
- Heuristic-based labeling (upgradeable to LLM):
  - `ooo`: Out of office detection
  - `unsubscribe`: Unsubscribe requests
  - `positive`: Positive engagement signals
  - `negative`: Negative signals
  - `neutral`: Default

### 6. Reply-Stop Guards ✅

**Dispatcher guard** (already implemented):
- Checks `inbox_threads.stopped_by_reply` before sending
- Cancels queue item if thread is stopped

**Scheduler guard** (already in place):
- `enqueue_due_for_campaign` function filters out leads with `stopped_by_reply = true`
- Prevents enqueuing new jobs for replied threads

## Deployment Steps

### 1. Run Database Migration

```sql
-- Run in Supabase SQL Editor
-- File: supabase/migrations/20250220000000_inbox_threading_ai_system.sql
```

### 2. Deploy Edge Functions

```bash
# Deploy poll-replies (runs every 5 minutes)
supabase functions deploy poll-replies --no-verify-jwt

# Deploy label-replies (runs every 10 minutes)
supabase functions deploy label-replies --no-verify-jwt
```

### 3. Set Up Cron Schedules

**In Supabase Dashboard → Edge Functions → Cron:**

1. **poll-replies**: `*/5 * * * *` (every 5 minutes)
2. **label-replies**: `*/10 * * * *` (every 10 minutes)

### 4. Environment Variables

Ensure these are set in Supabase Edge Functions:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_CLIENT_ID` (for Gmail)
- `GOOGLE_CLIENT_SECRET` (for Gmail)
- `MS_CLIENT_ID` (for Outlook)
- `MS_CLIENT_SECRET` (for Outlook)

## How It Works

### Outbound Flow

1. **Campaign enqueues** → `send_queue` created
2. **Dispatcher picks up** → Renders template, checks guards
3. **Sends via provider** → Returns `provider_message_id` and `provider_thread_id`
4. **Logs to `send_logs`** → With provider IDs
5. **Creates thread entry** → `inbox_threads` and `inbox_messages` for outbound

### Inbound Flow

1. **poll-replies runs** → Fetches recent messages from Gmail/Outlook
2. **Finds lead** → Matches by email address
3. **Links to campaign** → Via `send_logs` lookup
4. **Creates/updates thread** → `inbox_threads` upsert
5. **Inserts inbound message** → `inbox_messages` with full content
6. **Marks thread replied** → Sets `replied_at`, `stopped_by_reply=true`
7. **Cancels future queue** → Calls `cancel_future_queue_for_thread()`

### Classification Flow

1. **label-replies runs** → Every 10 minutes
2. **Finds unclassified** → `inbox_messages` where `ai_label IS NULL`
3. **Applies heuristics** → `heuristic_label()` function
4. **Updates message** → Sets `ai_label`, `ai_confidence`, `classified_at`

## Database Functions Used

- `cancel_future_queue_for_thread(p_thread uuid)`: Cancels pending queue items for a thread
- `classify_recent_inbound(p_limit int)`: Classifies unclassified inbound messages
- `heuristic_label(p_html text)`: Simple regex-based labeler

## UI Hooks (To Be Implemented)

The following UI components should be added:

1. **Inbox View**: List `inbox_threads` with last message preview and AI label chips
2. **Campaign Stats**: Show "Replies" count (distinct `inbox_threads` where `replied_at IS NOT NULL`)
3. **Lead Page**: Show full thread history, allow "Resume campaign" button
   - Button flips `stopped_by_reply=false` and optionally schedules follow-up

## Testing

1. **Send an email** via campaign → Verify thread created in `inbox_threads`
2. **Reply to email** externally → Verify `poll-replies` detects it
3. **Check thread** → Verify `replied_at` set, `stopped_by_reply=true`
4. **Try to send** next step → Verify it's canceled by guard
5. **Check classification** → Verify `label-replies` assigns `ai_label`

## Next Steps

1. **Upgrade AI classifier**: Replace `heuristic_label()` with LLM call
2. **Add UI components**: Inbox view, campaign stats, lead thread view
3. **Webhook support**: Add Gmail push notifications for real-time replies
4. **Resume campaign**: Add UI button to flip `stopped_by_reply=false`

## Files Created/Modified

### Created:
- `supabase/migrations/20250220000000_inbox_threading_ai_system.sql`
- `supabase/functions/poll-replies/index.ts`
- `supabase/functions/label-replies/index.ts`
- `INBOX_THREADING_AI_IMPLEMENTATION.md` (this file)

### Modified:
- `supabase/functions/send-email/index.ts` (returns provider IDs)
- `supabase/functions/dispatch-send/index.ts` (stores IDs, creates threads, reply-stop guard)

## Definition of Done ✅

- ✅ Outbound sends store `provider_message_id` / `provider_thread_id`
- ✅ `poll-replies` ingests recent messages for Gmail & Outlook
- ✅ Creates/links threads, inserts inbound messages
- ✅ Thread marked `replied_at`, flips `stopped_by_reply=true`, cancels future queue
- ✅ `classify_recent_inbound` assigns initial `ai_label`/`ai_confidence`
- ✅ Scheduler/Dispatcher both respect reply-stop guards
- ⏳ Basic inbox UI shows threads and AI chips (to be implemented)


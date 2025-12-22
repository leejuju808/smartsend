# Block 19700 — Inbox QA & Edge-Case Guardrails v1

## Summary

This block implements comprehensive QA guardrails for the SmartSend Owner Inbox, making it bulletproof against common email edge cases. The system now handles orphaned replies, mis-threaded messages, duplicates, bounces, and long threads with automatic detection, logging, and resolution workflows.

## What Was Built

### 1. Database Schema Updates

**Migration File:** `supabase/migrations/20250130000001_block19700_inbox_qa_edge_case_guardrails_v1.sql`

#### New Columns in `inbox_messages`:
- `is_orphaned` (boolean) - Marks messages without matching campaign_id, contact_id, or thread_id
- `system_message` (boolean) - Marks bounces, auto-replies, and system messages
- `message_id` (text) - Email Message-ID header for duplicate detection
- `message_hash` (text) - Hash for duplicate detection fallback
- `thread_mismatch_warning` (boolean) - Flags potentially mis-threaded messages
- `body_html` (text) - Stores HTML version for better cleaning

#### New Table: `inbox_qa_logs`
- Logs all QA events (orphan_detected, thread_mismatch_detected, duplicate_blocked, etc.)
- Includes event_type, payload (JSONB), and references to threads/contacts/messages

#### Updated Table: `inbox_threads`
- `message_count` (integer) - Tracks total messages for long thread detection

### 2. Database Functions

- `generate_message_hash()` - Creates hash for duplicate detection
- `check_duplicate_message()` - Checks for duplicate messages by message_id or hash
- `is_system_message()` - Detects bounces, auto-replies, and system messages
- `clean_email_html()` - Comprehensive HTML/email body cleaning
- `detect_thread_mismatch()` - Detects mis-threaded conversations
- `log_qa_event()` - Logs QA events for monitoring

### 3. Enhanced Inbound Email Handler

**File:** `src/app/api/inbound-email/route.ts`

The handler now includes:
1. **System Message Filtering** - Filters out bounces, auto-replies, and system messages
2. **Duplicate Detection** - Prevents duplicate messages using message_id and hash
3. **Orphaned Reply Detection** - Marks messages without campaign/contact matches
4. **Thread Mismatch Detection** - Flags messages that appear mis-threaded
5. **HTML Cleaning** - Uses database function for comprehensive body cleaning
6. **QA Logging** - Logs all QA events for monitoring

### 4. Frontend Components

#### `components/inbox/OrphanedReplyBanner.tsx`
- Shows banner when orphaned replies are detected
- Clicking opens resolution modal

#### `components/inbox/ResolveOrphanedReplyModal.tsx`
- Modal for resolving orphaned replies
- Shows suggested contacts and campaigns based on similarity
- Allows manual assignment to contact, campaign, and thread

#### `components/inbox/ThreadMismatchWarning.tsx`
- Warning component for mis-threaded conversations
- Options to split thread, assign to another contact, or ignore

#### `components/inbox/LongThreadHandler.tsx`
- Handles threads with 50+ messages
- Shows archived message count and "Load earlier messages" button

### 5. API Endpoints

#### `GET /api/inbox/orphaned`
- Returns all orphaned messages

#### `GET /api/inbox/orphaned/[messageId]/suggestions`
- Returns suggested contacts and campaigns for an orphaned message
- Uses email similarity, domain matching, and name matching

#### `POST /api/inbox/orphaned/[messageId]/resolve`
- Resolves an orphaned message by assigning contact, campaign, and thread
- Automatically creates thread if needed
- Re-runs AI classifier

#### `POST /api/inbox/threads/[threadId]/resolve-mismatch`
- Resolves thread mismatches
- Options: split thread, assign to another contact, or ignore

#### `GET /api/inbox/threads/[threadId]/messages`
- Returns messages for a thread with pagination
- Handles long threads (50+ messages) by archiving older ones

## How It Works

### Orphaned Reply Flow

1. **Detection**: When an email arrives without matching campaign_id or contact_id, it's marked as `is_orphaned = true`
2. **Storage**: Message is stored with `campaign_id = null`, `contact_id = null`, `thread_id = null`
3. **Banner**: Frontend shows banner: "⚠️ X replies need attention (unmatched). Click to assign."
4. **Resolution**: Owner clicks banner → Modal opens → Suggestions shown → Owner selects contact/campaign → Message resolved

### Duplicate Prevention Flow

1. **Hash Generation**: Message hash created from from_email + to_email + received_at + body_clean
2. **Check**: Database function checks for existing message_id or hash
3. **Block**: If duplicate found, message is discarded and logged
4. **Log**: Event logged in `inbox_qa_logs` as `duplicate_blocked`

### System Message Filtering Flow

1. **Detection**: Database function checks from_email, subject, and body for system patterns
2. **Filter**: If detected, message is stored with `system_message = true`, `status = 'archived'`
3. **Hidden**: System messages don't appear in main inbox (hidden from owner by default)
4. **Log**: Event logged as `system_message_filtered`

### Thread Mismatch Detection Flow

1. **Check**: When message added to thread, function checks:
   - Different from_email than previous messages
   - Subject deviation (less than 2 common words)
2. **Flag**: If mismatch detected, `thread_mismatch_warning = true`
3. **Warning**: Frontend shows warning icon on thread
4. **Resolution**: Owner can split thread, assign to another contact, or ignore

### Long Thread Handling Flow

1. **Tracking**: Trigger automatically updates `message_count` on thread
2. **Archiving**: For threads with 50+ messages, only show recent 50
3. **UI**: Show "Load earlier messages" button
4. **Pagination**: API supports offset/limit for loading older messages

## Usage Examples

### Display Orphaned Reply Banner

```tsx
import { OrphanedReplyBanner } from "@/components/inbox/OrphanedReplyBanner";

// In your inbox component
const { data } = await supabase
  .from("inbox_messages")
  .select("id", { count: "exact" })
  .eq("is_orphaned", true);

<OrphanedReplyBanner 
  orphanedCount={data?.length || 0}
  onResolve={() => refetchMessages()}
/>
```

### Display Thread Mismatch Warning

```tsx
import { ThreadMismatchWarning } from "@/components/inbox/ThreadMismatchWarning";

// In thread detail component
{thread.thread_mismatch_warning && (
  <ThreadMismatchWarning 
    threadId={thread.id}
    onResolved={() => refetchThread()}
  />
)}
```

### Handle Long Threads

```tsx
import { LongThreadHandler } from "@/components/inbox/LongThreadHandler";

// In thread detail component
<LongThreadHandler
  threadId={thread.id}
  messageCount={thread.message_count}
  onLoadEarlier={async () => {
    // Load older messages
    const res = await fetch(`/api/inbox/threads/${thread.id}/messages?offset=${offset}&include_archived=true`);
    const data = await res.json();
    setMessages([...data.messages, ...messages]);
  }}
/>
```

## Database Queries

### Get Orphaned Messages

```sql
SELECT * FROM inbox_messages 
WHERE is_orphaned = true 
ORDER BY received_at DESC;
```

### Get QA Logs

```sql
SELECT * FROM inbox_qa_logs 
WHERE event_type = 'orphan_detected' 
ORDER BY created_at DESC;
```

### Get System Messages

```sql
SELECT * FROM inbox_messages 
WHERE system_message = true 
ORDER BY received_at DESC;
```

### Get Threads with Mismatch Warnings

```sql
SELECT DISTINCT thread_id 
FROM inbox_messages 
WHERE thread_mismatch_warning = true;
```

## Testing Checklist

- [ ] Orphaned reply detection (send email to unknown campaign)
- [ ] Duplicate prevention (send same email twice)
- [ ] System message filtering (send auto-reply email)
- [ ] Thread mismatch detection (add message with different email to thread)
- [ ] Long thread handling (create thread with 50+ messages)
- [ ] HTML cleaning (send email with broken HTML)
- [ ] QA logging (verify events in inbox_qa_logs)

## Next Steps

1. **AI Re-classification**: After resolving orphaned reply, trigger AI classifier to update intent/score
2. **Bulk Resolution**: Add UI for bulk resolving multiple orphaned replies
3. **Advanced Matching**: Enhance suggestion algorithm with fuzzy matching and ML
4. **Notifications**: Send notifications when orphaned replies are detected
5. **Analytics Dashboard**: Create dashboard showing QA metrics (orphan rate, duplicate rate, etc.)

## Files Created/Modified

### New Files
- `supabase/migrations/20250130000001_block19700_inbox_qa_edge_case_guardrails_v1.sql`
- `components/inbox/OrphanedReplyBanner.tsx`
- `components/inbox/ResolveOrphanedReplyModal.tsx`
- `components/inbox/ThreadMismatchWarning.tsx`
- `components/inbox/LongThreadHandler.tsx`
- `app/api/inbox/orphaned/route.ts`
- `app/api/inbox/orphaned/[messageId]/suggestions/route.ts`
- `app/api/inbox/orphaned/[messageId]/resolve/route.ts`
- `app/api/inbox/threads/[threadId]/resolve-mismatch/route.ts`
- `app/api/inbox/threads/[threadId]/messages/route.ts`

### Modified Files
- `src/app/api/inbound-email/route.ts` - Enhanced with all QA checks

## Notes

- System messages are stored but hidden from main inbox (can be viewed in separate "System Messages" view if needed)
- Orphaned messages still show in inbox but with warning banner
- Thread mismatch warnings are per-message, not per-thread
- Long thread archiving is automatic (no manual action needed)
- All QA events are logged for monitoring and debugging




















































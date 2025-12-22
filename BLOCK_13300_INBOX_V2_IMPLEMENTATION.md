# Block 13300 — SmartSend Inbox v2 Implementation

## Overview

Upgraded the SmartSend Inbox into a clean, threaded conversation view that roofers can use like iMessage — simple, fast, familiar, zero learning curve.

## Features Implemented

### 1. Split-Pane Layout ✅
- **Left Column**: Lead List with filters and thread previews
- **Center Column**: Thread View with iMessage-style bubbles
- **Right Column**: Lead Info Panel with homeowner details, notes, tasks, and timeline

### 2. Lead List Component ✅
- Shows homeowner name, status badge, last reply snippet, timestamp
- Icons for pinned threads, notes, hot replies, suppressed threads
- Filters: All, HOT, New Replies, Follow Up, Warm, Not Interested
- Unread indicators (blue dot, bold name, badge)
- Pinned threads stay at top

### 3. Thread View (iMessage Style) ✅
- Message bubbles:
  - Homeowner = grey bubble
  - Roofer = blue bubble
  - SmartSend automated = light-colored bubble
- Timestamp + delivered/read status under each bubble
- Chronological message display
- Includes emails, replies, auto follow-ups, notes, status updates

### 4. HTML Reply Rendering ✅
- Cleans up HTML emails
- Removes long signatures
- Hides quoted text (expandable)
- Formats paragraphs
- Makes emails readable

### 5. Composer v2 ✅
- Text box at bottom of thread
- Short/Long templates (quick insert)
- AI "Draft Reply" button
- Personalization toggles (ready for future implementation)
- Fast, clean, simple reply interface

### 6. Thread Pinning ✅
- Pin/unpin threads
- Pinned threads stay at top of list
- Visual pin indicator

### 7. Unread Indicators ✅
- Blue dot for unread threads
- Bold name for unread threads
- "New reply" badge
- Unread count display

### 8. Bulk Thread Controls ✅
- Select multiple threads
- Bulk actions:
  - Mark as read/unread
  - Update status (HOT → Follow Up, etc.)
  - Suppress threads
  - Add tags (ready for future implementation)

### 9. Lead Info Panel ✅
- Homeowner Details (name, email, city, tags)
- List names
- Estimated value
- Status dropdown
- Assigned team member (ready for future implementation)
- Notes Section (add/view notes)
- Tasks Section (view tasks)
- Timeline Button → opens full timeline page

### 10. Real-Time Updates ✅
- Polling every 30 seconds for new messages
- Threads update automatically
- New replies jump to top
- HOT badge applied automatically
- Follow-ups paused on reply

### 11. Performance Optimizations ✅
- Pagination (50 threads per page)
- Lazy loading for messages (last 50 initially)
- Caching to prevent duplicate loads
- Lightweight message payloads
- Optimized database queries with indexes

## Database Schema

### New Columns Added to `reply_threads`:
- `pinned` (boolean) - Whether thread is pinned
- `pinned_at` (timestamptz) - When thread was pinned
- `latest_intent` (text) - HOT, WARM, FOLLOW_UP, NOT_INTERESTED, NEW_REPLY, UNCLASSIFIED
- `snippet` (text) - Last message snippet for preview
- `has_notes` (boolean) - Whether lead has notes (auto-updated)
- `suppressed` (boolean) - Whether thread is suppressed

### New Columns Added to `inbox_messages` / `reply_messages`:
- `body_html_cleaned` (text) - Cleaned HTML content
- `has_quoted_text` (boolean) - Whether message has quoted text
- `signature_removed` (boolean) - Whether signature was removed
- `delivered_at` (timestamptz) - Delivery timestamp
- `read_at` (timestamptz) - Read timestamp

### New Database Functions:
- `pin_thread(p_thread_id, p_pinned)` - Pin/unpin a thread
- `mark_thread_read(p_thread_id)` - Mark thread as read
- `update_thread_intent(p_thread_id, p_intent)` - Update thread intent
- `update_thread_has_notes()` - Auto-update has_notes flag

### New View:
- `v_inbox_v2_threads` - Optimized view for inbox thread list with lead info

## API Endpoints

### GET `/api/inbox/v2/threads`
- Returns threads with filters, pagination
- Query params: `filter`, `limit`, `offset`, `campaign_id`
- Returns: `{ threads: Thread[], pagination: { limit, offset, has_more } }`

### GET `/api/inbox/v2/threads/[id]`
- Returns full thread details with messages, notes, tasks
- Returns: `{ thread, lead, campaign, messages, notes, tasks }`

### POST `/api/inbox/v2/pin`
- Pin or unpin a thread
- Body: `{ thread_id, pinned }`

### POST `/api/inbox/v2/mark-read`
- Mark thread(s) as read
- Body: `{ thread_ids: string[] }`

### POST `/api/inbox/v2/send-reply`
- Send a reply from the inbox
- Body: `{ thread_id, subject, body_html, body_text, to_email }`

### POST `/api/inbox/v2/bulk`
- Bulk actions on threads
- Body: `{ thread_ids: string[], action: string, value?: string }`
- Actions: `mark_read`, `mark_unread`, `update_status`, `suppress`, `update_intent`

## Components Created

1. **`components/inbox/v2/LeadList.tsx`** - Left column lead list with filters
2. **`components/inbox/v2/MessageBubble.tsx`** - iMessage-style message bubbles
3. **`components/inbox/v2/LeadInfoPanel.tsx`** - Right column lead info panel
4. **`components/inbox/v2/ComposerV2.tsx`** - Reply composer with templates and AI draft
5. **`components/inbox/v2/BulkControls.tsx`** - Bulk action controls

## Utilities Created

1. **`lib/inbox/html-cleaner.ts`** - HTML email cleaning utility
   - Removes signatures
   - Detects quoted text
   - Formats paragraphs
   - Removes dangerous content

## Main Page

**`app/(app)/inbox-v2/page.tsx`** - Main inbox v2 page with split-pane layout

## Migration File

**`supabase/migrations/20250130000002_block_13300_inbox_v2.sql`** - Database migration for inbox v2 features

## Usage

Navigate to `/inbox-v2` to use the new inbox interface.

## Future Enhancements

1. WebSocket support for real-time updates (currently using polling)
2. File attachments support
3. Advanced search
4. Keyboard shortcuts
5. Mobile responsive design
6. Thread merging
7. Email templates integration
8. AI draft improvements
9. Personalization toggles UI
10. Team member assignment UI

## Testing Checklist

- [ ] Load threads with different filters
- [ ] Select and view thread details
- [ ] Pin/unpin threads
- [ ] Send replies
- [ ] Add notes
- [ ] Update lead status
- [ ] Bulk actions (mark read, update status, suppress)
- [ ] Real-time updates (polling)
- [ ] HTML email rendering
- [ ] Unread indicators
- [ ] Pagination
- [ ] Performance with large thread lists

## Notes

- The implementation uses polling for real-time updates (every 30 seconds)
- WebSocket support can be added later for instant updates
- HTML cleaning is done client-side; server-side cleaning can be added for better performance
- The inbox integrates with existing lead notes and tasks systems
- Status updates sync with the lead_status table
- The migration handles both `account_id` and `workspace_id` schemas for compatibility
- API endpoints support both `inbox_threads` and `reply_threads` tables
- Threads are automatically marked as read when opened
- Notes API endpoint added at `/api/inbox/v2/notes`

## Recent Updates (2025-01-30)

1. ✅ Fixed database migration to handle both `account_id` and `workspace_id` schemas
2. ✅ Added `/api/inbox/v2/notes` endpoint for adding notes to leads
3. ✅ Updated API endpoints to support both `inbox_threads` and `reply_threads` tables
4. ✅ Improved HTML cleaner to better detect and remove quoted text and signatures
5. ✅ Fixed LeadList component props handling
6. ✅ Added automatic mark-as-read when thread is opened
7. ✅ Enhanced view to handle multiple task table schemas


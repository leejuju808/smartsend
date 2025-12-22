# Block 14200 — SmartSend Timeline v2 Implementation

## Overview

Timeline v2 is a comprehensive, chronological timeline system that shows every single event that's ever happened with a homeowner. It provides roofers with complete clarity and becomes SmartSend's single source of truth for each lead.

## Features Implemented

### ✅ 1. Unified Timeline Events Table
- Created `timeline_events` table with all 13 event types:
  - `email_sent` - Email sent events
  - `reply_received` - Homeowner replies
  - `task_created` - Tasks auto-created or manual
  - `task_completed` - Task completions
  - `status_changed` - Status changes (HOT/WARM/COLD)
  - `score_changed` - Lead score changes
  - `tag_added` / `tag_removed` - Tag changes
  - `pipeline_moved` - Pipeline stage movements
  - `enrichment_added` - Enrichment data additions
  - `suppressed` - Suppression/unsubscribe events
  - `campaign_step` - Campaign step triggers
  - `note` - Human notes
  - `storm_event` - Storm context events

### ✅ 2. Automatic Event Logging
- Database triggers automatically log events from:
  - `send_logs` → `email_sent` events
  - `inbox_messages` → `reply_received` events
  - `tasks` → `task_created` / `task_completed` events
  - `contacts` → `score_changed`, `tag_added/removed`, `status_changed`, `pipeline_moved` events
  - `contact_notes` → `note` events
  - `lead_score_events` → aggregated score changes

### ✅ 3. Unified Timeline API
- **Endpoint**: `GET /api/contacts/[id]/activity`
- Aggregates events from:
  - `timeline_events` table (primary source)
  - `contact_activity` table (backward compatibility)
  - `lead_score_events` table
- Supports filtering by:
  - Event types
  - Date ranges (week, month, year, all-time)
  - Pagination with cursors

### ✅ 4. Enhanced Timeline UI Component
- **Location**: `components/contacts/ContactTimeline.tsx`
- Features:
  - All 13 event types with proper icons and colors
  - Date separators (Today, Yesterday, specific dates)
  - Event grouping/compression for repetitive events (e.g., multiple campaign emails)
  - Expandable grouped events
  - Date jump navigation (This week, Last month, This year, All-time)
  - Event type filters
  - Clickable events with selection state
  - Rich event details for each type

### ✅ 5. Event Grouping & Compression
- Groups consecutive similar events (e.g., multiple emails from same campaign)
- Shows as: "Campaign A (3 steps executed)"
- Expandable to see individual events
- Keeps timeline clean and readable

### ✅ 6. Date Navigation
- Quick filters:
  - **This week** - Last 7 days
  - **Last month** - Last 30 days
  - **This year** - Last 365 days
  - **All-time** - All events

### ✅ 7. Event Type Filters
- Filter by:
  - All
  - Emails
  - Replies
  - Tasks
  - Tags
  - Score
  - Pipeline
  - Notes

### ✅ 8. Rich Event Details
Each event type shows relevant information:
- **Email Sent**: Subject, preview, campaign name
- **Reply Received**: Snippet, intent detected, lead score impact
- **Task Created**: Task type, due date, priority, source
- **Task Completed**: Completion reason, completed by
- **Score Changed**: Old score → New score, delta, reason
- **Tag Added/Removed**: Tag name, source (auto/manual)
- **Pipeline Moved**: Old stage → New stage
- **Enrichment Added**: City, ZIP, neighborhood, property type
- **Suppressed**: Reason for suppression
- **Campaign Step**: Step number, template used, wait timer
- **Storm Event**: Storm type, location

## Database Schema

### timeline_events Table
```sql
CREATE TABLE public.timeline_events (
  id uuid PRIMARY KEY,
  contact_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  user_id uuid, -- NULL for system events
  event_type text NOT NULL,
  event_data jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL,
  message_id uuid,
  task_id uuid,
  campaign_id uuid,
  thread_id uuid,
  note_id uuid
);
```

### Indexes
- `idx_timeline_events_contact` - Fast contact timeline queries
- `idx_timeline_events_workspace` - Workspace filtering
- `idx_timeline_events_type` - Event type filtering
- `idx_timeline_events_created_at` - Chronological sorting
- `idx_timeline_events_contact_type_time` - Composite for common queries

## API Usage

### Get Timeline Events
```typescript
GET /api/contacts/{contactId}/activity?types=email_sent,reply_received&dateFilter=month&limit=50&cursor={cursor}
```

**Query Parameters:**
- `types` - Comma-separated event types to filter
- `dateFilter` - "week", "month", "year", or "all"
- `limit` - Number of events to return (default: 50)
- `cursor` - Pagination cursor (format: "timestamp|id")

**Response:**
```json
{
  "events": [
    {
      "id": "uuid",
      "type": "email_sent",
      "createdAt": "2025-02-01T12:00:00Z",
      "title": "Sent Step 1 of Fall Outreach Campaign",
      "body": "Email preview...",
      "meta": {
        "subject": "Subject",
        "campaign_name": "Campaign Name",
        "campaign_id": "uuid"
      },
      "user": {
        "id": "uuid",
        "email": "user@example.com",
        "name": "User Name"
      }
    }
  ],
  "nextCursor": "2025-02-01T12:00:00Z|uuid"
}
```

## Component Usage

```tsx
import { ContactTimeline } from "@/components/contacts/ContactTimeline";
import { useContactTimeline } from "@/lib/hooks/useContactTimeline";

function ContactPage({ contactId }: { contactId: string }) {
  const [filters, setFilters] = useState({ types: [], dateFilter: "all" });
  const { events, loading, hasMore, loadNextPage } = useContactTimeline(contactId, filters);

  return (
    <ContactTimeline
      events={events}
      loading={loading}
      hasMore={hasMore}
      onLoadMore={loadNextPage}
      contactId={contactId}
      onNoteAdded={() => {}}
      onFilterChange={(types, dateFilter) => setFilters({ types, dateFilter })}
    />
  );
}
```

## Helper Functions

### log_timeline_event()
```sql
SELECT public.log_timeline_event(
  p_contact_id := 'uuid',
  p_event_type := 'email_sent',
  p_event_data := '{"subject": "Hello", "campaign_id": "uuid"}'::jsonb,
  p_user_id := 'uuid', -- NULL for system events
  p_message_id := 'uuid', -- Optional
  p_task_id := 'uuid', -- Optional
  p_campaign_id := 'uuid', -- Optional
  p_thread_id := 'uuid', -- Optional
  p_note_id := 'uuid' -- Optional
);
```

## Migration File

- **File**: `supabase/migrations/20250201000001_block14200_timeline_v2.sql`
- Creates `timeline_events` table
- Sets up RLS policies
- Creates helper function `log_timeline_event()`
- Creates triggers for automatic event logging

## Files Modified/Created

### New Files
1. `supabase/migrations/20250201000001_block14200_timeline_v2.sql` - Database migration
2. `BLOCK_14200_TIMELINE_V2_IMPLEMENTATION.md` - This documentation

### Modified Files
1. `app/api/contacts/[id]/activity/route.ts` - Enhanced to aggregate all event sources
2. `components/contacts/ContactTimeline.tsx` - Complete UI overhaul with all event types
3. `lib/hooks/useContactTimeline.ts` - Added date filter support
4. `lib/types/contact.ts` - Added all new event types
5. `app/contacts/[contactId]/page.tsx` - Updated to support date filtering

## Next Steps (Future Enhancements)

1. **Right-Side Context Panel** - Show detailed event information when clicking an event
2. **Multi-User Notes** - Add user names and timestamps to notes
3. **File Attachments** - Support file attachments in notes (v3)
4. **Storm Event Integration** - Connect with storm detection system
5. **Call Notes** - Add call logging functionality
6. **Timeline Export** - Export timeline as PDF or CSV
7. **Real-time Updates** - WebSocket support for live timeline updates
8. **Timeline Search** - Full-text search across timeline events

## Benefits for Roofers

🔥 **1. Total Clarity** - See the entire story of the lead with zero confusion
🔥 **2. Helps Close More Jobs** - See EXACTLY when homeowner interest increased
🔥 **3. No More Digging** - All conversations + actions are in one place
🔥 **4. Timeline Feels Like a Real CRM** - But simplified for contractors
🔥 **5. Great for Office Managers** - Makes handoffs smooth and professional

## Testing Checklist

- [ ] Verify timeline_events table is created
- [ ] Test automatic event logging from triggers
- [ ] Test API endpoint with various filters
- [ ] Test date navigation filters
- [ ] Test event type filters
- [ ] Test event grouping/compression
- [ ] Test pagination
- [ ] Verify all event types display correctly
- [ ] Test event detail rendering
- [ ] Verify RLS policies work correctly

## Notes

- The timeline aggregates from multiple sources for backward compatibility
- Events are automatically logged via database triggers
- The UI component handles grouping and filtering client-side
- Date filters are applied server-side for performance
- All event types are color-coded and have appropriate icons






















































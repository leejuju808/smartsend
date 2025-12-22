# Email Sequences Feature - Implementation Summary

## What Was Implemented

A complete email sequence system that allows multi-step follow-up campaigns with automatic scheduling, business hours support, and auto-pause on replies/unsubscribes.

## Files Created

### 1. Database Migration
- `supabase/migrations/20250127_create_sequences.sql`
  - Creates `sequences`, `sequence_steps`, `sequence_step_attachments`, `sequence_progress` tables
  - Adds `cancel_future_queue()` RPC function
  - Includes indexes and RLS policies

### 2. Core Library Files
- `src/lib/sequences/schedule.ts`
  - `nextSendAt()` function for calculating next send times
  - Handles timezones, business hours, and weekdays
  
- `src/lib/sequences/reply-handler.ts`
  - `handleReplyForSequence()` for auto-pausing sequences on reply

### 3. API Routes
- `src/app/api/sequences/[campaignId]/upsert/route.ts`
  - POST: Create or update sequences and steps
  
- `src/app/api/sequences/[campaignId]/start/route.ts`
  - POST: Start a sequence for a set of leads

### 4. UI Components
- `src/components/SequenceEditor.tsx`
  - React component for creating/editing sequences
  - Add/remove steps, edit content, configure timing

### 5. Worker Updates
- `supabase/functions/queue-dispatcher/index.ts`
  - Added `nextSendAt()` helper function
  - Added `planNextStepFor()` function
  - Integrated auto-scheduling after successful sends

### 6. Auto-Pause Integration
- `src/lib/unsub/utils.ts`
  - Updated `applyGlobalUnsub()` to cancel all future sequence emails
  - Updated `applySequenceUnsub()` to cancel sequence-specific emails
  - Added `cancelFutureQueueForEmail()` helper

### 7. Documentation
- `docs/SEQUENCE_IMPLEMENTATION.md`
  - Complete implementation guide
  - Usage examples, best practices, troubleshooting

## How It Works

### Sequence Flow

1. **Create Sequence**
   - User creates a sequence with multiple steps
   - Each step has subject, body, wait days, and send window
   - Saved via `/api/sequences/[campaignId]/upsert`

2. **Start Sequence**
   - Select leads to enroll
   - Called via `/api/sequences/[campaignId]/start`
   - Enqueues first step immediately

3. **Automatic Sending**
   - Queue dispatcher sends emails in order
   - After each send, `planNextStepFor()` is called
   - Calculates next send time using `nextSendAt()`
   - Enqueues next step at appropriate time

4. **Auto-Pause**
   - On reply: `handleReplyForSequence()` cancels future emails
   - On unsubscribe: `cancel_future_queue` RPC cancels emails
   - Sequence progress status → 'stopped'

### Key Features

- ✅ Multi-step email sequences
- ✅ Configurable wait days between steps
- ✅ Business hours support (timezone-aware)
- ✅ Weekday filtering (Mon-Fri only, etc.)
- ✅ Auto-pause on reply
- ✅ Auto-pause on unsubscribe
- ✅ Per-lead progress tracking
- ✅ Personalization via `{{variables}}`
- ✅ UI component for editing sequences

## Usage Example

```typescript
// 1. Render sequence editor
<SequenceEditor campaignId={campaignId} workspaceId={workspaceId} />

// 2. User creates sequence with steps:
// Step 1: Welcome email (send immediately)
// Step 2: Follow-up (wait 3 days, 9am-5pm weekdays)
// Step 3: Final check-in (wait 7 days)

// 3. Start sequence for leads
await fetch(`/api/sequences/${campaignId}/start`, {
  method: 'POST',
  body: JSON.stringify({
    workspaceId,
    leadIds: ['lead1', 'lead2', 'lead3']
  })
});

// Result:
// - Lead 1 receives Step 1 immediately
// - After 3 days (if weekday 9am-5pm), receives Step 2
// - After 7 more days, receives Step 3
// - If they reply at any point, future steps are cancelled
```

## Configuration

### Send Window
```json
{
  "tz": "America/Los_Angeles",
  "start": "09:00",
  "end": "16:30",
  "weekdays": [1, 2, 3, 4, 5]
}
```

### Wait Days
- Common values: 3, 5, 7 days
- Can be 0 for immediate follow-up

### Personalization Variables
- `{{first_name}}` - First name
- `{{company}}` - Company name
- `{{email}}` - Email address
- Any custom fields

## Database Schema

### sequences
- One per campaign
- Stores name and metadata

### sequence_steps
- Multiple per sequence
- Ordered by `position`
- Contains email content and timing

### sequence_progress
- One per lead per campaign
- Tracks current step and status
- Updated after each send

## Next Steps

To use this feature:

1. Run the migration:
   ```bash
   supabase migration up
   ```

2. Add the editor to your campaign page:
   ```tsx
   import { SequenceEditor } from '@/components/SequenceEditor';
   ```

3. Start sequences via the API or create a UI button that calls `/api/sequences/[campaignId]/start`

## Testing

Test with:
- Creating sequences with different steps
- Starting sequences for test leads
- Verifying emails are enqueued
- Checking timing calculations
- Testing auto-pause on reply/unsubscribe
- Verifying sequence progress updates

## Files Modified

- `supabase/functions/queue-dispatcher/index.ts` - Added sequence scheduling
- `src/lib/unsub/utils.ts` - Added auto-pause on unsubscribe

## Files Created

- Migration: `supabase/migrations/20250127_create_sequences.sql`
- Library: `src/lib/sequences/schedule.ts`, `src/lib/sequences/reply-handler.ts`
- APIs: `src/app/api/sequences/[campaignId]/upsert/route.ts`, `src/app/api/sequences/[campaignId]/start/route.ts`
- UI: `src/components/SequenceEditor.tsx`
- Docs: `docs/SEQUENCE_IMPLEMENTATION.md`, `SEQUENCE_FEATURE_SUMMARY.md`

# Email Sequences Implementation

This document describes the implementation of multi-step email sequences in SmartSend AI.

## Overview

Sequences allow you to send a series of follow-up emails to leads over time, with automatic scheduling based on business hours, weekdays, and delays between steps.

## Architecture

### Database Schema

#### Tables

1. **sequences** - Sequence definitions attached to campaigns
   - `id`, `workspace_id`, `campaign_id`, `name`, `created_by`, `created_at`
   - One sequence per campaign

2. **sequence_steps** - Ordered email steps
   - `id`, `sequence_id`, `position`, `subject`, `body_html`
   - `wait_days` - Days to wait before sending this step
   - `send_window` - JSONB with timezone, hours, and weekdays
   - Unique on `(sequence_id, position)`

3. **sequence_step_attachments** - Optional file attachments
   - `id`, `step_id`, `file_url`

4. **sequence_progress** - Per-lead tracking
   - `id`, `workspace_id`, `campaign_id`, `lead_id`
   - `current_position` - Which step they're on (0 = before step 1)
   - `status` - active, paused, stopped, finished
   - `last_sent_at` - When last step was sent
   - Unique on `(campaign_id, lead_id)`

### Database Functions

- **cancel_future_queue(p_campaign, p_lead)** - Cancels all queued/sending emails for a lead in a campaign

## Components

### 1. Schedule Helper (`src/lib/sequences/schedule.ts`)

The `nextSendAt()` function calculates when to send the next step:
- Takes wait days into account
- Respects business hours (start/end times)
- Only sends on specified weekdays
- Returns an ISO timestamp

### 2. API Endpoints

#### POST `/api/sequences/[campaignId]/upsert`

Create or update a sequence and its steps.

**Request:**
```json
{
  "workspaceId": "uuid",
  "name": "My Sequence",
  "steps": [
    {
      "position": 1,
      "subject": "Welcome!",
      "body_html": "<p>Hi {{first_name}}...</p>",
      "wait_days": 0,
      "send_window": {
        "tz": "America/Los_Angeles",
        "start": "09:00",
        "end": "16:30",
        "weekdays": [1, 2, 3, 4, 5]
      }
    }
  ]
}
```

#### POST `/api/sequences/[campaignId]/start`

Start a sequence for a set of leads.

**Request:**
```json
{
  "workspaceId": "uuid",
  "providerAccountId": "uuid",
  "leadIds": ["uuid1", "uuid2"]
}
```

Enqueues step 1 immediately for all leads.

### 3. Worker Integration (`supabase/functions/queue-dispatcher`)

The queue dispatcher includes:
- `nextSendAt()` helper for timezone-aware scheduling
- `planNextStepFor()` function that:
  - Checks if a sent email is part of a sequence
  - Updates progress to next step
  - Schedules the next step or marks as finished

Called after each successful send:
```typescript
await planNextStepFor(supabase, job).catch((err: any) => {
  console.error("Failed to plan next step:", err);
});
```

### 4. Auto-Pause on Reply/Unsubscribe

**Reply Detection:**
- When a lead replies, call `handleReplyForSequence()`
- This cancels future queued items
- Updates sequence_progress status to 'stopped'

**Unsubscribe:**
- Integrated into `src/lib/unsub/utils.ts`
- Global unsubscribe: cancels all sequences for that email
- Sequence-specific unsubscribe: cancels only that sequence
- Uses `cancel_future_queue` RPC

### 5. UI Component (`src/components/SequenceEditor.tsx`)

React component for creating/editing sequences:
- Add/remove steps
- Edit subject, body, wait days
- Save sequence to database
- Uses `{{variables}}` for personalization

## Usage

### Creating a Sequence

```typescript
import { SequenceEditor } from '@/components/SequenceEditor';

<SequenceEditor 
  campaignId={campaignId} 
  workspaceId={workspaceId}
  onSave={() => console.log('Saved!')}
/>
```

### Starting a Sequence for Leads

```typescript
const response = await fetch(`/api/sequences/${campaignId}/start`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    workspaceId,
    providerAccountId,
    leadIds: ['lead1', 'lead2']
  })
});
```

### Personalization

Use variables in your emails:
- `{{first_name}}` - Lead's first name
- `{{company}}` - Lead's company
- `{{email}}` - Lead's email
- Any custom fields

Example subject: `Hi {{first_name}}, interested in {{company}}?`

## Send Window Configuration

```json
{
  "tz": "America/Los_Angeles",
  "start": "09:00",
  "end": "16:30",
  "weekdays": [1, 2, 3, 4, 5]
}
```

- `tz`: Timezone (IANA format)
- `start/end`: HH:MM format
- `weekdays`: 1=Monday, 7=Sunday

## Status Flow

1. **Queued** - Email is in `email_jobs` table, waiting to be sent
2. **Sent** - Email was successfully sent
3. **Active** - Lead is progressing through sequence
4. **Paused** - Manually paused by user
5. **Stopped** - Auto-paused due to reply/unsubscribe
6. **Finished** - Completed all steps

## Sequence Progress

The system tracks:
- Which step a lead is on (`current_position`)
- Last time an email was sent (`last_sent_at`)
- Overall status (active/paused/stopped/finished)

## Migration

Run the migration to create the tables:
```bash
supabase migration up
```

This creates:
- `sequences` table
- `sequence_steps` table
- `sequence_step_attachments` table
- `sequence_progress` table
- `cancel_future_queue()` RPC function
- All necessary indexes and RLS policies

## Best Practices

1. **Wait Days**: Start with 3 days between steps for good engagement
2. **Business Hours**: Set realistic hours (9am-5pm in your timezone)
3. **Weekdays**: Avoid weekends unless your audience is active then
4. **Step Count**: Keep sequences to 3-5 steps for best results
5. **Personalization**: Always use `{{first_name}}` for better open rates
6. **Subject Lines**: Keep them short and compelling
7. **Unsubscribe**: Always include an unsubscribe link

## Troubleshooting

### Emails not sending

1. Check `email_jobs` table for status
2. Verify sequence_progress status is 'active'
3. Check send_window configuration
4. Ensure lead is not suppressed

### Timing issues

1. Verify timezone in `send_window`
2. Check `wait_days` on step
3. Ensure weekdays include the target day
4. Verify business hours overlap current time

### Auto-pause not working

1. Verify reply detection is running
2. Check unsubscribe handler is called
3. Review `cancel_future_queue` RPC logs
4. Verify sequence_progress is updating

## Future Enhancements

- [ ] A/B testing for sequence steps
- [ ] Conditional branching based on engagement
- [ ] Dynamic wait times based on lead behavior
- [ ] Sequence performance analytics
- [ ] Template library for common sequences
- [ ] Email preview in sequence editor

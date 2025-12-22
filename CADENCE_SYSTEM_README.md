# Cadence System Implementation

Complete email cadence/sequence system for automated follow-ups with business hours, timezones, and reply detection.

## Overview

This system allows you to:
- Create reusable email sequences with multiple steps
- Enroll leads into sequences
- Automatically send emails at specified intervals
- Respect business hours and timezones
- Pause on reply (automatic stop when lead responds)
- Handle weekends and scheduling windows

## Database Schema

### Tables

1. **cadence_sequences** - Reusable sequence templates
   - `name` - Sequence name (e.g., "Discovery 3-step")
   - `owner_user_id` - User who owns the sequence
   - `timezone` - Timezone for scheduling (default: 'America/Los_Angeles')
   - `daily_start` - Local start time (default: '08:30')
   - `daily_end` - Local end time (default: '16:30')
   - `quiet_weekends` - Skip weekends (default: true)

2. **cadence_steps** - Steps within a sequence
   - `sequence_id` - Parent sequence
   - `step_index` - Order within sequence (0..N)
   - `wait_days` - Days to wait after previous step
   - `subject` - Email subject
   - `body` - Email body (supports {{first_name}}, {{company}}, etc.)

3. **cadence_enrollments** - Lead enrollments
   - `sequence_id` - Which sequence
   - `lead_email` - Recipient email
   - `lead_first_name` - For personalization
   - `lead_company` - For personalization
   - `campaign_id` - Optional link to campaign
   - `current_step` - Next step to send
   - `status` - active|paused|completed|cancelled
   - `replied` - Has lead replied?
   - `reply_type` - Type of reply detected

4. **cadence_send_queue** - Outbound send queue
   - `enrollment_id` - Link to enrollment
   - `step_index` - Which step to send
   - `to_email`, `subject`, `body` - Email content
   - `scheduled_at` - When to send
   - `sent_at` - When actually sent
   - `attempts` - Retry counter
   - `locked_at` - Lock for processing

### Functions & Triggers

- **mark_cadence_enrollment_replied()** - Auto-completes enrollment when reply detected
- **lock_due_cadence_queue_items()** - Locks due queue items for processing
- **Trigger**: `trg_cadence_enroll_reply` on `campaign_logs` updates enrollment on reply

## API Endpoints

### 1. POST /api/cadence/enroll

Enroll a lead into a sequence.

**Request:**
```json
{
  "sequenceId": "uuid",
  "lead": {
    "email": "lead@example.com",
    "first_name": "John",
    "company": "Acme Corp",
    "campaign_id": "optional-uuid"
  }
}
```

**Response:**
```json
{
  "ok": true,
  "enrollmentId": "uuid"
}
```

### 2. PATCH /api/cadence/enrollment/[id]

Update enrollment status (pause/resume/cancel).

**Request:**
```json
{
  "status": "paused" // or "active", "completed", "cancelled"
}
```

### 3. POST /api/cron/cadence-send

Cron endpoint (called every 5 minutes by Vercel). Processes due queue items.

**Headers:** Requires cron secret in production

**Response:**
```json
{
  "ok": true,
  "results": [
    { "id": "uuid", "ok": true },
    { "id": "uuid", "ok": false, "error": "..." }
  ]
}
```

## Utilities

### nextBusinessMoment()

Calculates next send time respecting:
- Day offset (wait_days)
- Timezone
- Business hours window
- Weekend exclusion (if enabled)

```typescript
import { nextBusinessMoment } from '@/lib/cadence/time'

const scheduledAt = nextBusinessMoment(
  new Date(),           // base time
  2,                    // days to add
  'America/Los_Angeles', // timezone
  { start: '08:30', end: '16:30' }, // window
  true                  // skip weekends
)
```

### mergeTemplate()

Substitutes variables in email templates.

```typescript
import { mergeTemplate } from '@/lib/cadence/merge'

const body = mergeTemplate(
  'Hi {{first_name}}, thanks for reaching out from {{company}}!',
  { first_name: 'John', company: 'Acme Corp' }
)
// Result: 'Hi John, thanks for reaching out from Acme Corp!'
```

## Testing Flow

### 1. Create a Sequence

```sql
INSERT INTO cadence_sequences (name, owner_user_id, timezone) 
VALUES ('Discovery 3-step', 'user-uuid', 'America/Los_Angeles');

INSERT INTO cadence_steps (sequence_id, step_index, wait_days, subject, body)
VALUES 
  ('seq-uuid', 0, 0, 'Welcome!', 'Hi {{first_name}}, thanks for connecting.'),
  ('seq-uuid', 1, 2, 'Quick Follow-up', 'Hi {{first_name}}, circling back...'),
  ('seq-uuid', 2, 5, 'Final Touchpoint', 'Hi {{first_name}}, last attempt...');
```

### 2. Enroll a Lead

```bash
curl -X POST http://localhost:3000/api/cadence/enroll \
  -H "Content-Type: application/json" \
  -d '{
    "sequenceId": "seq-uuid",
    "lead": {
      "email": "test@example.com",
      "first_name": "Test",
      "company": "Test Corp"
    }
  }'
```

### 3. Verify Queue

```sql
SELECT * FROM cadence_send_queue 
WHERE sent_at IS NULL 
ORDER BY scheduled_at;
```

### 4. Simulate Reply (Auto-Stop)

```sql
UPDATE campaign_logs 
SET replied = true, reply_type = 'interested' 
WHERE from_email = 'test@example.com';
```

This should mark the enrollment as `completed` and prevent further sends.

## Safety Features

1. **Auto-Pause on Reply** - Trigger marks enrollment complete
2. **Worker Safety Check** - Verifies active status before sending
3. **Locking** - Prevents duplicate processing
4. **Retry Logic** - Failed sends increment attempts
5. **Timezone Aware** - All scheduling respects local time
6. **Weekend Handling** - Configurable weekend skipping

## Vercel Cron

Already configured in `vercel.json`:
```json
{
  "path": "/api/cron/cadence-send",
  "schedule": "*/5 * * * *"
}
```

Runs every 5 minutes to process due queue items.

## Indexes

Optimized for:
- Fast queue lookup (`cadence_queue_due_idx`)
- Enrollment status checks (`cadence_enroll_status_idx`)
- Email lookups (`cadence_enroll_email_idx`)
- Campaign tracking (`cadence_enroll_campaign_idx`)

## RLS Policies

- Service role: Full access (for cron workers)
- Authenticated users: Only their own cadences/enrollments
- Workspace isolation ready

## Future Enhancements

- Email opens/clicks tracking
- A/B testing support
- Sequence templates marketplace
- Lead scoring integration
- Unsubscribe handling
- Bounce management


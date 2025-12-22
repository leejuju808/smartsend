# Sequences MVP Deployment Guide

## Overview
Block 6 — Sequences MVP enables auto follow-ups that actually send. Leads/threads can be enrolled into email sequences with messages auto-sending on a schedule.

## Files Created

1. **Migration**: `supabase/migrations/0010_sequences.sql`
   - Creates `sequences`, `sequence_steps`, and `sequence_enrollments` tables
   - Sets up RLS policies
   - Adds `enroll_in_sequence` helper function

2. **Edge Function**: `supabase/functions/sequence_runner/index.ts`
   - Processes due sequence enrollments
   - Sends next step emails
   - Updates enrollment status

3. **Seed File**: `supabase/migrations/0011_seed_sequences.sql`
   - Example sequence creation script

4. **UI Component**: `src/components/replies/EnrollInSequence.tsx`
   - Dropdown to enroll threads in sequences

5. **Integration**: Updated `src/components/replies/ThreadView.tsx`
   - Adds enrollment UI at top of thread view

## Deployment Steps

### 1. Apply Database Migration

```bash
# Option A: Via Supabase CLI
supabase db push

# Option B: Via Supabase Dashboard
# Copy contents of supabase/migrations/0010_sequences.sql
# Paste into Supabase Dashboard → SQL Editor → Run
```

### 2. Deploy Edge Function

```bash
# Deploy the function
supabase functions deploy sequence_runner --no-verify-jwt

# Schedule it to run every 5 minutes
supabase functions schedule create run-sequences \
  --function sequence_runner \
  --cron "*/5 * * * *"
```

**Note**: If scheduling via Supabase Dashboard:
- Go to Database → Cron Jobs
- Create new cron job with:
  - Name: `run-sequences`
  - Schedule: `*/5 * * * *` (every 5 minutes)
  - SQL: Call the edge function or use pg_cron to call an RPC

### 3. (Optional) Seed Sample Sequence

Replace `:project` with your actual project UUID:

```sql
-- Step 1: Create sequence
insert into public.sequences (project_id, name) 
values ('your-project-uuid-here', 'Warm Follow-up') 
returning id;

-- Step 2: Add steps (use the id from step 1)
insert into public.sequence_steps (sequence_id, step_number, delay_minutes, subject, body)
values
('your-sequence-id-here', 1, 0, 'Quick follow-up', 'Just circling back on my last note — worth a quick chat?'),
('your-sequence-id-here', 2, 1440, 'Any thoughts?', 'Wanted to bump this — happy to send a 2-min Loom if easier.');
```

### 4. Configure Sender Email

In `supabase/functions/sequence_runner/index.ts`, update the sender email:

```typescript
const sender = 'sales@smartsendhq.com' // Change to your identity
```

You may want to:
- Fetch from project settings
- Use user's default sender identity
- Look up from sender_identities table

## How It Works

1. **Enrollment**: User selects a sequence from the dropdown in ThreadView
2. **Schedule**: First step schedules based on its `delay_minutes`
3. **Execution**: `sequence_runner` function runs every 5 minutes:
   - Finds enrollments with `next_run_at <= now()`
   - Fetches next step content
   - Inserts email into `emails` table (outbound)
   - Triggers existing `email_outbox` system
   - Schedules next step or marks as completed
4. **Delivery**: Existing `email_outbox` worker handles actual sending

## QA Checklist

✅ Create sequence + steps (using seed or manually)
✅ Enroll a thread from UI → confirm row in `sequence_enrollments` with `next_run_at`
✅ After schedule ticks, verify:
   - New outbound email in `emails` table
   - Row added to `email_outbox` (from existing trigger)
   - `sequence_enrollments.current_step` increments
   - `next_run_at` moves forward or becomes null when completed

## Troubleshooting

### Function not running
- Check Supabase Dashboard → Edge Functions → Logs
- Verify cron schedule is active
- Check function has correct environment variables

### Emails not sending
- Verify `email_outbox` worker is running
- Check `emails` table for new outbound entries
- Verify sender email is configured correctly

### Enrollment fails
- Check RLS policies allow user to read sequences
- Verify project_id matches user's project membership
- Check browser console for errors

## Next Steps (Optional Enhancements)

- Add sequence builder UI
- Show enrollment status in ThreadView
- Pause/resume sequences
- Personalization variables in sequence steps
- Reply detection to pause sequences
- Analytics for sequence performance

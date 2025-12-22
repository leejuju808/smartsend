# Block 23472 — SmartSend Roofing Demo Follow-Up System v1

## Overview

**FULL SYSTEM — BUILT TO CLOSE ROOFERS WHO DON'T BUY ON THE CALL.**

This system implements a comprehensive 5-touch follow-up sequence specifically designed for roofers who have completed a demo but haven't converted yet. Every message ties back to booked estimates, more jobs, and more revenue.

## Key Features

1. **Automatic Follow-Up Scheduling**: When a demo is completed, all 5 follow-up messages are automatically scheduled
2. **Optimal Timing**: Messages are scheduled during optimal roofer hours (6-9am, 7-9pm)
3. **5-Touch Email Sequence**: 1 hour, 24 hours, Day 3, Day 5, Day 7
4. **SMS Follow-Up Support**: Optional SMS messages for direct communication
5. **Deal Closer Logic**: Handles conversion when roofers reply with interest

## Database Schema

### `demo_tracking` Table
Tracks demo calls/appointments:
- `demo_date`: When the demo occurred
- `demo_type`: Type of demo (call, meeting, appointment)
- `demo_outcome`: Outcome (completed, no_show, cancelled, rescheduled)
- `plan_discussed`: Which plan was discussed (starter, growth, domination)
- `status`: Current status (active, converted, closed_lost, paused)

### `demo_followup_schedule` Table
Scheduled follow-up messages:
- `followup_step`: Which step in the sequence (1-5)
- `followup_type`: Email or SMS
- `scheduled_for`: When to send the message
- `template_key`: Which template to use
- `status`: Current status (pending, sent, cancelled, skipped)

## Email Templates

### Message #1 — 1 Hour After Demo (Momentum Lock-In)
**Template Key**: `demo_followup_1h`
**Subject**: "Quick recap for you"
**Purpose**: Keep momentum while they're still warm

### Message #2 — 24 Hours Later (ROI Reminder)
**Template Key**: `demo_followup_24h`
**Subject**: "One job pays for this"
**Purpose**: Re-anchor ROI before they forget

### Message #3 — Day 3 (Proof + Social Belief)
**Template Key**: `demo_followup_day3`
**Subject**: "Roofers seeing results fast"
**Purpose**: Show proof of value

### Message #4 — Day 5 (Constructive Pressure)
**Template Key**: `demo_followup_day5`
**Subject**: "Before this slips through the cracks"
**Purpose**: Apply constructive pressure

### Message #5 — Day 7 (Final Close or Close File)
**Template Key**: `demo_followup_day7`
**Subject**: "Should I hold your spot?"
**Purpose**: Final "action or decline" message

## SMS Templates

### SMS #1
**Template Key**: `sms_demo_followup_1`
**Message**: "Hey, this is Julian. Want me to activate your SmartSend plan so you can start booking more estimates this week?"

### SMS #2
**Template Key**: `sms_demo_followup_2`
**Message**: "Growth is what most roofers choose. Want me to set that up?"

## Usage

### 1. Track a Demo

```sql
INSERT INTO demo_tracking (
  workspace_id,
  contact_id,
  lead_id,
  demo_date,
  demo_type,
  demo_outcome,
  plan_discussed,
  status
)
VALUES (
  'workspace-uuid',
  'contact-uuid',
  'lead-uuid',
  NOW(),
  'call',
  'completed',
  'growth',
  'active'
);
```

The trigger will automatically schedule all 5 follow-up messages.

### 2. Manually Schedule Follow-Ups

```sql
SELECT schedule_demo_followups('demo-tracking-uuid');
```

### 3. Process Follow-Ups

The system automatically processes follow-ups every 15 minutes via the `demo-followup-processor` edge function. You can also manually trigger:

```sql
SELECT * FROM process_demo_followups();
```

### 4. Close a Deal

When a roofer replies with interest:

```sql
SELECT handle_demo_deal_close(
  'demo-tracking-uuid',
  'growth', -- plan selected
  '{"payment_method": "card"}'::jsonb -- optional payment info
);
```

This will:
- Cancel all pending follow-ups
- Update demo status to 'converted'
- Record the plan selected

## Timing Logic

Follow-ups are scheduled at optimal times:
- **6-9am**: Morning window (before crews start)
- **7-9pm**: Evening window (after work)
- If scheduled outside these windows, messages are adjusted to the next available window

## The 3-Line Pressure Frame

These can be inserted into any follow-up to increase conversions:

1. "SmartSend runs while your crews are on the roof."
   → Helps roofers see automation replacing labor.

2. "Most roofers lose money from slow follow-up — this fixes that."
   → Shows SmartSend fixes an existing leak.

3. "One booked job covers the cost."
   → Destroys price objections instantly.

## The 70% Rule

Roofers rarely buy on the demo. They buy after seeing you're consistent — just like the system they're purchasing. This follow-up system demonstrates consistency and builds trust.

## Deal Closer Script

When they say: "Yeah let's do it / let's try it / okay I'm ready / sign me up"

You reply:
1. "Perfect — which plan do you want to activate? Starter ($99), Growth ($199), or Domination ($399)?"
2. "Great. What card should we use?"

This is the CLOSE.

## Automation

### Cron Job
The system runs automatically every 15 minutes via:
- Edge Function: `demo-followup-processor`
- Cron Schedule: `*/15 * * * *`

### Trigger
When a demo is completed (`demo_outcome = 'completed'` and `status = 'active'`), the trigger automatically schedules all 5 follow-ups.

## Monitoring

Check pending follow-ups:
```sql
SELECT * FROM demo_followup_schedule
WHERE status = 'pending'
ORDER BY scheduled_for ASC;
```

Check demo conversion rate:
```sql
SELECT 
  COUNT(*) FILTER (WHERE status = 'converted') as converted,
  COUNT(*) FILTER (WHERE status = 'active') as active,
  COUNT(*) FILTER (WHERE status = 'closed_lost') as lost,
  COUNT(*) as total
FROM demo_tracking
WHERE demo_date >= NOW() - INTERVAL '30 days';
```

## Integration Points

- **Email Sending**: Uses `send_queue` table (processed by existing send queue workers)
- **SMS Sending**: Uses `messages` table with `channel = 'sms'`
- **Templates**: Stored in `email_templates` table with global templates (`org_id = NULL`)

## Next Steps

1. Deploy the migration: `supabase migration up`
2. Deploy the edge function: `supabase functions deploy demo-followup-processor`
3. Verify cron job is running: Check Supabase dashboard → Database → Cron Jobs
4. Test by creating a demo tracking record and verifying follow-ups are scheduled







































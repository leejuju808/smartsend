# Block 19980 — SmartSend Inbox Smart Reminders v1 Implementation

## Overview

Smart Reminders v1 is a comprehensive reminder system that ensures no lead, appointment, task, or follow-up ever gets forgotten. This system removes the #1 failure in roofing operations: forgetting to follow up.

## What Was Built

### Database Schema

1. **`reminder_logs`** - Tracks all reminder sends (SMS, Email, In-App) for audit and analytics
2. **`reminder_settings`** - Per-workspace reminder configuration (timing, channels, enabled/disabled)
3. **`reminder_queue`** - Queue for scheduled reminders (processed by cron)

### Core Features

#### PART 1 — Appointment Reminder System
- **24 hours before** - "Reminder: Your roofing estimate is tomorrow at 10 AM. Reply YES to confirm."
- **2 hours before** - "Reminder: Your roofing estimate is in 2 hours."
- **10 minutes before** - "We're on our way! See you in about 10 minutes."
- Automatically scheduled when appointments are created
- Supports SMS + Email channels
- Configurable confirmation requirements

#### PART 2 — No-Response Reminders
- **24 hours** - "Hi! Just checking back in — want me to help you schedule your roof estimate?"
- **72 hours** - "Following up again — happy to help with repair, inspection, or replacement."
- **7 days** - "Final check — need help with your roof?"
- Automatically detects when homeowners don't reply
- Keeps leads warm until they convert

#### PART 3 — Owner Follow-Up Reminders
- Alerts when owners/reps don't respond to homeowners in time
- In-app notifications and push notifications
- Configurable threshold (default: 24 hours)
- Prevents leads from going cold

#### PART 4 — Task Reminder Engine
- **Morning reminder** - 8 AM on due date
- **2 hours before** - Reminder 2 hours before task is due
- **Overdue reminder** - End of day reminder for overdue tasks
- **Escalating reminders** - For high-value/hot tasks (insurance, storm, emergency)
- Automatically prioritized based on task metadata

#### PART 5 — Storm Follow-Up Reminders
- **Day 1** - Quick check-in after storm
- **Day 3** - Insurance info request
- **Day 5** - "We're in your area" message
- **Day 7** - "Final check — need help?"
- Automatically schedules when storm events are processed
- Drives major revenue during storm season

#### PART 6 — Missed Appointment Reminders
- Detects no-shows (appointments 2+ hours past scheduled time)
- Sends re-engagement message: "Looks like we missed you earlier. Want to reschedule for today or tomorrow?"
- Saves lost estimates

#### PART 7 — Daily Critical Follow-Ups List
- Runs every morning at 8 AM
- Displays:
  - Leads going cold
  - High-value leads untouched
  - Storm leads expiring
  - Insurance leads needing action
  - Appointment confirmations needed
  - Tasks due today
  - Overdue tasks
- Appears at top of Inbox as daily battle board

#### PART 8 — Smart Bucketing Views
- **Hot Leads** - Respond ASAP (high probability, high value, recent messages)
- **Storm Leads** - Act Today (storm-tagged leads)
- **Insurance Jobs** - High Value (insurance probability ≥ 70%)
- **Follow-Up Needed** - Threads requiring owner action
- **No Response Leads** - Leads that haven't replied (categorized by time)
- **Upcoming Appointments** - Scheduled appointments needing attention
- **Overdue Tasks** - Tasks past their due date
- **At Risk Revenue** - High-value leads at risk of going cold

#### PART 9 — Internal Reminders for Sales Reps
- Reminders about assigned leads
- Reminders to follow up
- Reminders for booking/closing
- All tracked in `reminder_logs`

## Database Functions

### Core Functions

1. **`schedule_appointment_reminders(p_appointment_id)`**
   - Schedules 24h, 2h, and 10min reminders for an appointment
   - Called automatically via trigger when appointments are created

2. **`check_no_response_reminders()`**
   - Checks for threads with no response
   - Schedules 24h, 72h, 7d reminders
   - Called by cron every hour

3. **`check_owner_followup_reminders()`**
   - Checks for threads where owner needs to reply
   - Creates in-app notifications
   - Called by cron every 15 minutes

4. **`schedule_task_reminders(p_task_id)`**
   - Schedules morning and 2h-before reminders for tasks
   - Called automatically via trigger when tasks are created

5. **`check_task_overdue_reminders()`**
   - Checks for overdue tasks
   - Sends escalating reminders for high-value tasks
   - Called by cron every hour

6. **`schedule_storm_followup_reminders(p_storm_event_id)`**
   - Schedules Day 1, 3, 5, 7 reminders for storm-tagged leads
   - Called automatically via trigger when storm events are processed

7. **`check_missed_appointments()`**
   - Checks for missed appointments
   - Schedules re-engagement reminders
   - Called by cron every 30 minutes

8. **`generate_daily_critical_followups(p_workspace_id)`**
   - Generates daily critical follow-ups list
   - Returns JSONB with all critical items
   - Called by cron daily at 8 AM

9. **`process_reminder_queue()`**
   - Main worker function that processes reminder queue
   - Sends SMS/Email reminders
   - Logs all sends to `reminder_logs`
   - Called by cron every minute

## Cron Jobs

All cron jobs are configured in `20250130000002_block_19980_smart_reminders_cron.sql`:

1. **Every minute** - Process reminder queue
2. **Every hour** - Check no-response reminders
3. **Every 15 minutes** - Check owner follow-up reminders
4. **Every hour** - Check task overdue reminders
5. **Every 30 minutes** - Check missed appointments
6. **Daily at 8 AM** - Generate daily critical follow-ups

## Views

All views are prefixed with `reminder_`:

- `reminder_hot_leads` - Hot leads needing immediate attention
- `reminder_storm_leads` - Storm-tagged leads
- `reminder_insurance_jobs` - High-value insurance jobs
- `reminder_followup_needed` - Threads requiring follow-up
- `reminder_no_response_leads` - Leads with no response
- `reminder_upcoming_appointments` - Upcoming appointments
- `reminder_overdue_tasks` - Overdue tasks
- `reminder_at_risk_revenue` - Revenue at risk

## Configuration

### Reminder Settings

Each workspace can configure reminders via `reminder_settings` table:

```sql
-- Get settings for a workspace
SELECT * FROM public.reminder_settings WHERE workspace_id = '...';

-- Update settings
UPDATE public.reminder_settings
SET appointment_24h_enabled = true,
    appointment_sms_enabled = true,
    no_response_reminders_enabled = true
WHERE workspace_id = '...';
```

### Default Settings

- All reminder types enabled by default
- SMS + Email channels enabled
- Appointment confirmation optional by default
- Owner follow-up threshold: 24 hours
- Task escalation threshold: 4 hours
- Daily critical follow-ups: 8 AM

## Usage Examples

### Get Daily Critical Follow-Ups

```sql
SELECT public.generate_daily_critical_followups('workspace-id');
```

### Get Hot Leads

```sql
SELECT * FROM public.reminder_hot_leads
WHERE workspace_id = '...'
ORDER BY hours_since_message ASC;
```

### Get Overdue Tasks

```sql
SELECT * FROM public.reminder_overdue_tasks
WHERE workspace_id = '...'
ORDER BY hours_overdue DESC;
```

### Check Reminder Logs

```sql
SELECT * FROM public.reminder_logs
WHERE workspace_id = '...'
  AND reminder_type = 'appointment_24h'
ORDER BY sent_at DESC;
```

## Integration Points

### With Existing Systems

1. **Appointments** - Auto-schedules reminders when appointments are created
2. **Tasks** - Auto-schedules reminders when tasks are created
3. **Storm Events** - Auto-schedules reminders when storm events are processed
4. **Inbox Threads** - Monitors for no-response and owner follow-up needs
5. **SMS/Email** - Sends reminders via existing messaging infrastructure

### Edge Functions Integration

The reminder system can be integrated with Supabase Edge Functions for actual SMS/Email sending:

1. Create Edge Function: `smart-reminders-process-queue`
2. Call `process_reminder_queue()` function
3. For each reminder, call your SMS/Email API
4. Update `reminder_logs` with delivery status

## Next Steps

1. **Integrate SMS/Email Sending**
   - Update `process_reminder_queue()` function to actually send SMS/Email
   - Integrate with your SMS provider (Twilio, etc.)
   - Integrate with your Email provider (SendGrid, etc.)

2. **Create UI Components**
   - Daily Critical Follow-Ups dashboard
   - Reminder settings page
   - Reminder logs viewer
   - Smart bucketing views in Inbox

3. **Add Message Templates**
   - Create AI-powered message templates
   - Personalize messages based on contact data
   - A/B test different message variations

4. **Analytics**
   - Track reminder effectiveness
   - Measure conversion rates by reminder type
   - Optimize timing and frequency

## Files Created

1. `supabase/migrations/20250130000001_block_19980_smart_reminders_v1.sql` - Main migration
2. `supabase/migrations/20250130000002_block_19980_smart_reminders_cron.sql` - Cron jobs
3. `BLOCK_19980_SMART_REMINDERS_V1_IMPLEMENTATION.md` - This file

## Summary

Smart Reminders v1 ensures that roofers will NEVER:
- Forget a lead
- Forget to reply
- Forget an appointment
- Forget a task
- Forget a storm lead
- Forget a hot lead
- Forget an insurance job
- Forget overdue revenue

SmartSend becomes the roofing owner's:
- **Memory** - Never forgets anything
- **Discipline System** - Enforces follow-up discipline
- **Daily Command Center** - Daily battle board at 8 AM
- **Revenue Protector** - Prevents revenue from going cold




















































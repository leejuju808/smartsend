# Sequence System Implementation

This document describes the implementation of the sequence/drip campaign system for SmartSend AI.

## Overview

The sequence system allows campaigns to automatically send a series of emails to leads over time, with configurable delays, stop conditions, and personalization.

## Architecture

### Database Schema

**sequences** - Top-level sequence definitions
- `id` - UUID primary key
- `user_id` - Owner
- `name` - Sequence name
- `created_at` - Timestamp

**sequence_steps** - Individual emails in a sequence
- `id` - UUID primary key
- `sequence_id` - Foreign key to sequences
- `order_index` - Step order (0, 1, 2, ...)
- `delay_minutes` - Minutes to wait after prior step
- `sender_account_id` - Optional sender override
- `subject_template` - Template with {{variables}}
- `body_text_template` - Plain text template
- `body_html_template` - HTML template
- `stop_if_replied` - Stop sequence if lead replies
- `stop_if_bounced` - Stop sequence if email bounces
- `stop_if_unsubscribed` - Stop sequence if lead unsubscribes
- `created_at` - Timestamp

**sequence_enrollments** - Track which leads are in which sequences
- `id` - UUID primary key
- `campaign_id` - Foreign key to campaigns
- `lead_id` - Foreign key to leads
- `current_step` - Next step index to send
- `status` - active/paused/completed/stopped
- `next_run_at` - When next step becomes due
- `created_at` - Timestamp
- Unique constraint on (campaign_id, lead_id)

**send_queue** - Legacy table, now integrated with email_jobs
- Stores queued emails with payload
- Status: pending/locked/sent/error

**unsubscribes** - Track unsubscribed leads
- `lead_id` - Foreign key
- `email` - Email address
- Unique on lead_id

### Database Functions & Triggers

**enroll_lead(campaign uuid, lead uuid)**
- Enrolls a lead in a campaign
- Calculates initial delay based on first step
- Inserts enrollment record with computed next_run_at

**advance_enrollment_on_log()**
- Trigger function on campaign_logs insert
- Increments current_step when outbound email is logged
- Calculates next_run_at based on next step's delay
- Sets status to 'completed' if no more steps

**pause_enroll_on_lead_status()**
- Trigger function on leads.status update
- Pauses active enrollments when lead status becomes Replied or Bounced

### Edge Functions

**sequence-compiler**
- Runs every 5 minutes via cron
- Fetches active enrollments where next_run_at <= now()
- For each due enrollment:
  - Checks if lead should be skipped (replied/bounced/unsubscribed)
  - Fetches step template based on current_step
  - Gets sender account (from step or lead owner default)
  - Creates email_jobs record with templates
  - Leaves enrollment status as 'active' (advance happens on log insert)

**queue-dispatcher**
- Existing function that processes email_jobs
- Now handles sequence emails via email_jobs
- Automatically advances sequence when email is logged to campaign_logs

## Flow

1. **Enrollment**: Call `enroll_lead(campaign_id, lead_id)` RPC
   - Calculates initial delay from first step
   - Creates enrollment with next_run_at = now() + delay

2. **Compilation**: sequence-compiler runs every 5 minutes
   - Finds enrollments where status='active' AND next_run_at <= now()
   - Checks stop conditions (replied/bounced/unsubscribed)
   - Creates email_jobs with rendered templates
   - Leaves enrollment as 'active'

3. **Sending**: queue-dispatcher processes email_jobs
   - Sends via provider-send
   - Logs to campaign_logs

4. **Advancement**: campaign_logs INSERT trigger
   - Increments enrollment.current_step
   - Calculates next_run_at = now() + next_step.delay_minutes
   - Marks enrollment as 'completed' if no more steps

5. **Stop Conditions**: Automatic stops via triggers
   - Lead status becomes Replied → pauses enrollment
   - Lead status becomes Bounced → pauses enrollment
   - Unsubscribe recorded → sequence-compiler skips future steps

## Template Rendering

Templates use Mustache syntax: `{{variable}}`

Example:
```
Subject: Hi {{lead.first_name}}, following up
Body: Hello {{lead.first_name}}, I wanted to reach out about {{campaign.name}}
```

Available variables:
- `lead.*` - All lead fields (email, first_name, last_name, status, etc.)
- `campaign.*` - Campaign fields

## Usage

### Create a Sequence

```sql
INSERT INTO sequences (user_id, name) 
VALUES ('user-uuid', 'Welcome Series')
RETURNING id;

INSERT INTO sequence_steps (sequence_id, order_index, delay_minutes, subject_template, body_html_template)
VALUES 
  ('seq-uuid', 0, 0, 'Welcome!', '<p>Welcome {{lead.first_name}}!</p>'),
  ('seq-uuid', 1, 1440, 'Following up', '<p>Following up {{lead.first_name}}...</p>'),
  ('seq-uuid', 2, 2880, 'Last chance', '<p>Last chance {{lead.first_name}}!</p>')
```

### Attach Sequence to Campaign

```sql
UPDATE campaigns 
SET sequence_id = 'seq-uuid' 
WHERE id = 'campaign-uuid'
```

### Enroll Leads

```sql
SELECT enroll_lead('campaign-uuid', 'lead-uuid')
```

### Check Enrollment Status

```sql
SELECT se.*, l.email, l.status as lead_status
FROM sequence_enrollments se
JOIN leads l ON l.id = se.lead_id
WHERE se.campaign_id = 'campaign-uuid'
```

## Files Modified/Created

- `supabase/migrations/20250130_sequence_system.sql` - Database schema and triggers
- `supabase/functions/sequence-compiler/index.ts` - Compilation edge function
- `supabase/config.toml` - Added sequence-compiler cron job
- `SEQUENCE_SYSTEM_IMPLEMENTATION.md` - This documentation

## Testing

1. Create a sequence with 2-3 steps
2. Create a campaign and attach the sequence
3. Add a lead to the campaign via `enroll_lead`
4. Wait for sequence-compiler to run (or trigger manually)
5. Verify email_jobs created
6. Wait for queue-dispatcher to send
7. Verify campaign_logs entry
8. Verify enrollment.current_step incremented
9. Wait for next step delay
10. Verify second email sent

## Notes

- Sequences are 1:1 with campaigns (MVP limitation)
- Templates are not pre-rendered; rendering happens in sequence-compiler
- Stop conditions are checked before each step compilation
- Workspace_id is required for email_jobs creation
- Uses existing email_jobs/queue-dispatcher infrastructure
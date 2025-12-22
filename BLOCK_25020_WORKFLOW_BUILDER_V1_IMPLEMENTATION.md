# Block 25020 — SmartSend Roofing Workflow Builder v1

**THE AUTOMATION ENGINE FOR ROOFING COMPANIES — ZERO FLUFF.**

This is where SmartSend becomes self-running. Workflow Builder v1 is the IF THIS HAPPENS → DO THIS engine that makes SmartSend a true operations automation system for roofing companies.

## 🎯 Overview

Workflow Builder v1 enables roofers to automate:
- ✅ Sending reminders
- ✅ Assigning leads
- ✅ Updating job stages
- ✅ Notifying crews
- ✅ Messaging homeowners
- ✅ Chasing insurance documents
- ✅ Sending invoices
- ✅ Escalating risks
- ✅ Syncing schedule updates

## 🚀 Quick Setup

### 1. Database Migration

Apply the migration in Supabase SQL Editor:

```bash
# File: supabase/migrations/20250130000009_block25020_workflow_builder_v1.sql
```

Or via CLI:
```bash
supabase db push
```

This creates:
- `workflows` table - Stores workflow rules (Trigger → Condition → Action)
- `workflow_templates` table - Pre-built workflow templates
- `workflow_executions` table - Execution logs
- `workflow_events` table - Event bus for triggers
- Database triggers for automatic event firing
- Condition evaluator function
- Helper functions

### 2. Deploy Edge Function

Deploy the workflow engine edge function:

```bash
cd supabase
supabase functions deploy workflow-engine
```

### 3. Schedule Workflow Engine

Set up a cron job to run the workflow engine periodically (recommended: every 2 minutes):

In Supabase SQL Editor:
```sql
SELECT cron.schedule(
  'workflow-engine-processor',
  '*/2 * * * *', -- Every 2 minutes
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/workflow-engine',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);
```

### 4. Environment Variables

Ensure these environment variables are set in Supabase Dashboard → Edge Functions → Settings:

- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key

## 📋 Workflow Structure

A workflow consists of:

```
Trigger → Condition → Action
```

### Triggers

Workflows can be triggered by:

**Lead Triggers:**
- `new_lead_created` - New lead enters system
- `lead_status_changed` - Lead status updates
- `lead_replied` - Homeowner replies
- `lead_unopened_48h` - Lead email unopened for 48 hours

**Proposal/Quote Triggers:**
- `quote_sent` - Quote sent to homeowner
- `proposal_sent` - Proposal sent
- `proposal_viewed` - Proposal viewed
- `proposal_approved` - Proposal approved
- `proposal_declined` - Proposal declined

**Contract Triggers:**
- `contract_signed` - Contract signed
- `contract_sent` - Contract sent

**Payment Triggers:**
- `deposit_paid` - Deposit received
- `deposit_overdue` - Deposit overdue
- `payment_received` - Payment received
- `payment_overdue` - Payment overdue
- `invoice_created` - Invoice created
- `invoice_overdue` - Invoice overdue

**Job Triggers:**
- `job_created` - Job created
- `job_approved` - Job approved
- `job_status_changed` - Job status changed
- `job_moved_to_scheduled` - Job moved to scheduled
- `job_moved_to_in_progress` - Job moved to in progress
- `job_moved_to_installed` - Job moved to installed
- `job_moved_to_completed` - Job moved to completed

**Material Triggers:**
- `material_delivery_confirmed` - Material delivery confirmed
- `material_delivery_delayed` - Material delivery delayed

**Crew Triggers:**
- `crew_checked_in` - Crew checked in
- `crew_checked_out` - Crew checked out
- `crew_finished_job` - Crew finished job

**Insurance Triggers:**
- `supplement_submitted` - Supplement submitted
- `supplement_approved` - Supplement approved
- `supplement_pending_3d` - Supplement pending 3 days

**Communication Triggers:**
- `homeowner_replied` - Homeowner replied
- `homeowner_no_reply` - Homeowner didn't reply
- `homeowner_unhappy` - Homeowner unhappy

**Weather Triggers:**
- `weather_alert_triggered` - Weather alert triggered
- `rain_forecasted` - Rain forecasted

**Schedule Triggers:**
- `install_scheduled_tomorrow` - Install scheduled tomorrow
- `inspection_scheduled` - Inspection scheduled

**AI/NLP Triggers:**
- `nlp_detects_urgency` - NLP detects urgency
- `nlp_detects_anger` - NLP detects anger
- `nlp_detects_uncertainty` - NLP detects uncertainty

**Behavior Triggers:**
- `multiple_opens` - Multiple email opens
- `clicked_quote` - Clicked quote link
- `visited_scheduling_link` - Visited scheduling link

### Conditions

Conditions filter when workflows execute. Supported operators:

- `equals` - Field equals value
- `not_equals` - Field not equals value
- `greater_than` - Field greater than value (numeric)
- `less_than` - Field less than value (numeric)
- `greater_than_or_equal` - Field >= value (numeric)
- `less_than_or_equal` - Field <= value (numeric)
- `in` - Field in array of values
- `not_in` - Field not in array
- `contains` - Field contains substring
- `is_null` - Field is null
- `is_not_null` - Field is not null

**Example Conditions:**
```json
[
  { "field": "homeowner.zip", "operator": "equals", "value": "12345" },
  { "field": "job.value", "operator": "greater_than", "value": 10000 },
  { "field": "insurance.carrier", "operator": "equals", "value": "State Farm" },
  { "field": "lead.source", "operator": "equals", "value": "storm_campaign" },
  { "field": "crew.score", "operator": "less_than", "value": 70 },
  { "field": "job.health", "operator": "less_than", "value": 60 },
  { "field": "material.type", "operator": "equals", "value": "shingles_only" },
  { "field": "weekday", "operator": "in", "value": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] },
  { "field": "payment.status", "operator": "equals", "value": "unpaid" },
  { "field": "supplement.status", "operator": "equals", "value": "pending" }
]
```

### Actions

Actions execute when conditions pass. Supported actions:

**Messaging:**
- `send_message` - Send email/SMS message using template
- `trigger_sequence` - Trigger email sequence

**Assignment:**
- `assign_owner` - Assign to owner
- `assign_sales_rep` - Assign to sales rep

**Scheduling:**
- `schedule_inspection` - Schedule inspection
- `create_calendar_event` - Create calendar event

**Notifications:**
- `notify_crew` - Notify crew
- `notify_owner` - Notify owner
- `notify_operations` - Notify operations team
- `notify_sales_rep` - Notify sales rep

**Tasks:**
- `create_task` - Create task

**Job Management:**
- `change_job_stage` - Change job stage
- `block_scheduling` - Block scheduling
- `update_health_score` - Update health score

**Escalation:**
- `escalate_to_owner` - Escalate to owner

**Logging:**
- `log_timeline_event` - Log timeline event

**Example Actions:**
```json
[
  { "type": "send_message", "template": "deposit_reminder", "channel": "email" },
  { "type": "assign_owner", "user_id": "..." },
  { "type": "create_task", "title": "Collect deposit", "priority": "high" },
  { "type": "block_scheduling", "reason": "Deposit not collected" },
  { "type": "notify_owner", "message": "Job approved but deposit not collected" }
]
```

## 🎨 Pre-Built Workflow Templates

SmartSend includes 10 pre-built workflow templates:

1. **Deposit Protection** - Automatically send deposit invoice and reminders when job is approved but deposit is unpaid
2. **Insurance Supplement Follow-Up** - Follow up with adjuster 3 days after submitting supplement
3. **Material Delivery Verification** - Verify material delivery before scheduled installation
4. **Hot Lead Acceleration** - Automatically prioritize and assign hot leads detected by NLP
5. **Crew Documentation Enforcement** - Remind crew to upload photos when job finished
6. **Review Request Booster** - Send review request when job installed and homeowner satisfied
7. **Weather Risk Rescheduler** - Notify and prompt reschedule when rain forecasted
8. **Payment Overdue Alert** - Send reminders when invoice overdue, escalate at 7 days
9. **Adjuster Appointment Sync** - Create calendar event and notify team when adjuster visit scheduled
10. **Lead Revival** - Send curiosity bump when lead email unopened 48 hours

### Installing a Template

```sql
-- Get template
SELECT * FROM workflow_templates WHERE name = 'Deposit Protection';

-- Create workflow from template
INSERT INTO workflows (
  workspace_id,
  name,
  description,
  trigger_type,
  conditions,
  actions,
  execution_delay_seconds
)
SELECT 
  'YOUR_WORKSPACE_ID',
  name,
  description,
  trigger_type,
  conditions,
  actions,
  execution_delay_seconds
FROM workflow_templates
WHERE id = 'TEMPLATE_ID';
```

## 📊 Workflow Execution

Workflows execute automatically when triggers fire. Execution flow:

1. **Event Fired** - Database trigger fires workflow event
2. **Event Queued** - Event inserted into `workflow_events` table
3. **Workflow Engine Processes** - Edge function polls for unprocessed events
4. **Workflows Matched** - Active workflows matching trigger type are found
5. **Conditions Evaluated** - Conditions checked against event payload
6. **Actions Executed** - If conditions pass, actions execute
7. **Execution Logged** - Results logged in `workflow_executions` table

### Viewing Executions

```sql
-- View recent executions
SELECT 
  we.*,
  w.name as workflow_name
FROM workflow_executions we
JOIN workflows w ON w.id = we.workflow_id
WHERE we.workspace_id = 'YOUR_WORKSPACE_ID'
ORDER BY we.created_at DESC
LIMIT 50;

-- View failed executions
SELECT * FROM workflow_executions
WHERE status = 'error'
ORDER BY created_at DESC;
```

## 🔧 Creating Custom Workflows

### Example: Deposit Reminder Workflow

```sql
INSERT INTO workflows (
  workspace_id,
  name,
  description,
  trigger_type,
  conditions,
  actions,
  is_active
) VALUES (
  'YOUR_WORKSPACE_ID',
  'Deposit Reminder',
  'Send deposit reminder when job approved but deposit unpaid',
  'job_approved',
  '[{"field": "job.deposit_paid", "operator": "equals", "value": 0}]'::jsonb,
  '[
    {"type": "send_message", "template": "deposit_reminder", "channel": "email"},
    {"type": "create_task", "title": "Collect deposit", "priority": "high"},
    {"type": "notify_owner", "message": "Deposit not collected"}
  ]'::jsonb,
  true
);
```

### Example: Hot Lead Workflow

```sql
INSERT INTO workflows (
  workspace_id,
  name,
  description,
  trigger_type,
  conditions,
  actions,
  is_active
) VALUES (
  'YOUR_WORKSPACE_ID',
  'Hot Lead Handler',
  'Automatically handle hot leads',
  'nlp_detects_urgency',
  '[]'::jsonb,
  '[
    {"type": "send_message", "template": "hot_lead_response", "channel": "email"},
    {"type": "assign_sales_rep", "priority": "high"},
    {"type": "notify_owner", "message": "Hot lead detected"},
    {"type": "update_health_score", "score": 90}
  ]'::jsonb,
  true
);
```

## 📈 Monitoring & Debugging

### Check Workflow Status

```sql
-- Active workflows
SELECT 
  id,
  name,
  trigger_type,
  is_active,
  created_at
FROM workflows
WHERE workspace_id = 'YOUR_WORKSPACE_ID'
  AND is_active = true;

-- Workflow execution stats
SELECT 
  w.name,
  COUNT(we.id) as total_executions,
  COUNT(CASE WHEN we.status = 'success' THEN 1 END) as successful,
  COUNT(CASE WHEN we.status = 'error' THEN 1 END) as failed,
  COUNT(CASE WHEN we.status = 'skipped' THEN 1 END) as skipped
FROM workflows w
LEFT JOIN workflow_executions we ON we.workflow_id = w.id
WHERE w.workspace_id = 'YOUR_WORKSPACE_ID'
GROUP BY w.id, w.name;
```

### Debug Failed Executions

```sql
-- View error details
SELECT 
  we.*,
  w.name as workflow_name
FROM workflow_executions we
JOIN workflows w ON w.id = we.workflow_id
WHERE we.status = 'error'
ORDER BY we.created_at DESC
LIMIT 10;
```

## 🎯 Best Practices

1. **Start with Templates** - Use pre-built templates as starting points
2. **Test Conditions** - Verify conditions work before activating workflows
3. **Monitor Executions** - Check execution logs regularly
4. **Rate Limiting** - Set `max_executions_per_day` to prevent spam
5. **Execution Delays** - Use `execution_delay_seconds` for time-sensitive workflows
6. **Conditional Actions** - Use conditions to prevent unnecessary actions
7. **Error Handling** - Monitor failed executions and fix issues promptly

## 🔐 Security

- Workflows are workspace-scoped (RLS enforced)
- Only workspace members can create/manage workflows
- Workflow templates are public read-only
- Execution logs are workspace-scoped
- Service role required for event processing

## 🚀 Next Steps

1. **Install Templates** - Install pre-built templates for your workspace
2. **Create Custom Workflows** - Build workflows specific to your operations
3. **Monitor Performance** - Track workflow execution and optimize
4. **Iterate** - Refine workflows based on results

## 📚 Related Blocks

- **Block 23000** - Automation Engine v1 (foundation)
- **Block 22270** - Proposal → Job Conversion Flow
- **Block 22880** - Payments & Collections v1
- **Block 21705** - Follow-Up Brain v1

---

**Block 25020 — Workflow Builder v1 is now live. SmartSend is self-running.** 🎉







































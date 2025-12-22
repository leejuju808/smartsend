# Block 10600 — Multi-Step Follow-Up Engine

## Overview

The Multi-Step Follow-Up Engine automatically follows up with homeowners based on their behavior:
- **No Response After X Days**: Automatically sends follow-up emails or creates tasks
- **Warm Intent Detected**: Creates tasks and sends follow-up messages
- **Hot Intent Detected**: Creates immediate tasks and sends reminders
- **Abandoned Threads**: Follows up when homeowners reply once then go silent

## Architecture

### Database Schema

#### `follow_up_rules` Table
Stores rule definitions:
- `trigger_type`: 'no_reply', 'warm_intent', 'hot_intent', 'reply_then_silent'
- `condition_days`: Days to wait before triggering (for no_reply and reply_then_silent)
- `action_type`: 'send_email_step', 'create_task', 'add_tag', 'stop_sequence'
- `action_value`: Step ID, tag name, task title, etc.
- `delay_hours`: Hours to wait before executing action
- `active`: Enable/disable rule

#### `follow_up_events` Table
Logs rule executions to prevent duplicates:
- Tracks which rules have fired for which contacts/threads
- Stores execution results (task_id, email_id, etc.)
- Prevents duplicate rule executions

### Engine Functions

#### `execute_follow_up_engine()`
Main engine function that:
1. Loops through all active rules
2. Checks conditions for each trigger type
3. Executes actions when conditions are met
4. Returns execution results

#### `execute_follow_up_action()`
Executes specific actions:
- **create_task**: Creates a task in the tasks system
- **add_tag**: Adds a tag to the contact (placeholder - integrate with your tags system)
- **stop_sequence**: Stops sequence enrollment
- **send_email_step**: Queues email send (integrate with campaign send system)

## API Endpoints

### Rules Management

#### `GET /api/settings/followup`
List all follow-up rules for the organization

#### `POST /api/settings/followup`
Create a new follow-up rule

**Request Body:**
```json
{
  "trigger_type": "no_reply",
  "condition_days": 3,
  "campaign_id": "uuid (optional)",
  "action_type": "create_task",
  "action_value": "Follow up with homeowner",
  "delay_hours": 0,
  "name": "No Reply After 3 Days",
  "description": "Create task when no reply after 3 days",
  "active": true
}
```

#### `GET /api/settings/followup/[id]`
Get a specific rule

#### `PATCH /api/settings/followup/[id]`
Update a rule

#### `DELETE /api/settings/followup/[id]`
Delete a rule

### Events Log

#### `GET /api/settings/followup/events`
List follow-up events (execution logs)

**Query Parameters:**
- `rule_id`: Filter by rule ID
- `contact_id`: Filter by contact ID
- `limit`: Limit results (default: 100)
- `offset`: Offset for pagination

## CRON Configuration

The follow-up engine runs every hour via CRON. Two options are available:

### Option 1: Supabase Edge Function (Recommended)

Configured in `supabase/config.toml`:
```toml
[cron.jobs."followup-engine"]
schedule = "0 * * * *"   # every hour
endpoint = "/functions/v1/followup-engine"
```

### Option 2: Next.js API Route

Available at `/api/cron/followup-engine` - can be called by external CRON services.

### Option 3: pg_cron (If Available)

A migration is provided (`20250131000004_block_10600_followup_engine_cron.sql`) that sets up a pg_cron job.

## Usage Examples

### Example 1: No Reply After 3 Days

Create a rule that sends a follow-up email after 3 days of no response:

```json
POST /api/settings/followup
{
  "trigger_type": "no_reply",
  "condition_days": 3,
  "action_type": "send_email_step",
  "action_value": "step-uuid-here",
  "name": "No Reply Follow-Up",
  "active": true
}
```

### Example 2: Warm Lead Task Creation

Create a rule that automatically creates a task when a warm intent is detected:

```json
POST /api/settings/followup
{
  "trigger_type": "warm_intent",
  "action_type": "create_task",
  "action_value": "Follow up warm lead",
  "delay_hours": 24,
  "name": "Warm Lead Follow-Up",
  "active": true
}
```

### Example 3: Hot Lead Immediate Task

Create a rule that creates an immediate task for hot leads:

```json
POST /api/settings/followup
{
  "trigger_type": "hot_intent",
  "action_type": "create_task",
  "action_value": "Call homeowner about estimate",
  "delay_hours": 0,
  "name": "Hot Lead Immediate Action",
  "active": true
}
```

### Example 4: Stop Sequence After 10 Days

Create a rule that stops the sequence and marks as cold after 10 days:

```json
POST /api/settings/followup
{
  "trigger_type": "no_reply",
  "condition_days": 10,
  "action_type": "stop_sequence",
  "name": "Stop Sequence After 10 Days",
  "active": true
}
```

## Integration Points

### Task Creation
The engine integrates with the existing tasks system (Block 9600). Tasks are created with:
- `auto_generated = true`
- `auto_type = 'follow_up_rule'`
- Links to `contact_id` and `reply_thread_id`

### Email Sending
The `send_email_step` action currently marks events as queued. To fully integrate:
1. Query `follow_up_events` where `action_type = 'send_email_step'` and `status = 'pending'`
2. Use the `action_value` (step_id) to get the email template
3. Send via your campaign send orchestrator
4. Update event status to 'completed'

### Sequence Enrollment
The engine stops sequences by updating `sequence_enrollments.status` to 'paused_replied'.

## Testing

### Manual Testing

1. Create a test rule:
```sql
INSERT INTO follow_up_rules (
  org_id, trigger_type, condition_days, action_type, action_value, active
) VALUES (
  'your-org-id', 'no_reply', 1, 'create_task', 'Test follow-up', true
);
```

2. Manually trigger the engine:
```sql
SELECT * FROM execute_follow_up_engine();
```

3. Check events:
```sql
SELECT * FROM follow_up_events ORDER BY executed_at DESC LIMIT 10;
```

## Monitoring

### Check Rule Execution
```sql
SELECT 
  r.name,
  r.trigger_type,
  r.action_type,
  COUNT(e.id) as execution_count,
  MAX(e.executed_at) as last_executed
FROM follow_up_rules r
LEFT JOIN follow_up_events e ON e.rule_id = r.id
WHERE r.active = true
GROUP BY r.id, r.name, r.trigger_type, r.action_type
ORDER BY last_executed DESC;
```

### Check Failed Executions
```sql
SELECT * FROM follow_up_events
WHERE status = 'failed'
ORDER BY executed_at DESC;
```

## Future Enhancements

- [ ] Full email sending integration with campaign orchestrator
- [ ] Tag system integration
- [ ] UI for rule management
- [ ] Rule templates/presets
- [ ] A/B testing for follow-up messages
- [ ] Analytics dashboard for follow-up performance

## Acceptance Criteria (V1)

✅ System automatically detects no-response after X days
✅ Sends automated follow-up emails on schedule (queued)
✅ Auto-creates tasks when rules match
✅ Detects warm replies and triggers follow-up
✅ Detects hot replies and creates immediate tasks
✅ Supports rule toggles
✅ Rule triggers only once per contact per step
✅ CRON executes reliably every hour
✅ Actions respect plan limits + RLS






























































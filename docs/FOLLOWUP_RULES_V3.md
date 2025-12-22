# Block 251 — Follow-Up Rules v3

## Overview

Follow-Up Rules v3 transforms SmartSend from simple linear sequences into a powerful graph-based automation engine. This system enables:

- **Wait Steps**: Delay X days/hours before next action
- **Branch Logic**: Route leads based on opens, clicks, replies, intent, score, enrichment, tags
- **Multi-Path Sequences**: Different follow-up paths for different lead behaviors
- **Event-Driven Actions**: Stop/pause based on events, run actions (send email, add tag, move pipeline, create task, assign owner)

Think of it as "mini HubSpot workflows" but specialized for cold email.

## Architecture

### Graph-Based Flow System

Instead of flat steps, we use a **graph of nodes**:

```
[Entry] → [Send Email] → [Wait 2 days] → [Branch]
                                         ├─ Opened → [Send Follow-up]
                                         └─ Not Opened → [Re-send with New Subject]
```

### Core Tables

1. **`followup_flows`**: The flow definition (workspace-scoped, optional campaign link)
2. **`followup_nodes`**: Individual steps (wait, send_email, branch, action)
3. **`followup_edges`**: Connections between nodes with conditions
4. **`followup_execution`**: Per-lead position tracking in flows

## Node Types

### 1. Wait Node (`type = "wait"`)

Delays execution for a specified time period.

**Config:**
```json
{
  "wait_type": "time",
  "amount": 2,
  "unit": "days"  // or "hours", "weeks"
}
```

**OR wait until event:**
```json
{
  "wait_type": "until",
  "event": "no_reply",
  "timeout_days": 5
}
```

### 2. Send Email Node (`type = "send_email"`)

Sends an email to the lead using a template variant.

**Config:**
```json
{
  "template_variant_id": "uuid-of-template-variant",
  "step_name": "Step 2",
  "max_retries": 0
}
```

### 3. Branch Node (`type = "branch"`)

Routes execution to different paths based on lead behavior.

**Config:**
```json
{
  "branches": [
    { "key": "opened", "label": "Opened" },
    { "key": "clicked", "label": "Clicked" },
    { "key": "replied", "label": "Replied" },
    { "key": "intent_meeting", "label": "Meeting Intent" },
    { "key": "score_high", "label": "High Score" },
    { "key": "no_open", "label": "No Open" }
  ],
  "fallback": "no_open"
}
```

**Branch Evaluation Priority:**
1. Replied
2. Clicked
3. Meeting Intent
4. High Score (>= 75)
5. Opened
6. No Open (fallback)

### 4. Action Node (`type = "action"`)

Performs actions on the lead without sending email.

**Config:**
```json
{
  "actions": [
    { "type": "add_tag", "value": "engaged" },
    { "type": "move_stage", "value": "Working" },
    { "type": "create_task", "title": "Manual call", "assign_to": "owner" },
    { "type": "assign_owner", "value": "user-uuid" },
    { "type": "stop" }
  ]
}
```

**Available Actions:**
- `add_tag`: Add tag to lead (creates tag if doesn't exist)
- `move_stage`: Move lead to pipeline stage by name
- `create_task`: Create task for lead
- `assign_owner`: Assign lead owner
- `stop`: Stop execution

## Execution Context

Each execution maintains a `context` JSONB field that tracks:

```json
{
  "opened": true,
  "clicked": true,
  "replied": false,
  "intent": "meeting_intent",
  "score_v3": 85,
  "last_event_at": "2025-01-30T10:00:00Z",
  "last_event_type": "click"
}
```

This context is automatically updated by event hooks when:
- Emails are opened
- Links are clicked
- Replies are detected
- Intent is detected
- Lead score is updated

## Creating a Flow

### Example: Standard 5-Step Flow

```sql
-- 1. Create flow
INSERT INTO followup_flows (workspace_id, campaign_id, name, is_active)
VALUES ('workspace-uuid', 'campaign-uuid', 'Standard 5-Step', true)
RETURNING id;

-- 2. Create nodes
-- Send Email 1
INSERT INTO followup_nodes (flow_id, type, label, config)
VALUES (flow_id, 'send_email', 'Initial Email', '{"template_variant_id": "..."}');

-- Wait 2 days
INSERT INTO followup_nodes (flow_id, type, label, config)
VALUES (flow_id, 'wait', 'Wait 2 days', '{"wait_type": "time", "amount": 2, "unit": "days"}');

-- Branch (opened vs not opened)
INSERT INTO followup_nodes (flow_id, type, label, config)
VALUES (flow_id, 'branch', 'Check Engagement', '{"branches": [...]}');

-- 3. Create edges
INSERT INTO followup_edges (flow_id, from_node_id, to_node_id, condition_key)
VALUES (flow_id, send_email_node_id, wait_node_id, NULL);

INSERT INTO followup_edges (flow_id, from_node_id, to_node_id, condition_key)
VALUES (flow_id, wait_node_id, branch_node_id, NULL);

INSERT INTO followup_edges (flow_id, from_node_id, to_node_id, condition_key)
VALUES (flow_id, branch_node_id, opened_path_node_id, 'opened');

INSERT INTO followup_edges (flow_id, from_node_id, to_node_id, condition_key)
VALUES (flow_id, branch_node_id, not_opened_path_node_id, 'no_open');
```

## Prebuilt Flow Templates

### 1. Standard 5-Step

- Send Email
- Wait 2 days
- Branch (opened vs not opened)
  - Opened → soft follow-up
  - Not opened → re-send with new subject
- Wait 3 days
- Final bump / break-up

### 2. Meeting-Intent Booster

- Branch (meeting intent detected)
  - Meeting Intent → Action: tag as meeting-intent
  - Meeting Intent → Action: create task "Confirm meeting"
  - Meeting Intent → Stop follow-up

### 3. ICP-Score Based

- Branch (score_v3 >= 80)
  - High Score → send more personalized follow-ups
  - Low Score → shorter sequence

## Worker Process

The `process-followup-flows` edge function runs every 2 minutes (configurable) and:

1. Selects executions where `status = 'active'` AND `next_run_at <= now()`
2. For each execution:
   - Loads current node
   - Executes node behavior
   - Decides next node via edges
   - Updates `current_node_id`, `next_run_at`, `status`

## Event Hooks

Event hooks automatically update execution context:

- **Email Opens**: Updates `opened: true`
- **Email Clicks**: Updates `clicked: true`
- **Replies**: Updates `replied: true`
- **Intent Detection**: Updates `intent` field
- **Score Updates**: Updates `score_v3` field

These hooks are implemented as database triggers that call `update_followup_execution_context()`.

## Backward Compatibility

Existing linear follow-up steps can be migrated to flows:

```sql
-- Migrate campaign_steps to flows
SELECT public.migrate_campaign_steps_to_flows();

-- Migrate followup_sequences to flows
SELECT public.migrate_followup_sequences_to_flows();

-- Initialize executions for existing leads
SELECT public.initialize_followup_executions();
```

## RLS & Security

Flows are workspace-scoped:

- **View**: Any workspace member can view flows
- **Edit**: Only workspace admins/owners can edit flows
- **Executions**: Team members can see executions for their leads

RLS policies use `is_workspace_member_for_followup()` which checks both `workspace_members` and `team_members` tables.

## API Usage

### Create Flow

```typescript
const { data: flow } = await supabase
  .from('followup_flows')
  .insert({
    workspace_id: workspaceId,
    campaign_id: campaignId,
    name: 'My Flow',
    is_active: true
  })
  .select()
  .single();
```

### Add Node

```typescript
const { data: node } = await supabase
  .from('followup_nodes')
  .insert({
    flow_id: flow.id,
    type: 'send_email',
    label: 'Step 1',
    config: {
      template_variant_id: templateId,
      step_name: 'Step 1'
    }
  })
  .select()
  .single();
```

### Connect Nodes

```typescript
await supabase
  .from('followup_edges')
  .insert({
    flow_id: flow.id,
    from_node_id: node1.id,
    to_node_id: node2.id,
    condition_key: 'opened' // or null for unconditional
  });
```

### Start Execution for Lead

```typescript
const { data: execution } = await supabase
  .from('followup_execution')
  .insert({
    flow_id: flow.id,
    lead_id: leadId,
    current_node_id: flow.entry_node_id,
    status: 'active',
    next_run_at: new Date().toISOString()
  })
  .select()
  .single();
```

## Migration Files

1. **267_followup_flows.sql**: Core schema (flows, nodes, edges, execution tables)
2. **268_followup_flows_event_hooks.sql**: Event hooks for context updates
3. **269_followup_flows_backward_compat.sql**: Migration functions for existing data

## Edge Function

- **Location**: `supabase/functions/process-followup-flows/index.ts`
- **Schedule**: Every 2 minutes (configurable in `config.toml`)
- **Purpose**: Processes active executions and advances flows

## Next Steps

1. **UI Flow Builder**: Build visual canvas for creating flows (React Flow recommended)
2. **Template Variants**: Ensure template_variants are properly linked
3. **Testing**: Test flows with sample leads
4. **Monitoring**: Add logging/metrics for flow execution

## Troubleshooting

### Executions Not Processing

- Check `next_run_at` is in the past
- Verify `status = 'active'`
- Check worker logs: `supabase functions logs process-followup-flows`

### Context Not Updating

- Verify event hooks are installed (migration 268)
- Check trigger functions exist
- Verify email_events table has correct structure

### Branch Not Routing Correctly

- Check `evaluate_branch_outcome()` function
- Verify context has correct keys
- Check edge `condition_key` matches branch outcome










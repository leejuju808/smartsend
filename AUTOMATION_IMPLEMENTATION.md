# Smart Automation Hub Implementation

This document describes the Smart Automation Hub implementation that provides IFTTT-style automation for email outreach.

## Overview

The automation system allows users to create rules that trigger actions based on email events like opens, clicks, and replies. This transforms SmartSend from a simple email tool into an autonomous assistant that manages outreach automatically.

## Components

### 1. Database Migration
**File**: `supabase/migrations/20250107000000_automation_rules_org.sql`

Creates the core automation tables:
- `automation_rules` - Stores rule definitions (trigger event → action)
- `automation_queue` - Queues follow-up emails triggered by automations
- Helper function `add_tag_to_lead` - Safely adds tags to leads

Key schema:
```sql
automation_rules (
  id, org_id, name, trigger_event, condition, action, enabled
)
```

### 2. Edge Function
**File**: `supabase/functions/automation-runner/index.ts`

Executes automation rules when events occur. Accepts:
- `event_type`: 'reply', 'open', 'click', or 'time_delay'
- `lead_id`: The lead who triggered the event
- `org_id`: The organization for rule lookup

Supported actions:
- `add_tag` - Adds a tag to the lead
- `pause_sequence` - Pauses the lead's email sequence
- `send_followup` - Queues a follow-up email

### 3. UI Dashboard
**File**: `src/app/dashboard/automation/page.tsx`

Clean interface for creating and managing automation rules:
- Create rules with trigger and action dropdowns
- Enable/disable rules with a toggle
- View all automation rules in a grid

### 4. Integration Hooks

Currently implemented in tracking routes:
- **Open tracking**: `src/app/t/o/[cid]/[email]/route.ts` already calls `/api/automation/run`
- **Click tracking**: `src/app/t/c/[cid]/[email]/route.ts` already calls `/api/automation/run`

To add automation hooks to new events, call:
```typescript
await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/automation-runner`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ event_type: "reply", lead_id, org_id })
});
```

## Example Automations

### "Tag Warm Leads"
- **Trigger**: Email opens 3+ times
- **Action**: Add tag "Warm Lead"

### "Stop on Reply"
- **Trigger**: Reply received
- **Action**: Pause sequence

### "Follow-up on Click"
- **Trigger**: Click on pricing link
- **Action**: Send follow-up email

## Testing

1. Create a test automation rule in the dashboard
2. Generate the triggering event (open/click/reply)
3. Verify the action executed (check lead tags or sequence status)

## Future Enhancements

- Time-based triggers (e.g., "If no reply after 5 days")
- Advanced conditions (e.g., opens >= 3, multiple tags)
- Multi-step workflows
- A/B testing for automation effectiveness
- Analytics dashboard

## Status

✅ Database schema implemented
✅ Edge Function created
✅ UI dashboard built
✅ Integration hooks available
⏳ Pending: Comprehensive testing


# Block 8880 — Auto-Follow-Up Brain v1

## Overview

Block 8880 implements behavior-based sequences that automatically send follow-up messages based on:
- ❌ No reply after X days
- ✅ Positive signals (hot/warm replies)
- 🚫 Negative signals (not interested, wrong person, unsubscribe)
- 🔄 Pipeline movement (New → Quoted → Won/Lost)
- 📈 Lead score thresholds

## Database Schema

### Tables Created

1. **follow_up_programs** - Per-campaign follow-up program configuration
2. **follow_up_rules** - Individual rules (no-reply, positive/negative intent, pipeline, lead score)
3. **follow_up_events** - Log of all follow-up decisions
4. **lead_auto_follow_up_stats** - Per-lead per-campaign stats for enforcing caps

### Enums Created

- `follow_up_rule_type`: `no_reply`, `positive_intent`, `negative_intent`, `pipeline_stage`, `lead_score`
- `follow_up_event_type`: `scheduled_follow_up`, `skipped_due_to_cap`, `skipped_due_to_suppression`, `stopped_by_positive_intent`, `stopped_by_negative_intent`, `stopped_by_pipeline_stage`, `stopped_by_manual_action`

## Edge Functions

### 1. auto-followup-scheduler
**Schedule**: Every 20 minutes  
**Purpose**: Scans for no-reply cases and schedules follow-up emails

**Flow**:
1. Fetches all enabled follow-up programs
2. For each program, loads no-reply rules
3. For each lead in the campaign:
   - Checks if follow-ups are disabled or cap reached
   - Checks if contact is suppressed
   - Calculates days since last outbound
   - Matches against rules and schedules follow-up if conditions met

### 2. handle-followup-reply-intent
**Purpose**: Processes reply intents and applies positive/negative intent rules

**Usage**: Call this function when a reply is classified with intent:
```json
POST /functions/v1/handle-followup-reply-intent
{
  "contact_id": "uuid",
  "campaign_id": "uuid",
  "intent": "hot" | "warm" | "neutral" | "negative" | "unsubscribe",
  "message_id": "uuid",
  "account_id": "uuid" // optional, will be fetched from campaign if not provided
}
```

**Actions**:
- Updates `lead_auto_follow_up_stats` with latest intent
- Checks positive intent rules → stops follow-ups if matched
- Checks negative intent rules → stops follow-ups and optionally adds to suppression

### 3. handle-followup-pipeline
**Purpose**: Processes pipeline stage changes and lead score updates

**Usage**: Call this function when pipeline stage or lead score changes:
```json
POST /functions/v1/handle-followup-pipeline
{
  "contact_id": "uuid",
  "campaign_id": "uuid",
  "pipeline_stage": "new" | "quoted" | "won" | "lost",
  "lead_score": 0-100,
  "previous_stage": "string", // optional
  "previous_score": 0-100, // optional
  "account_id": "uuid" // optional
}
```

**Actions**:
- Updates `lead_auto_follow_up_stats` with pipeline stage and lead score
- Checks pipeline rules → stops follow-ups if stage is "won" or "lost"
- Checks lead score rules → logs score changes (V1 minimal)

## API Routes

### GET /api/follow-up/programs/:campaignId
Returns program + rules + stats counters for leads (for UI)

### POST /api/follow-up/programs/:campaignId
Create/update program:
```json
{
  "is_enabled": true,
  "max_follow_ups_per_lead": 4,
  "timezone": "America/Los_Angeles"
}
```

### POST /api/follow-up/rules
Create/update individual rules:
```json
{
  "id": "uuid", // optional, for updates
  "program_id": "uuid",
  "type": "no_reply" | "positive_intent" | "negative_intent" | "pipeline_stage" | "lead_score",
  "is_enabled": true,
  "priority": 100,
  // For no_reply:
  "no_reply_after_days": 2,
  "follow_up_template_id": "uuid",
  // For positive/negative intent:
  "intent_match_any": ["hot", "warm"],
  "stop_all_future": true,
  "add_to_suppression": true,
  // For pipeline_stage:
  "pipeline_stage_from": "new",
  "pipeline_stage_to": "quoted",
  // For lead_score:
  "min_lead_score": 70,
  "max_lead_score": 100
}
```

### DELETE /api/follow-up/rules?id=...
Delete a rule

### GET /api/follow-up/events?campaignId=...
Paginated list of follow-up events for dashboard

## Integration Points

### Reply Intent Classification
When a reply is classified (e.g., in `handle-new-reply-intent`), call:
```typescript
await fetch(`${SUPABASE_URL}/functions/v1/handle-followup-reply-intent`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${SERVICE_ROLE_KEY}`
  },
  body: JSON.stringify({
    contact_id,
    campaign_id,
    intent: label, // 'hot', 'warm', 'not_interested', 'unsubscribe', etc.
    message_id: msg.id
  })
});
```

### Pipeline Stage Changes
When pipeline stage changes, call:
```typescript
await fetch(`${SUPABASE_URL}/functions/v1/handle-followup-pipeline`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${SERVICE_ROLE_KEY}`
  },
  body: JSON.stringify({
    contact_id,
    campaign_id,
    pipeline_stage: "quoted",
    previous_stage: "new"
  })
});
```

## Default Recipes (Roofing-Focused)

When creating a roofing campaign, you can seed default follow-up rules:

1. **No-Reply Step 1** - 2 days after
   - Template: "Quick check-in if you still need help with the roof."

2. **No-Reply Step 2** - 5 days after
   - Template: "Season/weather urgency angle."

3. **No-Reply Step 3** - 10 days after
   - Template: "Last polite check-in + 'we'll close your file' angle."

4. **Positive Replies** - Stop follow-ups (hot/warm)

5. **Negative/Unsub** - Stop and suppress

6. **Pipeline** - Stop when Won/Lost, optional check-in after Estimate Sent

## Safeguards

- Always respects suppression list (Block 8230)
- Enforces per-lead cap: `max_follow_ups_per_lead`
- Never schedules follow-ups for:
  - Leads marked as Won or Lost (if pipeline toggle on)
  - Leads with `auto_follow_up_disabled = true`
  - If campaign is paused/archived
  - Contacts on suppression list

## Testing

1. Create a test campaign with a follow-up program
2. Send initial email to a test contact
3. Wait for no-reply rule to trigger (or manually adjust `last_outbound_at`)
4. Verify follow-up is scheduled
5. Send a positive reply → verify follow-ups stop
6. Send an unsubscribe reply → verify follow-ups stop + suppression

## Migration

Run the migration:
```bash
supabase migration up
```

The migration creates all tables, indexes, RLS policies, and helper functions.

























































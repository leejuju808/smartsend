# Block 59000 — SmartSend Roofing "AI Sales Coach + Objection Handling System" v1

## Implementation Summary

This block transforms SmartSend from an operations and production system into a **full-blown SALES CLOSING ENGINE**. It provides roofers with AI-powered sales coaching, objection handling, follow-up automation, and deal rescue capabilities.

## Features Implemented

### 1. AI Objection Response Engine
- **Edge Function**: `/sales/objection`
- Generates complete objection response packages including:
  - Verbal scripts
  - Text/SMS messages
  - Email messages
  - Confidence-building scripts
  - Risk-removal sentences
  - Follow-up plans
  - Psychological angles

### 2. Sales Script Generator (AI-Powered)
- **Edge Function**: `/sales/script-generator`
- Generates sales scripts for:
  - Pitch scripts
  - Door-knocking scripts
  - Insurance scripts
  - Storm damage scripts
  - Upsell scripts
  - Voicemail scripts
  - Proposal walkthrough scripts

### 3. Deal Rescue AI Follow-Up Generator
- **Edge Function**: `/sales/deal-rescue`
- Generates rescue messages for stalled deals:
  - Viewed but didn't sign
  - Responded then went silent
  - Asked question then disappeared
  - Slowing communication

### 4. Sales Follow-Up Sequences
- **Edge Function**: `/sales/followup-create`
- Automatically creates follow-up sequences:
  - Day 1 follow-up
  - Day 3 follow-up
  - Day 7 follow-up
  - Day 14 follow-up
  - Pre-expiration message
  - Last chance message

### 5. Automated Follow-Up Sender
- **Edge Function**: `/sales/followup-send` (Cron: Every 15 minutes)
- Automatically sends scheduled follow-ups via:
  - Email
  - SMS
  - Voicemail scripts (for manual use)

### 6. Sales Coaching (On-Call AI)
- **Edge Function**: `/sales/coaching`
- Provides instant coaching for sales situations:
  - What to say
  - How to say it
  - Angle to use
  - Psychology to apply
  - What not to say
  - How to close

## Database Schema

### Tables Created

1. **sales_objections**
   - Tracks homeowner objections and AI-generated responses
   - Links to proposals, homeowners, leads, and workspaces
   - Stores verbal scripts, text messages, email messages, confidence scripts, risk removal sentences, follow-up plans, and psychological angles

2. **sales_followups**
   - Tracks scheduled and sent follow-up messages
   - Supports email, SMS, and voicemail types
   - Includes follow-up sequence day and type tracking

3. **sales_coaching_logs**
   - Tracks sales coaching scenarios and AI advice
   - Stores comprehensive coaching guidance for each situation

4. **sales_scripts**
   - Stores AI-generated sales scripts as templates
   - Supports multiple script types (pitch, door_knocking, insurance, etc.)
   - Includes key points and use cases

### Views Created

1. **sales_objections_summary**
   - Aggregates objection data by workspace and type
   - Tracks total objections, proposals with objections, and leads with objections

2. **sales_followup_effectiveness**
   - Tracks follow-up message effectiveness
   - Measures proposals approved/viewed after follow-ups
   - Calculates average days to response

## Edge Functions

### `/sales/objection`
**Purpose**: Generate AI-powered objection responses

**Request Body**:
```json
{
  "objection_text": "Price is too high",
  "proposal_id": "uuid",
  "homeowner_id": "uuid",
  "lead_id": "uuid",
  "workspace_id": "uuid",
  "objection_type": "price",
  "user_id": "uuid"
}
```

**Response**:
```json
{
  "success": true,
  "objection_id": "uuid",
  "verbal_script": "...",
  "text_message": "...",
  "email_message": "...",
  "confidence_script": "...",
  "risk_removal_sentence": "...",
  "follow_up_plan": "...",
  "psychological_angle": "..."
}
```

### `/sales/followup-create`
**Purpose**: Create scheduled follow-up sequences

**Request Body**:
```json
{
  "proposal_id": "uuid",
  "lead_id": "uuid",
  "homeowner_id": "uuid",
  "workspace_id": "uuid",
  "follow_up_type": "initial",
  "custom_scheduled_at": "ISO date string (optional)"
}
```

**Response**:
```json
{
  "success": true,
  "followups": [...],
  "count": 4
}
```

### `/sales/followup-send`
**Purpose**: Automated cron job to send scheduled follow-ups

**Schedule**: Every 15 minutes

**Process**:
1. Fetches all due follow-ups
2. Sends via configured SMS/Email provider
3. Marks as sent
4. Logs proposal events

### `/sales/coaching`
**Purpose**: Provide instant sales coaching advice

**Request Body**:
```json
{
  "scenario": "Homeowner says they need to think about it",
  "workspace_id": "uuid",
  "user_id": "uuid",
  "context": {
    "proposal_id": "uuid",
    "lead_id": "uuid"
  }
}
```

**Response**:
```json
{
  "success": true,
  "coaching_id": "uuid",
  "what_to_say": "...",
  "how_to_say_it": "...",
  "angle_to_use": "...",
  "psychology_to_apply": "...",
  "what_not_to_say": "...",
  "how_to_close": "..."
}
```

### `/sales/script-generator`
**Purpose**: Generate AI sales scripts

**Request Body**:
```json
{
  "script_type": "pitch",
  "workspace_id": "uuid",
  "user_id": "uuid",
  "title": "Storm Damage Pitch",
  "use_case": "After storm damage",
  "custom_requirements": "Focus on insurance coverage"
}
```

**Response**:
```json
{
  "success": true,
  "script_id": "uuid",
  "script_content": "...",
  "key_points": ["...", "..."],
  "use_case": "..."
}
```

### `/sales/deal-rescue`
**Purpose**: Generate rescue messages for stalled deals

**Request Body**:
```json
{
  "proposal_id": "uuid",
  "lead_id": "uuid",
  "homeowner_id": "uuid",
  "workspace_id": "uuid",
  "situation": "viewed_no_sign",
  "user_id": "uuid",
  "auto_schedule_followup": true
}
```

**Response**:
```json
{
  "success": true,
  "followup_id": "uuid",
  "text_message": "...",
  "email_message": "...",
  "voicemail_script": "...",
  "urgency_reason": "...",
  "next_step": "..."
}
```

## Row Level Security

All tables have RLS enabled with policies that:
- Allow users to view/create/update records in their workspace
- Enforce workspace membership checks
- Support service role for system operations

## Cron Configuration

The follow-up sender runs every 15 minutes via:
- `supabase/config.toml` - Cron job configuration
- `supabase/functions/_scheduled/cron.yaml` - Scheduled function definition

## Integration Points

### With Existing Systems

1. **Proposals System**
   - Links to `proposals` table
   - Creates `proposal_events` for tracking
   - Respects proposal status (skips if approved)

2. **Leads/Homeowners**
   - Uses lead and homeowner data for personalization
   - Sends messages via configured channels

3. **SMS/Email Infrastructure**
   - Integrates with workspace SMS provider (Twilio/Vonage)
   - Uses existing email sending infrastructure

4. **Workspace System**
   - All data scoped to workspaces
   - Respects workspace membership

## Usage Examples

### Handling an Objection

```javascript
const response = await fetch('/functions/v1/sales/objection', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    objection_text: "Your price is higher than others",
    proposal_id: proposalId,
    workspace_id: workspaceId,
    objection_type: "price"
  })
});

const { verbal_script, text_message, email_message } = await response.json();
```

### Creating Follow-Up Sequence

```javascript
const response = await fetch('/functions/v1/sales/followup-create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    proposal_id: proposalId,
    workspace_id: workspaceId,
    follow_up_type: "initial"
  })
});
```

### Getting Sales Coaching

```javascript
const response = await fetch('/functions/v1/sales/coaching', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    scenario: "Homeowner says they need to think about it",
    workspace_id: workspaceId,
    context: { proposal_id: proposalId }
  })
});

const { what_to_say, how_to_say_it, how_to_close } = await response.json();
```

### Rescuing a Stalled Deal

```javascript
const response = await fetch('/functions/v1/sales/deal-rescue', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    proposal_id: proposalId,
    workspace_id: workspaceId,
    situation: "viewed_no_sign",
    auto_schedule_followup: true
  })
});

const { text_message, email_message } = await response.json();
```

## Benefits

1. **Better Objection Handling** = More deals closed
2. **Better Follow-Up** = More jobs signed
3. **Better Scripts** = More confidence
4. **Better Communication** = More trust
5. **Deal Rescue** = Saves deals before they die

## Next Steps

1. Deploy migration: `supabase migration up`
2. Deploy edge functions: `supabase functions deploy sales/objection sales/followup-create sales/followup-send sales/coaching sales/script-generator sales/deal-rescue`
3. Configure cron job (already in config.toml and cron.yaml)
4. Build UI components for:
   - Objection Mode interface
   - Deal Rescue Mode interface
   - Sales Coaching Center dashboard
   - Follow-up sequence management

## Files Created

1. `supabase/migrations/20250130000002_block59000_ai_sales_coach_objection_handling_v1.sql`
2. `supabase/functions/sales/objection/index.ts`
3. `supabase/functions/sales/followup-create/index.ts`
4. `supabase/functions/sales/followup-send/index.ts`
5. `supabase/functions/sales/coaching/index.ts`
6. `supabase/functions/sales/script-generator/index.ts`
7. `supabase/functions/sales/deal-rescue/index.ts`

## Configuration Updates

1. `supabase/config.toml` - Added cron job for followup-send
2. `supabase/functions/_scheduled/cron.yaml` - Added scheduled function

---

**Status**: ✅ Complete - Ready for deployment and UI integration

































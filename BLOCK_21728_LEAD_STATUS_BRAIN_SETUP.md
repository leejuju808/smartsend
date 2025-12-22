# Block 21728 — SmartSend Roofing Lead Status Brain v1

## Overview

This is THE engine that makes SmartSend feel like magic. Roofers don't lose money because they lack leads—they lose money because they don't know which leads are worth chasing today.

The Lead Status Brain automatically classifies every lead as:
- **HOT** → call NOW
- **WARM** → follow-up automatically  
- **COLD** → slow-drip nurture, no wasted time

## What Was Built

### 1. Database Migration
**File:** `supabase/migrations/20250130000002_block_21728_lead_status_brain_v1.sql`

- Adds/modifies `status` column on `leads` table with enum: `hot`, `warm`, `cold`, `new`
- Adds tracking columns: `last_email_sent_at`, `last_email_opened_at`, `last_reply_at`
- Creates `auto_update_lead_status_by_time()` function for time-based rules
- Adds indexes for performance

### 2. AI Classification Edge Function
**File:** `supabase/functions/ai-classify-lead/index.ts`

- Uses OpenAI GPT-4o-mini to classify homeowner replies
- Automatically updates lead status based on reply content
- Logs timeline events

**Classification Logic:**
- **HOT**: "when can you come out?", "can you take a look?", "what's the cost?", insurance questions, urgency ("ASAP", "leak", "storm damage"), phone/address shared
- **WARM**: "I'm just getting quotes", "maybe later", price curiosity, general questions, "not ready yet"
- **COLD**: "stop emailing", "not interested", "wrong house"

### 3. Manual Status Change API
**File:** `app/api/leads/status/route.ts`

- Allows estimators to manually change lead status
- Validates workspace access
- Logs timeline events

**Usage:**
```typescript
POST /api/leads/status
Body: { lead_id: string, status: "hot" | "warm" | "cold" | "new" }
```

### 4. UI Component
**File:** `components/lead/LeadStatus.tsx`

- Color-coded status badge component
- Displays: HOT (red), WARM (yellow), COLD (gray), NEW (blue)

**Usage:**
```tsx
import { LeadStatus } from "@/components/lead/LeadStatus";

<LeadStatus status={lead.status} />
```

### 5. Time-Based Status Updates (Cron)
**File:** `supabase/functions/auto-update-lead-status/index.ts`

- Runs hourly via cron
- Applies time-based rules:
  - After 3 days with no reply → downgrade HOT to WARM
  - After 7 days with no opens → downgrade to COLD
  - If they reopen after 7 days → upgrade COLD to WARM

## Setup Instructions

### 1. Run Database Migration

Apply migration in Supabase SQL Editor or via CLI:
```bash
supabase db push
```

### 2. Deploy Edge Functions

```bash
supabase functions deploy ai-classify-lead
supabase functions deploy auto-update-lead-status
```

### 3. Set Environment Variables

In Supabase Dashboard → Edge Functions → Settings:

**For `ai-classify-lead`:**
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `ADD_LEAD_EVENT_URL` (optional)

**For `auto-update-lead-status`:**
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### 4. Configure Cron Job

Already configured in `supabase/config.toml`. Runs hourly.

## Integration

### Calling AI Classification

```typescript
const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-classify-lead`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
  },
  body: JSON.stringify({
    lead_id: leadId,
    reply_text: replyBody,
  }),
});
```

### Using LeadStatus Component

```tsx
<LeadStatus status={lead.status} />
```

### Manual Status Update

```typescript
await fetch("/api/leads/status", {
  method: "POST",
  body: JSON.stringify({ lead_id, status: "hot" }),
});
```

## Benefits

🔥 **HOT leads** → surfaced instantly, more booked inspections, more closed jobs

🌤️ **WARM leads** → auto-follow-up, converts slow shoppers, keeps pipeline full

❄️ **COLD leads** → deprioritized, no wasted time

🧠 **SmartSend FEELS intelligent** → "This thing tells me what needs attention. I don't even have to think."











































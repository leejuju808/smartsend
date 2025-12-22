# Block 22261 — SmartSend Roofing Proposal Intelligence v1 Implementation

## ✅ Implementation Complete

This document summarizes the complete implementation of Block 22261 - SmartSend Roofing Proposal Intelligence v1, the proposal-closing machine that helps roofing contractors track proposals, classify homeowner intent, trigger auto follow-ups, and predict revenue.

## 📦 What Was Implemented

### 1. Database Schema (`supabase/migrations/20250130000003_block22261_proposal_intelligence_v1.sql`)

#### Tables Created:

1. **`proposals`** - Tracks each proposal attached to a lead
   - Links to `lead_id` and `workspace_id`
   - Stores amount, proposal URL, status (sent/viewed/considering/approved/declined/expired)
   - AI classification fields: `intent` (HOT/WARM/COLD/DECLINE) and `confidence` (0.0-1.0)
   - Tracks sent_at, viewed_at timestamps
   - Full RLS policies for workspace-based access

2. **`proposal_events`** - Every interaction logged automatically
   - Event types: proposal_sent, proposal_viewed, proposal_followup, proposal_reply
   - Stores metadata as JSONB for flexibility
   - Automatically appears in lead timeline

#### Functions & Triggers:

- **`schedule_proposal_followup()`** - Automatically schedules follow-up when intent is WARM or COLD
- **`get_proposal_revenue_score()`** - Calculates revenue likelihood score based on intent
- **`proposals_with_revenue`** - View that includes revenue predictions

#### Revenue Prediction:

- HOT: 85% likelihood
- WARM: 55% likelihood
- COLD: 20% likelihood
- DECLINE: 2% likelihood

Estimated revenue = `proposal.amount * revenue_score`

### 2. Edge Function (`supabase/functions/classify-proposal-intent/index.ts`)

**Purpose:** Classifies homeowner intent when they reply after receiving a proposal

**Features:**
- Uses GPT-4o-mini for classification
- Validates intent categories (HOT, WARM, COLD, DECLINE)
- Updates proposal record with intent and confidence
- Logs event to `proposal_events` table
- Adds entry to `lead_timeline_events` for unified timeline

**API:** `POST /functions/classify-proposal-intent`

**Request Body:**
```json
{
  "proposal_id": "uuid",
  "lead_id": "uuid",
  "workspace_id": "uuid",
  "message": "homeowner reply text"
}
```

### 3. API Routes (`app/api/proposals/`)

#### POST `/api/proposals/create`
- Creates a new proposal
- Logs `proposal_sent` event
- Adds to lead timeline
- Returns created proposal

#### POST `/api/proposals/classify-intent`
- Proxies request to Edge Function
- Handles errors gracefully

#### GET `/api/proposals/[lead_id]`
- Returns all proposals for a lead
- Includes revenue predictions via `proposals_with_revenue` view
- Ordered by sent_at (newest first)

### 4. UI Components (`components/proposals/`)

#### `ProposalCard.tsx`
- Displays proposal information
- Shows status badge (sent/viewed/considering/approved/declined/expired)
- Displays intent classification with color-coded badges
- Shows revenue prediction
- Links to proposal URL if available

#### `AddProposalForm.tsx`
- Form to add new proposals
- Fields: amount (required), proposal URL (optional), notes (optional)
- Real-time validation
- Success/error feedback
- Auto-refreshes proposal list on success

#### `ProposalsPanel.tsx`
- Main container component
- Shows summary card with total proposals and estimated revenue
- Displays list of all proposals
- Includes add proposal form

### 5. Timeline Integration (`app/api/leads/[leadId]/events/route.ts`)

**Updated to include proposal events:**
- Fetches proposal events from `proposal_events` table
- Converts to timeline format
- Merges with existing lead events
- Shows proposal actions in unified timeline:
  - "Proposal sent — $14,850"
  - "Proposal viewed — homeowner opened the file"
  - "AI marked reply as HOT — ready to schedule"
  - "Auto follow-up scheduled"

## 🎯 How This Helps Roofers Make Money

1. **No proposal slips through the cracks** - Every proposal is tracked
2. **Auto follow-up makes homeowners respond** - SmartSend handles follow-ups automatically
3. **AI knows which proposals are HOT** - Contractors can prioritize and book faster
4. **Timeline shows everything clearly** - All proposal activity in one place
5. **Revenue prediction shows them where the money is** - "Here's $28,600 in HOT proposals sitting in your pipeline"

## 🚀 Setup Instructions

### 1. Run Database Migration

Execute the migration in Supabase SQL Editor:
```bash
supabase/migrations/20250130000003_block22261_proposal_intelligence_v1.sql
```

Or via CLI:
```bash
supabase db push
```

### 2. Deploy Edge Function

```bash
cd supabase
supabase functions deploy classify-proposal-intent
```

### 3. Set Environment Variables

In Supabase Dashboard → Edge Functions → classify-proposal-intent → Settings:

- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key
- `OPENAI_API_KEY` - OpenAI API key for GPT-4o-mini

### 4. Use in UI

Add the ProposalsPanel to any lead detail page:

```tsx
import { ProposalsPanel } from "@/components/proposals/ProposalsPanel";

<ProposalsPanel leadId={leadId} workspaceId={workspaceId} />
```

### 5. Classify Intent (when homeowner replies)

Call the API when a homeowner replies to a proposal:

```typescript
await fetch("/api/proposals/classify-intent", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    proposal_id: proposalId,
    lead_id: leadId,
    workspace_id: workspaceId,
    message: homeownerReplyText,
  }),
});
```

## 📊 Database Schema Summary

### proposals table
- `id` (uuid, primary key)
- `lead_id` (uuid, references leads)
- `workspace_id` (uuid, references workspaces)
- `amount` (numeric, required)
- `proposal_url` (text, optional)
- `status` (text: sent/viewed/considering/approved/declined/expired)
- `sent_at` (timestamptz)
- `viewed_at` (timestamptz, nullable)
- `intent` (text: HOT/WARM/COLD/DECLINE, nullable)
- `confidence` (numeric 0.0-1.0, nullable)
- `notes` (text, nullable)
- `created_at`, `updated_at` (timestamptz)

### proposal_events table
- `id` (uuid, primary key)
- `proposal_id` (uuid, references proposals)
- `lead_id` (uuid, references leads)
- `workspace_id` (uuid, references workspaces)
- `event_type` (text: proposal_sent/proposal_viewed/proposal_followup/proposal_reply)
- `metadata` (jsonb)
- `created_at` (timestamptz)

## 🔄 Auto Follow-Up Logic

When a proposal's intent is updated to WARM or COLD:
1. Trigger fires automatically
2. Creates `proposal_followup` event
3. Metadata includes `auto: true` and `scheduled_at: now() + 24 hours`
4. Can be consumed by follow-up scheduler to send automated messages

## 💰 Revenue Prediction Example

If a contractor has:
- Proposal 1: $15,000, intent: HOT → $12,750 estimated revenue
- Proposal 2: $20,000, intent: WARM → $11,000 estimated revenue
- Proposal 3: $10,000, intent: COLD → $2,000 estimated revenue

**Total Estimated Revenue: $25,750**

This shows contractors exactly where their money is and which proposals to prioritize.

## 🎉 Summary

This block is pure revenue. It turns SmartSend into a proposal-closing machine that:
- Tracks every proposal
- Learns homeowner intent from replies
- Triggers auto follow-up
- Estimates revenue likelihood
- Logs everything in the Lead Timeline

**This is the feature that literally wins them jobs → which means you make money.**









































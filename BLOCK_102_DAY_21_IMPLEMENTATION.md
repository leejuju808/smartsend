# Block 102 — Day 21: Auto-Tune Feedback Loop Implementation

## Overview
This implementation closes the feedback loop so SmartSend learns how to rewrite better based on engagement data (opens, replies, positive replies, meetings). The LLM continuously improves tone + style prompts using real-world feedback.

## Implementation Summary

### ✅ Step 1 — LLM Feedback Table
**File:** `supabase/migrations/20250130000001_ai_rewrite_templates.sql`

Created `llm_rewrite_feedback` table to store performance metrics per variant:
- Tracks `open_rate`, `positive_rate`, `meeting_rate`, and `engagement_score`
- Links to `followup_template_variants` and `campaigns`
- Includes unique constraint on `variant_id` for upsert operations
- RLS policies for secure access

### ✅ Step 2 — Nightly Metric Collector
**File:** `supabase/functions/llm-rewrite-feedback/index.ts`

Edge function that:
- Runs nightly (scheduled at 2 AM)
- Fetches all approved variants
- Aggregates metrics from `message_outcomes` table
- Calculates engagement scores (weighted: 20% open, 60% positive, 20% meeting)
- Upserts feedback entries per variant

**Schedule:** Daily at 2 AM (configured in `supabase/functions/_scheduled/cron.yaml`)

### ✅ Step 3 — Auto-Tune Prompt Builder
**File:** `lib/ai/rewritePromptTuner.ts`

Library function that:
- Analyzes top and bottom performing tones
- Uses GPT-4o-mini to generate improved rewrite guidelines
- Returns JSON with per-tone advice and recommendations
- Focuses on patterns that correlate with high engagement

### ✅ Step 4 — Weekly Retraining Pipeline
**File:** `supabase/functions/llm-rewrite-tuner/index.ts`

Edge function that:
- Runs weekly (Sunday at 3 AM)
- Fetches recent feedback (last 30 days)
- Aggregates by tone
- Calls `tuneRewritePrompt()` to generate new guidelines
- Stores results in `rewrite_guidelines` table with `pending` status
- Logs to `system_logs`

**Schedule:** Weekly on Sunday at 3 AM

### ✅ Step 5 — Rewrite Guidelines Table
**File:** `supabase/migrations/20250130000001_ai_rewrite_templates.sql`

Created `rewrite_guidelines` table:
- Stores tuned prompt guidelines per tone
- Status workflow: `pending` → `active` → `archived`
- Requires human approval before activation
- Tracks version and approval metadata

### ✅ Step 6 — Dashboard Widget
**File:** `app/(dashboard)/campaigns/[id]/ai-learning-status.tsx`

React component that displays:
- Last tuning timestamp
- Engagement scores per tone
- Sample counts
- Uses SWR for data fetching

**API Route:** `app/api/campaigns/[id]/ai-learning/route.ts`

### ✅ Step 7 — Safety Guardrails

#### Human Approval Required
- Guidelines start as `pending` status
- Must be approved via API before activation
- Approval API: `app/api/rewrite-guidelines/[id]/approve/route.ts`

#### Rollback Mechanism
**File:** `supabase/functions/llm-rewrite-rollback/index.ts`

Edge function that:
- Runs weekly (Monday at 4 AM)
- Checks engagement drops > 20% week-over-week
- Automatically rolls back to previous guideline version
- Logs rollback events to `system_logs`

**Schedule:** Weekly on Monday at 4 AM

## Database Schema

### `llm_rewrite_feedback`
```sql
- id (uuid, primary key)
- created_at (timestamptz)
- variant_id (uuid, FK to followup_template_variants)
- campaign_id (uuid, FK to campaigns)
- step_number (int)
- tone (text: formal/casual/humorous/assertive)
- message_count (int)
- open_rate (numeric)
- positive_rate (numeric)
- meeting_rate (numeric)
- engagement_score (numeric)
- prompt (text)
- notes (text)
```

### `rewrite_guidelines`
```sql
- id (uuid, primary key)
- created_at (timestamptz)
- updated_at (timestamptz)
- status (text: pending/active/archived)
- tone (text: formal/casual/humorous/assertive)
- guidelines_json (jsonb)
- version (int)
- approved_by (uuid, FK to auth.users)
- approved_at (timestamptz)
- notes (text)
```

## Scheduled Functions

All scheduled functions are configured in `supabase/functions/_scheduled/cron.yaml`:

1. **llm-rewrite-feedback**: Daily at 2 AM
2. **llm-rewrite-tuner**: Weekly on Sunday at 3 AM
3. **llm-rewrite-rollback**: Weekly on Monday at 4 AM

## Usage

### Viewing AI Learning Status
Add the component to any campaign page:
```tsx
import AILearningStatus from "@/app/(dashboard)/campaigns/[id]/ai-learning-status";

<AILearningStatus campaignId={campaignId} />
```

### Approving Guidelines
```bash
POST /api/rewrite-guidelines/{id}/approve
{
  "user_id": "uuid"
}
```

### Manual Testing

1. **Test Feedback Collection:**
   ```bash
   curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/llm-rewrite-feedback \
     -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
   ```

2. **Test Tuning:**
   ```bash
   curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/llm-rewrite-tuner \
     -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
   ```

3. **Test Rollback:**
   ```bash
   curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/llm-rewrite-rollback \
     -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
   ```

## Smoke Tests Checklist

- [ ] Run nightly job manually → feedback table fills with variant metrics
- [ ] Run tuner → see updated per-tone rewrite guidance JSON
- [ ] Approve and regenerate new tone variants → new rewrites match improved tone traits
- [ ] Dashboard widget shows "Last tuned: <timestamp>" and current engagement per tone
- [ ] Rollback function detects >20% engagement drop and reverts guidelines

## Next Steps

1. **Notifications:** Add Slack/Email notifications when guidelines are ready for approval
2. **Diff View:** Show diff between old and new guidelines in approval UI
3. **A/B Testing:** Compare new guidelines against old ones before full rollout
4. **Analytics Dashboard:** Create dedicated page for AI learning metrics

## Notes

- Engagement score formula: `0.2 * open_rate + 0.6 * positive_rate + 0.2 * meeting_rate`
- Guidelines are versioned and archived (not deleted) for audit trail
- Rollback compares 7-day windows before and after approval
- All operations are logged to `system_logs` for observability
















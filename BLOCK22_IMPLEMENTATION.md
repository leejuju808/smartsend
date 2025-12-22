# SmartSend — Block 22: Lead Scoring & Prioritization

## Overview

Block 22 implements a comprehensive lead scoring and prioritization system that automatically:
- **Tracks engagement events** (opens, clicks, replies, calls, meetings)
- **Computes engagement scores** with exponential time decay
- **Calculates intent scores** from reply sentiment
- **Prioritizes leads** using weighted scores (default: 60% engagement + 40% intent)
- **Smart queue ordering** to send hottest leads first

## What Was Implemented

### 1. Database Schema (`supabase/migrations/20251101_lead_scoring.sql`)

#### Core Tables

- **`lead_events`**: Raw engagement events
  - Event types: `open`, `click`, `reply`, `call`, `meeting`, `unsubscribe`, `bounce`
  - Stores metadata (user-agent, IP, target URLs, etc.)
  - Automatic score recomputation trigger on insert

- **`lead_scores`**: Computed scores per lead
  - `engagement_score`: 0-100 based on recent activity
  - `intent_score`: 0-100 based on reply sentiment
  - `priority`: Weighted combination (default 60/40 split)
  - Auto-updated via triggers

- **`lead_score_weights`**: Configurable weights per org
  - `weight_engagement`: Default 0.6
  - `weight_intent`: Default 0.4
  - `engagement_decay_days`: Default 30

- **`view_lead_priority`**: Unified view of leads + scores
  - Join leads with lead_scores
  - Used for UI display and prioritization

#### RPC Functions

- **`fn_recompute_engagement(p_lead_id)`**: Recalculates engagement score
  - Time-based exponential decay
  - Event weights: Open=1, Click=5, Reply=20, Call=30, Meeting=50
  - Penalties: Unsubscribe=-100, Bounce=-50

- **`fn_update_priority(p_lead_id)`**: Updates weighted priority
  - Uses org-specific weights
  - Combines engagement + intent scores

- **`fn_ensure_lead_score(p_lead_id)`**: Creates missing scores

- **`fn_backfill_lead_scores(p_org_id)`**: Bulk backfill for all leads in org

#### Triggers

- **`trg_lead_events_recompute_scores`**: Auto-updates scores on event insert
  - Calls `fn_recompute_engagement`
  - Calls `fn_update_priority`
  - Ensures score exists

### 2. Edge Function: Lead Intent (`supabase/functions/lead-intent/index.ts`)

Handles event ingestion and intent scoring:

- **Ingests events** from tracking pixels, clicks, replies
- **Recomputes engagement** via database triggers
- **Calculates intent** from reply metadata (rule-based)
- **Updates priority** automatically

Intent scoring (rule-based, can be replaced with LLM):
- Positive keywords → higher score (60-90)
- Negative keywords → lower score (0-20)
- Neutral → 30 baseline

### 3. Queue Ordering (`src/lib/queue/order.ts`)

Smart queue prioritization:

- **`nextJobs(batch, orgId)`**: Fetches top priorities first
  - Joins send_queue with lead_scores
  - Sorts by priority desc, then scheduled_for asc
  - Returns hottest leads first

- **`nextJobsForCampaign(campaignId, batch)`**: Campaign-specific ordering

### 4. Event Recording (`src/lib/leads/recordEvent.ts`)

Helper function to record engagement events:

```typescript
await recordEvent({
  orgId: 'xxx',
  leadId: 'yyy',
  eventType: 'open',
  metadata: { ua: '...', ip: '...' }
});
```

Event types supported:
- `open`: Email opened
- `click`: Link clicked
- `reply`: Reply detected
- `call`: Call logged
- `meeting`: Meeting scheduled
- `unsubscribe`: Unsubscribed
- `bounce`: Bounced

### 5. UI Components

#### LeadTable Updates (`src/app/leads/ui/LeadTable.tsx`)

- **Priority Badge**: Visual indicator (HOT/WARM/COLD)
  - HOT: ≥70 (red)
  - WARM: 40-69 (yellow)
  - COLD: <40 (gray)
- **Score Breakdown**: Engagement + Intent displayed
- **Sorted by Priority**: Highest first
- **Full Name Display**: Shows first_name + last_name

#### API Updates (`src/app/api/leads/list/route.ts`)

- Uses `view_lead_priority` for scores
- Returns priority, engagement_score, intent_score
- Sorts by priority desc

### 6. Event Producers

Wired tracking routes to record lead events:

- **`src/app/api/track/open/route.ts`**: Records 'open' events
- **`src/app/api/track/click/route.ts`**: Records 'click' events

Both routes now:
1. Insert into email_events (existing)
2. Also call lead-intent function to update lead_events
3. Trigger automatic score recomputation

## Scoring Formula

### Engagement Score

```
engagement = Σ (event_weight × decay_factor)

Where:
- event_weight: open=1, click=5, reply=20, call=30, meeting=50
- decay_factor: exp(-time_since_event / decay_days)
- Range: 0-100 (clamped)
- Decay window: 30 days (configurable)
```

### Intent Score

```
intent = sentiment_analysis(reply_text)

Where:
- Positive keywords: 60-90
- Negative keywords: 0-20
- Neutral: 30 (default)
- Range: 0-100
```

### Priority Score

```
priority = (engagement × weight_engagement) + (intent × weight_intent)

Where:
- weight_engagement: 0.6 (default)
- weight_intent: 0.4 (default)
- Range: 0-100 (clamped)
```

## Quick Activate Checklist

### 1. Run Database Migration

```bash
# In Supabase SQL Editor
# Run: supabase/migrations/20251101_lead_scoring.sql
```

### 2. Deploy Edge Function

```bash
supabase functions deploy lead-intent --no-verify-jwt
```

### 3. Backfill Existing Leads (Optional)

```typescript
// In your app or via SQL
select fn_backfill_lead_scores('your-org-id');
```

### 4. Test Event Recording

```typescript
import { recordEvent } from '@/lib/leads/recordEvent';

// Test event
await recordEvent({
  orgId: 'xxx',
  leadId: 'yyy',
  eventType: 'open',
  metadata: { test: true }
});
```

### 5. View Leads Dashboard

Navigate to `/leads` to see:
- Priority badges (HOT/WARM/COLD)
- Engagement scores
- Intent scores
- Leads sorted by priority

### 6. Use Smart Queue (Optional)

Replace your queue processing:

```typescript
// Before
const jobs = await supabase
  .from('send_queue')
  .select('*')
  .order('scheduled_for', { ascending: true })
  .limit(50);

// After
import { nextJobs } from '@/lib/queue/order';
const jobs = await nextJobs(50, orgId);
// Jobs are now sorted by lead priority first
```

## Configuration

### Adjust Scoring Weights

```sql
-- Update weights for an org
update public.lead_score_weights
set 
  weight_engagement = 0.5,
  weight_intent = 0.5,
  engagement_decay_days = 45
where org_id = 'xxx';
```

### Custom Event Weights

Edit `fn_recompute_engagement` in `20251101_lead_scoring.sql`:

```sql
case event_type
  when 'open' then 1.0
  when 'click' then 5.0
  when 'reply' then 20.0
  -- Add your custom weights
```

### Replace Intent Scoring with LLM

Edit `computeIntentScore` in `supabase/functions/lead-intent/index.ts`:

```typescript
async function computeIntentScore(metadata?: Record<string, any>): Promise<number> {
  const replyText = metadata?.reply_text || '';
  
  // Call your LLM API
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [{
        role: 'user',
        content: `Rate the interest level (0-100) in this reply: "${replyText}"`
      }]
    })
  });
  
  // Parse and return intent score
  return parseIntent(response);
}
```

## Testing

### 1. Test Event Recording

```bash
# Via API
curl -X POST https://your-app/functions/v1/lead-intent \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "org_id": "xxx",
    "lead_id": "yyy",
    "event_type": "open"
  }'
```

### 2. Test Score Computation

```sql
-- Create a test event
insert into public.lead_events (org_id, lead_id, event_type)
values ('xxx', 'yyy', 'open');

-- Check scores updated
select * from public.lead_scores where lead_id = 'yyy';
```

### 3. Test Queue Ordering

```typescript
import { nextJobs } from '@/lib/queue/order';
const jobs = await nextJobs(10, orgId);
console.log('Top 10 leads:', jobs.map(j => j.lead_id));
```

### 4. View in Dashboard

1. Navigate to `/leads`
2. Verify priority badges appear
3. Check engagement + intent scores
4. Verify sorting by priority

## Troubleshooting

**Scores not updating?**
- Check `lead_events` table has rows
- Verify trigger `trg_lead_events_recompute_scores` exists
- Check `fn_recompute_engagement` returns without error

**Lead-intent function failing?**
- Verify function deployed: `supabase functions list`
- Check logs: `supabase functions logs lead-intent`
- Ensure `SUPABASE_URL` and `SERVICE_ROLE_KEY` set

**Priority not showing in UI?**
- Verify leads have scores (check `lead_scores` table)
- Ensure API uses `view_lead_priority` view
- Check org_id matches between leads and scores

**Events not recording?**
- Verify tracking routes call lead-intent function
- Check campaign has `org_id` populated
- Ensure Supabase URL and keys correct

## Next Steps

1. **LLM Intent Scoring**: Replace rule-based with GPT-4 classifier
2. **Custom Event Types**: Add domain-specific events (form_submit, demo_request, etc.)
3. **Lead Segmentation**: Auto-tag leads by priority tier
4. **A/B Testing**: Test different weight configurations
5. **Analytics**: Build dashboard for score distribution trends

## Files Created/Modified

### Created
- `supabase/migrations/20251101_lead_scoring.sql` - Database schema
- `supabase/functions/lead-intent/index.ts` - Event ingestion & scoring
- `src/lib/queue/order.ts` - Smart queue ordering
- `src/lib/leads/recordEvent.ts` - Event recording helper
- `src/app/api/leads/priority/route.ts` - Priority API endpoint
- `BLOCK22_IMPLEMENTATION.md` - This file

### Modified
- `src/app/leads/ui/LeadTable.tsx` - Priority badges + scores
- `src/app/api/leads/list/route.ts` - Use view_lead_priority + sorting
- `src/app/api/track/open/route.ts` - Wire lead event recording
- `src/app/api/track/click/route.ts` - Wire lead event recording

---

✅ **Block 22 Complete**: Lead Scoring & Prioritization is ready to ship!


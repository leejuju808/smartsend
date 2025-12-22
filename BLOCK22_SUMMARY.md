# SmartSend — Block 22: Lead Scoring & Prioritization - Summary

## ✅ Completed Implementation

### Database Schema
- ✅ `lead_events` table for raw engagement tracking
- ✅ `lead_scores` table for computed scores (engagement, intent, priority)
- ✅ `lead_score_weights` table for configurable per-org weights
- ✅ `view_lead_priority` view for unified lead + score display
- ✅ RPC functions: `fn_recompute_engagement`, `fn_update_priority`, `fn_ensure_lead_score`, `fn_backfill_lead_scores`
- ✅ Trigger to auto-update scores on event insert

### Edge Function
- ✅ `lead-intent` function for event ingestion and intent scoring
- ✅ Rule-based intent scoring (can be upgraded to LLM)

### Queue Ordering
- ✅ `nextJobs()` helper to prioritize by lead score
- ✅ `nextJobsForCampaign()` for campaign-specific ordering

### Event Recording
- ✅ `recordEvent()` helper function for tracking events
- ✅ Wired open tracking to record 'open' events
- ✅ Wired click tracking to record 'click' events

### UI Components
- ✅ Updated LeadTable with priority badges (HOT/WARM/COLD)
- ✅ Display engagement + intent scores
- ✅ Sorting by priority (highest first)
- ✅ TopLeadsWidget for dashboard display

### API Updates
- ✅ `/api/leads/list` uses view_lead_priority with scoring
- ✅ `/api/leads/priority` endpoint for top leads

### Documentation
- ✅ Comprehensive implementation guide (BLOCK22_IMPLEMENTATION.md)
- ✅ Quick start checklist
- ✅ Troubleshooting guide

## 🚀 Quick Start

### 1. Run Migration
```sql
-- In Supabase SQL Editor
-- Run: supabase/migrations/20251101_lead_scoring.sql
```

### 2. Deploy Edge Function
```bash
supabase functions deploy lead-intent --no-verify-jwt
```

### 3. Backfill Existing Leads (Optional)
```sql
select fn_backfill_lead_scores('your-org-id');
```

### 4. View Results
Navigate to `/leads` to see priority badges and scores

## 📊 Scoring Overview

### Engagement Score (0-100)
- Open = 1 point
- Click = 5 points
- Reply = 20 points
- Call = 30 points
- Meeting = 50 points
- Unsubscribe = -100 penalty
- Bounce = -50 penalty
- Exponential decay over 30 days (configurable)

### Intent Score (0-100)
- Rule-based sentiment analysis of replies
- Positive keywords → 60-90
- Negative keywords → 0-20
- Neutral baseline → 30
- Can be upgraded to LLM classifier

### Priority Score (0-100)
- Weighted combination: (60% engagement + 40% intent)
- Per-org configurable weights
- Used for queue prioritization

## 📁 Files

### Created
- `supabase/migrations/20251101_lead_scoring.sql`
- `supabase/functions/lead-intent/index.ts`
- `src/lib/queue/order.ts`
- `src/lib/leads/recordEvent.ts`
- `src/app/api/leads/priority/route.ts`
- `src/components/dashboard/TopLeadsWidget.tsx`
- `BLOCK22_IMPLEMENTATION.md`
- `BLOCK22_SUMMARY.md` (this file)

### Modified
- `src/app/leads/ui/LeadTable.tsx`
- `src/app/api/leads/list/route.ts`
- `src/app/api/track/open/route.ts`
- `src/app/api/track/click/route.ts`

## 🎯 Key Features

1. **Automatic Scoring**: Events trigger score recomputation via triggers
2. **Configurable Weights**: Per-org customization of scoring formula
3. **Time Decay**: Recent events weighted more heavily
4. **Queue Prioritization**: Smart ordering to send hottest leads first
5. **Visual Indicators**: HOT/WARM/COLD badges for quick identification
6. **Intent Analysis**: Reply sentiment scoring (upgradeable to LLM)

## 🔄 Event Flow

1. Lead opens email → `track/open` route records event
2. Event inserted into `lead_events` table
3. Trigger fires → calls `fn_recompute_engagement`
4. Engagement score computed with time decay
5. Priority updated via `fn_update_priority`
6. UI displays updated scores in real-time
7. Queue ordering uses priority for smart send ordering

## 🧪 Testing

```bash
# Test event recording
curl -X POST https://your-app/functions/v1/lead-intent \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "org_id": "xxx",
    "lead_id": "yyy",
    "event_type": "open"
  }'

# Check scores
# In SQL Editor
select * from public.lead_scores where lead_id = 'yyy';
```

## 📈 Next Steps

1. Replace rule-based intent with LLM classifier
2. Add custom event types (form_submit, demo_request, etc.)
3. Create lead segmentation by priority tier
4. Build analytics dashboard for score trends
5. A/B test different weight configurations

---

**Ready to ship!** 🚀


# Block 22141 — SmartSend Roofing "Lead Source Performance Engine v1"

📊🧠 The AI system that automatically ranks, grades, and routes every lead source based on actual revenue, quality, tone, momentum, risk, and win-rate — NOT guesses.

## Overview

This is one of the most PROFIT-GENERATING features in the entire SmartSend ecosystem. Roofers CONSTANTLY waste money because they:

- don't know which lead sources perform
- send best leads to the wrong estimator
- overpay for bad sources
- under-invest in high-performing channels
- have no clue which source produces quality conversations
- can't see long-term revenue patterns
- don't understand real close-rate by source
- don't track homeowner sentiment across sources

SmartSend fixes all of this.

## What Was Built

### 1. Database Schema (`20250130000001_block_22141_lead_source_performance_engine_v1.sql`)

#### `lead_source_stats` Table
Stores aggregated performance metrics for each lead source per workspace with the 12-signal system:

**Core Revenue Metrics:**
- `total_leads`, `leads_won`, `revenue_won`, `avg_job_size`, `close_rate`

**Intelligence Metrics:**
- `avg_health`, `avg_momentum`, `avg_experience`, `avg_risk`

**Behavior Metrics:**
- `ghosting_rate`, `dropoff_rate`, `avg_days_to_close`

**Estimator Compatibility:**
- `best_estimator_id`, `best_estimator_performance`

**Grade:**
- `grade` (A+/A/B/C/D/F) - auto-calculated

#### `lead_source_performance_view` Materialized View
Real-time aggregated view that calculates all metrics from the `leads` table. Refreshed by edge function.

#### `lead_source_recommendations` Table
Stores AI-generated recommendations for optimizing each source:
- `recommendation_type`: increase_budget, decrease_budget, stop_buying, move_spend, change_routing, optimize_followup, improve_quality
- `recommendation_text`: Human-readable recommendation
- `priority`: low, medium, high, critical
- `supporting_data`: JSONB with supporting metrics

#### `lead_source_routing_rules` Table
Stores intelligent routing rules for leads based on source:
- `routing_strategy`: best_performer, highest_value, fastest_response, insurance_specialist, persistence_strong, manual
- `default_estimator_id`: Manual assignment
- `min_job_value`: Minimum value threshold for routing
- `is_active`: Enable/disable routing rule

### 2. Edge Function (`supabase/functions/lead-source-grade/index.ts`)

Auto-grades every lead source A-F based on the 12-signal system:

**Scoring Formula:**
- Core Revenue Metrics (40%): close_rate (20%), avg_job_size (10%), revenue_won (10%)
- Intelligence Metrics (35%): avg_health (15%), avg_momentum (10%), avg_experience (10%)
- Risk Penalty (10%): avg_risk (-10%)
- Behavior Penalties (15%): ghosting_rate (-10%), dropoff_rate (-5%)
- Volume Bonus: +5 points for sources with 10+ leads

**Grade Thresholds:**
- A+: score >= 85
- A: score >= 75
- B: score >= 60
- C: score >= 40
- D: score >= 25
- F: score < 25

**Features:**
- Refreshes materialized view
- Calculates grades for all sources
- Finds best estimator per source
- Generates AI recommendations
- Updates `lead_source_stats` table

### 3. API Routes

#### `GET /api/lead-source/performance`
Fetches comprehensive lead source performance data including:
- Stats with grades
- Recommendations grouped by source
- Routing rules

#### `POST /api/lead-source/performance/grade`
Triggers grading calculation for lead sources (calls edge function)

#### `GET /api/lead-source/stats` (Updated)
Updated to use new schema with `source_name` instead of `source`

### 4. Frontend Component (`components/dashboard/LeadSourcePerformanceEngine.tsx`)

Beautiful dashboard table showing:
- Lead Source name
- Grade badge (A+/A/B/C/D/F) with color coding
- Close Rate with days-to-close
- Average Job Size
- Ghosting Rate (color-coded)
- Momentum Score with trend indicator
- Total Revenue
- AI Recommendations with priority icons

Features:
- Auto-refresh capability
- Sortable by grade and revenue
- Responsive design
- Real-time data fetching

### 5. Routing Logic (`lib/lead-source-routing.ts`)

Intelligent routing functions:

**`routeLeadBySource()`**
Routes leads to the best estimator based on:
- Source performance stats
- Routing rules configuration
- Strategy selection (best_performer, highest_value, insurance_specialist, persistence_strong, manual)

**`autoAssignEstimator()`**
Automatically assigns estimator to a lead based on source performance.

## Lead Sources Supported

- Website
- Facebook
- Google Ads
- LSA (Google Local Services)
- HomeAdvisor / Angi
- Referrals
- Yard Sign
- Storm Campaign
- Canvassing
- Solar Cross-Lead
- Insurance Agent referral
- Third-party lead buyers
- TikTok organic
- YouTube organic
- Cold Email responses
- Other
- Unknown

## How It Works

1. **Data Collection**: As leads come in, they're tagged with `lead_source`
2. **View Refresh**: Materialized view aggregates metrics from all leads
3. **Grading**: Edge function calculates grades A-F based on 12-signal system
4. **Recommendations**: AI generates actionable recommendations per source
5. **Routing**: Intelligent routing assigns leads to best-performing estimators
6. **Dashboard**: Owners see real-time performance and recommendations

## Example Recommendations

**High-Performing Sources (A/A+):**
- "Google Ads produces high-value jobs ($18,400 avg) with a 32% close rate. Consider increasing budget allocation."
- "Referrals close fast (2.8 days avg). Route these leads to your fastest-responding estimator."

**Low-Performing Sources (D/F):**
- "HomeAdvisor has a 3% close rate and 78% ghosting rate. Consider discontinuing or significantly reducing spend."
- "Facebook shows high risk scores (65). These leads may need more careful handling or qualification."

**Medium Sources (B/C):**
- "LSA has a 45% ghosting rate. Implement faster follow-up sequences to reduce ghosting."

## Setup Instructions

### 1. Run Migration

```sql
-- Run in Supabase SQL Editor
-- File: supabase/migrations/20250130000001_block_22141_lead_source_performance_engine_v1.sql
```

### 2. Deploy Edge Function

```bash
cd supabase
supabase functions deploy lead-source-grade
```

### 3. Set Environment Variables

In Supabase Dashboard → Edge Functions → Settings:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key

### 4. Schedule Grading (Optional)

Set up a cron job to run grading daily:

```sql
SELECT cron.schedule(
  'lead-source-grade-daily',
  '0 2 * * *', -- 2 AM daily
  $$
  SELECT net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/lead-source-grade',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <service-role-key>"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

### 5. Add Component to Dashboard

```tsx
import { LeadSourcePerformanceEngine } from "@/components/dashboard/LeadSourcePerformanceEngine";

// In your dashboard page:
<LeadSourcePerformanceEngine />
```

## Usage

### Trigger Grading Manually

```typescript
// From frontend
await fetch("/api/lead-source/performance/grade", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ workspace_id: workspaceId }),
});
```

### Use Routing Logic

```typescript
import { routeLeadBySource, autoAssignEstimator } from "@/lib/lead-source-routing";

// Route a lead
const routing = await routeLeadBySource(workspaceId, "Referrals", 25000);
console.log(routing.estimator_id, routing.reason);

// Auto-assign estimator
const result = await autoAssignEstimator(leadId, workspaceId, "Google Ads", 18000);
```

## Benefits

✅ **Stops wasting money** on garbage leads  
✅ **Shows which sources** produce angry homeowners  
✅ **Highlights where big jobs** come from  
✅ **Increases close rate** by aligning source → estimator  
✅ **Coaches owners** how to spend  
✅ **Works with ZERO setup** - data feeds itself  
✅ **Creates a MAJOR WOW** in demos  

## Why This Block Is Critical

Because:
- It proves SmartSend thinks like a business partner
- It produces DIRECTLY measurable ROI
- It saves roofers money
- It increases revenue
- It deepens intelligence across the entire system
- It becomes a differentiator vs all competitors

This is one of your FLAGSHIP intelligence modules.

## Future Enhancements

- Historical trend analysis (30/60/90 day comparisons)
- Budget allocation recommendations
- Source-to-source comparison charts
- Estimator performance by source matrix
- Automated budget reallocation suggestions
- Integration with marketing platforms (Google Ads, Facebook Ads API)










































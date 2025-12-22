# Revenue Autopilot Implementation

## Overview

The Revenue Autopilot system is an AI-driven pricing and upsell engine that automatically optimizes revenue by:
- Adjusting plan pricing tiers in real-time based on usage + demand
- Offering in-app personalized upgrade prompts
- Allocating discounts or bundles to retain high-value orgs
- Logging all revenue actions for analytics

## Components Implemented

### 1. Database Tables

**Migration:** `supabase/migrations/20250220000000_revenue_autopilot.sql`

#### `org_usage_stats`
Daily aggregate table tracking organization usage metrics:
- `org_id` (primary key)
- `emails_sent` (int)
- `workflows_run` (int)
- `agents_deployed` (int)
- `mrr` (numeric)
- `last_updated` (timestamptz)

#### `pricing_actions`
AI-generated pricing suggestions:
- `id` (uuid, primary key)
- `org_id` (uuid, references orgs)
- `action` (text: 'keep' | 'upgrade' | 'discount')
- `reason` (text)
- `new_price` (numeric, nullable)
- `created_at` (timestamptz)

### 2. Supabase Edge Function

**Location:** `supabase/functions/revenue-autopilot/index.ts`

**Purpose:** Analyzes org usage stats and generates AI pricing suggestions using GPT-4o-mini.

**How it works:**
1. Fetches all org usage stats
2. For each org, sends usage data to OpenAI with a pricing analysis prompt
3. Receives JSON response with action (keep/upgrade/discount), reason, and optional new_price
4. Stores pricing action in `pricing_actions` table

**Schedule:** Should be run weekly (Monday at 5 AM):
```bash
supabase functions schedule create revenue-autopilot --cron "0 5 * * 1"
```

### 3. API Endpoints

#### `/api/pricing-suggestion`
- **Method:** GET
- **Purpose:** Fetch latest pricing suggestion for current user's org
- **Response:** `{ suggestion: PricingSuggestion | null, org_id: string }`

#### `/api/revenue-metrics`
- **Method:** GET
- **Purpose:** Get aggregate revenue metrics for HQ dashboard
- **Response:** 
  ```json
  {
    "mrr": number,
    "arr": number,
    "upgrades": number,
    "discounts": number,
    "recentActions": {
      "keep": number,
      "upgrade": number,
      "discount": number
    }
  }
  ```

### 4. UI Components

#### Billing Pages Integration
- **Files Updated:**
  - `src/app/dashboard/billing/page.tsx`
  - `src/components/EnhancedBillingPage.tsx`

**Features:**
- Shows AI upgrade recommendation banner (amber) when `action === "upgrade"`
- Shows discount offer banner (emerald) when `action === "discount"`
- Includes reason from AI analysis
- Direct upgrade button integration

#### Revenue Dashboard
- **Location:** `src/app/aurev-hq/dashboard/revenue/page.tsx`
- **Features:**
  - Total MRR and ARR display
  - Upgrade suggestions count (last 30 days)
  - Discount offers count (last 30 days)
  - Recent pricing actions breakdown (last 7 days)

### 5. Helper Functions

#### `update_org_usage_stats()`
SQL function to update or insert org usage statistics:
```sql
SELECT public.update_org_usage_stats(
  p_org_id := '...',
  p_emails_sent := 100,
  p_workflows_run := 5,
  p_agents_deployed := 2,
  p_mrr := 99.00
);
```

## Setup Instructions

### 1. Run Migration
```bash
supabase migration up
```

### 2. Deploy Edge Function
```bash
supabase functions deploy revenue-autopilot
```

### 3. Schedule Function
```bash
supabase functions schedule create revenue-autopilot --cron "0 5 * * 1"
```

### 4. Populate `org_usage_stats`

You'll need to create a cron job or scheduled function to populate `org_usage_stats` daily. This can be done by:

**Option A: Create a cron API route** (`src/app/api/cron/update-org-stats/route.ts`) that:
1. Aggregates emails sent per org (from send logs/campaigns)
2. Counts workflows run per org (from automation/workflow logs)
3. Counts agents deployed per org (from agents table)
4. Calculates MRR per org (from Stripe subscriptions)
5. Calls `update_org_usage_stats()` for each org

**Option B: Create a Supabase Edge Function** (`supabase/functions/daily-org-stats/index.ts`) that does the same aggregation.

**Example SQL aggregation:**
```sql
-- Emails sent per org (last 30 days)
SELECT 
  org_id,
  COUNT(*) as emails_sent
FROM send_logs
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY org_id;

-- Workflows run per org (last 30 days)
SELECT 
  org_id,
  COUNT(*) as workflows_run
FROM automation_runs
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY org_id;

-- Agents deployed per org
SELECT 
  org_id,
  COUNT(*) as agents_deployed
FROM agents
WHERE is_active = true
GROUP BY org_id;
```

### 5. Environment Variables Required
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`

## Target Outcomes

| Metric | Before | After Target |
|--------|--------|--------------|
| MRR | $85K | $120K+ ($1.4M ARR) |
| Upgrade Rate | 18% | 30%+ |
| Churn | 3% | <2% |

## Next Steps

1. **Populate Initial Data:** Run aggregation queries to backfill `org_usage_stats` for existing orgs
2. **Set up Daily Aggregation:** Create cron job to update `org_usage_stats` daily
3. **Monitor AI Suggestions:** Review pricing actions in HQ dashboard
4. **Tune AI Prompts:** Adjust prompt in `revenue-autopilot` function based on results
5. **Test Upgrade Flow:** Ensure upgrade buttons work correctly with Stripe

## Notes

- The AI model uses `gpt-4o-mini` for cost efficiency
- Pricing actions are logged for analytics but not automatically applied
- MRR calculation should sync with Stripe subscriptions
- The system respects RLS policies for org data access










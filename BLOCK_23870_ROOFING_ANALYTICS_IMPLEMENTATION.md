# Block 23870 — SmartSend Roofing Analytics + Insights v1

## Implementation Summary

This block implements a comprehensive analytics system specifically designed for roofing companies. The system focuses on **money-focused metrics** that roofers actually care about, not technical vanity metrics.

## What Was Built

### 1. Database Schema (`supabase/migrations/20250130000002_block23870_roofing_analytics_v1.sql`)

**Tables Created:**
- `analytics_dashboard_metrics` - Stores the 6 core metrics per workspace
- `analytics_campaign_scores` - Campaign performance grades (A, B, C, D)
- `analytics_insights` - AI-generated insights for roofers
- `analytics_revenue_estimates` - Estimated revenue per lead
- `analytics_upgrade_prompts` - Tracks upgrade prompts shown to users
- `analytics_daily_metrics` - Daily aggregated metrics for trends

**Helper Functions:**
- `calculate_campaign_grade()` - Calculates A/B/C/D grade based on performance
- `calculate_lead_revenue()` - Calculates estimated revenue for a lead
- `get_lead_workspace_id()` - Helper to get workspace from lead

**Views:**
- `v_dashboard_metrics_current` - Current dashboard metrics
- `v_campaign_performance_summary` - Campaign performance summary
- `v_active_insights` - Active (non-dismissed) insights
- `v_revenue_summary` - Revenue summary by workspace

### 2. API Endpoints

#### `/api/analytics/dashboard` (GET)
Returns the 6 core dashboard metrics:
1. Replies Received
2. Leads Created (HOT/WARM)
3. Booked Estimates
4. Estimated Job Value
5. Campaign Performance Score (A/B/C/D)
6. Activity Timeline

#### `/api/analytics/insights` (GET)
Returns secondary metrics and insights:
- Open rate trends (7d/30d)
- Reply type breakdown
- Best campaign of the month
- Underperforming campaign alerts
- Seasonal opportunities
- AI-generated insights

#### `/api/analytics/revenue` (GET)
Returns estimated revenue breakdown:
- Hot leads count & value
- Warm leads count & value
- Total projected value
- Booked estimates count

#### `/api/analytics/upgrade-prompts` (GET/POST)
- GET: Returns upgrade prompts based on analytics triggers
- POST: Dismiss or handle upgrade prompts

#### `/api/analytics/generate-insights` (POST)
Generates AI insights based on current metrics:
- Hot leads alerts
- Campaign performance comparisons
- Growth opportunities
- Open rate drop alerts

#### `/api/cron/calculate-analytics` (POST)
Background job to calculate and store metrics:
- Calculates dashboard metrics for all workspaces
- Calculates daily metrics for trend analysis
- Should be run periodically (e.g., daily via cron)

### 3. Frontend Components

#### `RoofingDashboard` (`src/components/analytics/RoofingDashboard.tsx`)
Main dashboard showing the 6 core metrics:
- Large, visual cards for each metric
- Period selector (all_time, 7d, 30d, 90d)
- Breakdown of hot/warm/questions/not interested
- Activity timeline preview

#### `InsightsView` (`src/components/analytics/InsightsView.tsx`)
Secondary insights view:
- AI-generated insights with priority badges
- Open rate trend chart
- Reply type breakdown
- Best campaign highlight
- Underperforming campaign alerts
- Seasonal opportunities

#### `RevenueView` (`src/components/analytics/RevenueView.tsx`)
Revenue estimation view:
- Total projected value (big number)
- Hot leads breakdown with top leads
- Warm leads breakdown with top leads
- Booked estimates count
- Retention message explaining why this matters

#### `UpgradePrompts` (`src/components/analytics/UpgradePrompts.tsx`)
Upgrade prompts component:
- Shows prompts based on analytics triggers
- Dismissible prompts
- Direct upgrade buttons
- Priority-based styling

#### Analytics Page (`src/app/(dashboard)/analytics/page.tsx`)
Main analytics page combining all views:
- Upgrade prompts at top
- Main dashboard
- Tabbed interface for insights/revenue

## The 6 Core Metrics

1. **Replies Received** - Total replies across all campaigns
2. **Leads Created** - HOT + WARM leads (SmartSend-labeled)
3. **Booked Estimates** - Manual or auto-synced appointments
4. **Estimated Job Value** - Calculated revenue (HOT × ticket + WARM × ticket × 0.25)
5. **Campaign Performance Score** - Simple A/B/C/D grade
6. **Activity Timeline** - Feed of recent SmartSend activity

## Revenue Calculation Logic

- **HOT Leads**: 100% conversion probability × average ticket price
- **WARM Leads**: 25% conversion probability × average ticket price
- **Default Ticket Price**: $12,000 (configurable per user)

Example:
- 3 HOT leads × $12,000 = $36,000
- 6 WARM leads × $12,000 × 0.25 = $18,000
- **Total**: $54,000 projected value

## Upgrade Prompts Logic

### Starter → Growth
Triggers:
- Approaching email limit (450+ of 500)
- Reached campaign limit (1 active campaign)
- High performance (open rate >25%, reply rate >4%)

### Growth → Domination
Triggers:
- Multiple campaigns active (2+ of 3)
- High reply volume (>50 replies/month)

## Campaign Performance Grades

- **A**: Open rate ≥30% AND reply rate ≥5% AND conversion ≥2%
- **B**: Open rate ≥20% AND reply rate ≥3% AND conversion ≥1%
- **C**: Open rate ≥10% AND reply rate ≥1%
- **D**: Everything else

## AI Insights Types

1. **lead_alert** - Hot leads waiting (urgent priority)
2. **performance_comparison** - Campaign outperforming others
3. **growth_opportunity** - Suggestions to add more contacts
4. **campaign_recommendation** - Suggestions to improve campaigns
5. **storm_opportunity** - Seasonal weather opportunities (placeholder)

## Setup Instructions

1. **Run Migration:**
   ```sql
   -- Run the migration file
   supabase/migrations/20250130000002_block23870_roofing_analytics_v1.sql
   ```

2. **Set Up Cron Job:**
   - Configure `/api/cron/calculate-analytics` to run daily
   - Add `CRON_SECRET` environment variable
   - Set up cron job or scheduled function to call this endpoint

3. **Configure Average Ticket Price:**
   - Users can set their average ticket price in settings
   - Defaults to $12,000 if not set
   - Used for revenue calculations

4. **Access Analytics:**
   - Navigate to `/analytics` in the dashboard
   - Metrics are calculated on-demand and cached in database

## Key Features

✅ **Money-focused** - Shows revenue, not vanity metrics
✅ **Simple** - 6 core metrics, easy to understand
✅ **Visual** - Charts and cards, not tables
✅ **Job-outcome oriented** - Tied to booked estimates and revenue
✅ **Not technical** - No CTR, deliverability charts, domain reputation
✅ **Retention booster** - Shows roofers the money SmartSend is generating
✅ **Upgrade driver** - Automatically suggests upgrades based on usage

## Business Value

- **More upgrades** - Analytics drive upgrade prompts
- **More customer confidence** - Roofers see their ROI
- **Less churn** - Revenue visibility = retention
- **Better onboarding** - Clear value demonstration
- **Increased engagement** - Roofers check analytics regularly
- **Competitive moat** - Data becomes a differentiator
- **Agency sales tool** - Agencies use analytics to sell SmartSend

## Next Steps

1. Integrate weather API for seasonal opportunities
2. Add more AI insight types based on patterns
3. Create email reports of analytics
4. Add comparison to industry benchmarks
5. Implement real-time updates via websockets
6. Add export functionality for reports

## Files Created/Modified

**Database:**
- `supabase/migrations/20250130000002_block23870_roofing_analytics_v1.sql`

**API Routes:**
- `src/app/api/analytics/dashboard/route.ts`
- `src/app/api/analytics/insights/route.ts`
- `src/app/api/analytics/revenue/route.ts`
- `src/app/api/analytics/upgrade-prompts/route.ts`
- `src/app/api/analytics/generate-insights/route.ts`
- `src/app/api/cron/calculate-analytics/route.ts`

**Components:**
- `src/components/analytics/RoofingDashboard.tsx`
- `src/components/analytics/InsightsView.tsx`
- `src/components/analytics/RevenueView.tsx`
- `src/components/analytics/UpgradePrompts.tsx`

**Pages:**
- `src/app/(dashboard)/analytics/page.tsx`

## Testing Checklist

- [ ] Dashboard loads and shows 6 core metrics
- [ ] Period selector works (all_time, 7d, 30d, 90d)
- [ ] Revenue calculations are correct
- [ ] Campaign grades are calculated correctly
- [ ] Upgrade prompts appear when triggers are met
- [ ] AI insights are generated and displayed
- [ ] Activity timeline shows recent events
- [ ] Cron job calculates metrics correctly
- [ ] RLS policies prevent unauthorized access







































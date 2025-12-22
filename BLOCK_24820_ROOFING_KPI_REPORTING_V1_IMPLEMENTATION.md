# Block 24820 — SmartSend Roofing Reporting & KPIs v1 Implementation

## Overview

This implementation delivers **THE FULL ROOFING KPI ENGINE — ZERO FLUFF** for SmartSend. This transforms SmartSend into a roofing analytics system that helps owners understand their business performance instantly.

Roofers typically cannot answer basic questions about their business. SmartSend fixes this by giving real KPIs, clean trends, and true forecasting.

## What Was Built

### 1. Database Migration
**File:** `supabase/migrations/20250130000001_block24820_roofing_kpi_reporting_v1.sql`

#### Views Created:
- **`lead_close_funnel`** - Lead → Close funnel metrics showing conversion rates at each stage
- **`revenue_summary`** - Revenue metrics for this week, this month, and year-to-date
- **`crew_metrics`** - Crew performance metrics including jobs completed, duration, issue rate, and scorecard
- **`supplier_metrics`** - Supplier performance metrics including on-time delivery rate, accuracy, and overall score
- **`insurance_kpis`** - Insurance job metrics including ACV collection, supplement approval rates, and average values
- **`neighborhood_performance`** - Neighborhood performance by revenue, reply rate, and job value

#### Functions Created:
- **`forecast_revenue(p_workspace_id, p_days_ahead)`** - AI-powered revenue forecasting based on pipeline, close rates, and job values
- **`owner_kpi_snapshot(p_workspace_id)`** - Executive KPI snapshot with top-level business metrics
- **`generate_ai_insights(p_workspace_id)`** - Auto-generated AI insights and action items

### 2. API Endpoint
**File:** `app/api/kpis/route.ts`

Returns comprehensive KPI data including:
- Lead funnel metrics
- Revenue summary
- Forecasting data
- Crew metrics
- Supplier metrics
- Insurance KPIs
- Neighborhood performance
- Owner snapshot
- AI insights

### 3. Frontend Components

#### Main Dashboard Component
**File:** `src/components/kpis/RoofingKPIDashboard.tsx`

Main component that orchestrates all KPI panels and displays them in a grid layout.

#### Panel Components (8 Core Panels + 2 Additional)

1. **Owner KPI Snapshot** (`src/components/kpis/panels/OwnerKPISnapshot.tsx`)
   - Executive view with top-level KPIs
   - Shows: Jobs Active, Jobs At Risk, Completed This Month, Revenue, Outstanding, Supplement Approval Rate, Crew Efficiency, Supplier Reliability

2. **Lead → Close Funnel** (`src/components/kpis/panels/LeadCloseFunnelPanel.tsx`)
   - Shows full lifecycle: Leads → Inspections → Quotes → Approved → Scheduled → Completed
   - Auto-calculated conversion rates at each stage

3. **Revenue Summary** (`src/components/kpis/panels/RevenueSummaryPanel.tsx`)
   - This Week: Revenue Collected, Outstanding, Jobs Completed, Avg Job Value
   - This Month: Revenue, Projection, Jobs Completed, Avg Job Value
   - Year-to-Date: Total Revenue, Avg Monthly Revenue

4. **Forecasting Engine** (`src/components/kpis/panels/ForecastingPanel.tsx`)
   - AI-powered forecasting for next 30 and 90 days
   - Risk level assessment
   - Forecast drivers breakdown

5. **Crew Metrics** (`src/components/kpis/panels/CrewMetricsPanel.tsx`)
   - Performance KPIs for each crew
   - Jobs Completed, Avg Duration, Issue Rate, Documentation Score, Homeowner Rating, Scorecard

6. **Supplier Metrics** (`src/components/kpis/panels/SupplierMetricsPanel.tsx`)
   - Performance metrics for each supplier
   - On-Time Delivery Rate, Accuracy Rate, Avg Delay, Overall Score

7. **Insurance KPIs** (`src/components/kpis/panels/InsuranceKPIsPanel.tsx`)
   - Insurance jobs count, ACV collected
   - Supplements: Submitted, Approved, Denied, Approval Rate
   - Financials: Avg Supplement Value, Avg Insurance Job Value, Depreciation Outstanding

8. **Neighborhood Performance** (`src/components/kpis/panels/NeighborhoodPerformancePanel.tsx`)
   - Top 3 neighborhoods by revenue
   - Top by reply rate
   - Top by job value

9. **AI Insights** (`src/components/kpis/panels/AIInsightsPanel.tsx`)
   - Auto-generated action items and insights
   - Priority-based color coding
   - Actionable recommendations

### 4. Reporting Page
**File:** `app/(dashboard)/reports/page.tsx`

Main reporting page that displays the full KPI dashboard.

## Features

### 8 Core KPI Panels

1. **Lead → Close Funnel** - Shows where roofers are losing money in the sales process
2. **Revenue Summary** - Real numbers for this week, this month, and year-to-date
3. **Forecasting Engine** - AI-powered revenue predictions for next 30/90 days
4. **Crew Metrics** - Performance tracking for each crew with scorecards
5. **Supplier Metrics** - Supplier reliability and performance tracking
6. **Insurance KPIs** - Insurance job metrics including supplements and ACV
7. **Neighborhood Performance** - Top performing areas by revenue and conversion
8. **Owner KPI Snapshot** - Executive view with top-level metrics

### AI Insights

Auto-generated action items including:
- Follow up on pending quotes
- Crew issue rate warnings
- Hot neighborhood opportunities
- Stuck ACV alerts
- Install schedule imbalances

## Why Roofers Will Love This

- **Clarity** - Finally see real numbers instead of guessing
- **Control** - Understand where money is being lost
- **Confidence** - Data-driven decision making
- **Growth Roadmap** - See opportunities for improvement
- **Predictable Revenue** - Forecasting helps plan ahead
- **Understanding** - See the full picture of their business

## How Reporting & KPIs Lock Roofers Into SmartSend

Roofers won't cancel SmartSend because:
- It exposes real problems
- It reveals growth opportunities
- It tracks team performance
- It explains revenue
- It predicts the next 90 days
- It centralizes their entire business data

SmartSend becomes "The way they understand their business."

## Technical Details

### Database Views
All views are workspace-scoped and use RLS policies for security.

### API Authentication
Uses Supabase authentication to get current user and workspace.

### Real-time Updates
Dashboard refreshes every 60 seconds to show live data.

### Performance
All queries are optimized with proper indexes and use efficient aggregations.

## Next Steps

1. Run the migration: `supabase db reset` or apply the migration file
2. Navigate to `/reports` to see the dashboard
3. Customize insights and forecasting logic as needed
4. Add more panels or metrics based on user feedback

## Files Created

- `supabase/migrations/20250130000001_block24820_roofing_kpi_reporting_v1.sql`
- `app/api/kpis/route.ts`
- `src/components/kpis/RoofingKPIDashboard.tsx`
- `src/components/kpis/panels/OwnerKPISnapshot.tsx`
- `src/components/kpis/panels/LeadCloseFunnelPanel.tsx`
- `src/components/kpis/panels/RevenueSummaryPanel.tsx`
- `src/components/kpis/panels/ForecastingPanel.tsx`
- `src/components/kpis/panels/CrewMetricsPanel.tsx`
- `src/components/kpis/panels/SupplierMetricsPanel.tsx`
- `src/components/kpis/panels/InsuranceKPIsPanel.tsx`
- `src/components/kpis/panels/NeighborhoodPerformancePanel.tsx`
- `src/components/kpis/panels/AIInsightsPanel.tsx`
- `app/(dashboard)/reports/page.tsx`

## Dependencies

- Next.js App Router
- React
- SWR for data fetching
- Supabase for database and authentication
- Tailwind CSS for styling







































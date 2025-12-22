# Block 25380 — SmartSend Roofing Reporting & Analytics v1 Implementation

## 🎯 Mission

**THE ROOFING ANALYTICS ENGINE — ZERO FLUFF.**

Roofers make decisions based on guessing, not data. SmartSend Reporting & Analytics v1 gives roofers total visibility into every part of their business. This is how SmartSend becomes the brain of the roofing company.

## ✅ Implementation Complete

### 1. Database Migration (`20250215000000_block25380_roofing_reporting_analytics_v1.sql`)

#### Core Tables Created:

**A) Lead Analytics**
- `lead_conversions` - Tracks lead conversion through sales funnel (lead → inspection → quote → job)
- Enhanced `leads` table with source tracking, quality scores, response times, and assignment

**B) Job Analytics**
- `job_stage_history` - Tracks time spent in each pipeline stage
- `job_delays` - Tracks job delays by type (weather, materials, crew, insurance, etc.)

**C) Revenue Forecasting**
- `revenue_forecasts` - Revenue forecasting based on pipeline, close rates, and seasonality

**D) Marketing ROI**
- `marketing_roi` - Marketing ROI tracking by campaign type and source

**E) Analytics Alerts**
- `analytics_alerts` - Proactive alerts based on analytics metrics

#### Views Created:

1. **`v_lead_analytics_by_source`** - Lead analytics broken down by source
2. **`v_sales_rep_performance`** - Sales rep performance metrics
3. **`v_job_stage_durations`** - Average time spent in each pipeline stage
4. **`v_job_profitability`** - Job profitability by stage, carrier, and type
5. **`v_job_delays_summary`** - Job delays summary by type
6. **`v_sales_team_performance`** - Sales team performance dashboard
7. **`v_crew_performance`** - Crew performance metrics
8. **`v_marketing_roi_summary`** - Marketing ROI summary by campaign type
9. **`v_owner_dashboard`** - Master dashboard for roofing company owners
10. **`v_current_revenue_forecast`** - Current revenue forecast view

#### Functions Created:

1. **`calculate_revenue_forecast()`** - Calculates revenue forecast based on pipeline and close rates
2. **`create_analytics_alert()`** - Creates analytics-based alerts

### 2. API Endpoints Created

#### Lead Analytics (`/api/analytics/leads`)
- Returns leads by source, quality scores, response speed, sales funnel metrics, and win rate by sales rep

#### Job Analytics (`/api/analytics/jobs`)
- Returns stage durations, install duration, job delays, profitability, and quality scores

#### Team Performance (`/api/analytics/team`)
- Returns sales team, insurance team, ops team, and crew performance metrics

#### Revenue Analytics (`/api/analytics/revenue`)
- Returns current month revenue, pending approvals, scheduled jobs, revenue forecast, and profitability analytics

#### Marketing ROI (`/api/analytics/marketing-roi`)
- Returns campaign performance, cost per lead/inspection/job, ROI by campaign type, and average job value per source

#### Owner Dashboard (`/api/analytics/owner`)
- Returns aggregated metrics for roofing company owners:
  - Monthly Revenue
  - Profit Margin
  - Hot Leads Count
  - Jobs at Risk
  - Avg Days to Complete Jobs
  - Material Waste Trends
  - Crew Efficiency
  - Top Sales Rep Rankings

#### Analytics Alerts (`/api/analytics/alerts`)
- GET: Returns analytics-based alerts
- POST: Creates new analytics alert
- PATCH: Updates alert (mark as read, dismiss, etc.)

### 3. UI Components Created

#### Owner Dashboard (`/dashboard/analytics/roofing`)
- Master dashboard with key metrics cards
- Monthly revenue, profit margin, hot leads, jobs at risk
- Top sales reps chart
- Quick links to detailed analytics pages

#### Lead Analytics Page (`/dashboard/analytics/roofing/leads`)
- Leads by source table with conversion rates
- Lead quality distribution pie chart
- Sales funnel metrics
- Sales rep performance table

#### Job Analytics Page (`/dashboard/analytics/roofing/jobs`)
- Stage duration analytics with charts
- Profitability breakdown (insurance vs retail)
- Job delays summary
- Crew performance table

#### Team Performance Page (`/dashboard/analytics/roofing/team`)
- Tabs for Sales, Insurance, Ops, and Crews
- Sales team performance with charts
- Insurance team metrics
- Ops team scheduling efficiency
- Crew performance table

#### Marketing ROI Page (`/dashboard/analytics/roofing/marketing`)
- Overall ROI metrics
- Campaign performance table with ROI calculations
- ROI by campaign chart
- Summary by campaign type

## 📊 Analytics Areas Covered

### A. Lead Analytics
- ✅ Leads by source (Google, Facebook, Storm leads, Referrals, SmartSend campaigns, Website forms)
- ✅ Lead quality scores (hot/warm/cold distribution)
- ✅ Lead response speed
- ✅ Sales funnel metrics (Leads → Inspections → Quotes → Approvals)
- ✅ Win rate by sales rep

### B. Job Analytics
- ✅ Average time in each pipeline stage
- ✅ Average install duration by crew
- ✅ Job delays tracking (weather, materials, crew, insurance)
- ✅ Job profitability (retail vs insurance)
- ✅ Job quality scores

### C. Team Analytics
- ✅ Sales performance (close rate, job value, response time, inspections per week)
- ✅ Insurance team efficiency (approval rate, supplement value, payout timeline)
- ✅ Ops team metrics (scheduling efficiency, reschedules)
- ✅ Crew performance (install speed, quality, callback rate, profitability)

### D. Financial Analytics
- ✅ Monthly revenue
- ✅ Projected revenue
- ✅ Profit margin per job
- ✅ Profit per crew
- ✅ Insurance vs retail profitability

### E. Marketing ROI
- ✅ Email campaigns performance
- ✅ Cost per booked inspection
- ✅ Cost per approved job
- ✅ Average job value per source
- ✅ ROI percentage and multiplier

### F. Owner Analytics Dashboard
- ✅ Monthly Revenue
- ✅ Profit Margin
- ✅ Hot Leads Count
- ✅ Jobs at Risk
- ✅ Avg Days to Complete Jobs
- ✅ Material Waste Trends
- ✅ Crew Efficiency
- ✅ Sales Rep Rankings

## 🔔 Analytics Alerts System

The system includes an alerts table and API endpoints for creating and managing analytics-based alerts. Alert types include:

- Close rate drop
- Crew performance issue
- Material cost increase
- Lead volume drop
- Jobs at risk
- Inspection lag
- Revenue forecast change
- Marketing ROI drop

## 🚀 How to Use

### 1. Apply Database Migration

Run the migration file in Supabase SQL Editor:
```sql
-- File: supabase/migrations/20250215000000_block25380_roofing_reporting_analytics_v1.sql
```

### 2. Access Analytics Dashboard

Navigate to `/dashboard/analytics/roofing` to see the owner dashboard with aggregated metrics.

### 3. View Detailed Reports

- **Lead Reports**: `/dashboard/analytics/roofing/leads`
- **Job Reports**: `/dashboard/analytics/roofing/jobs`
- **Team Performance**: `/dashboard/analytics/roofing/team`
- **Marketing ROI**: `/dashboard/analytics/roofing/marketing`

### 4. API Usage

All endpoints require `workspaceId` query parameter:

```typescript
// Lead Analytics
GET /api/analytics/leads?workspaceId={id}&dateRange=30d

// Job Analytics
GET /api/analytics/jobs?workspaceId={id}&dateRange=30d

// Team Performance
GET /api/analytics/team?workspaceId={id}&teamType=sales

// Revenue Analytics
GET /api/analytics/revenue?workspaceId={id}

// Marketing ROI
GET /api/analytics/marketing-roi?workspaceId={id}&dateRange=30d

// Owner Dashboard
GET /api/analytics/owner?workspaceId={id}

// Analytics Alerts
GET /api/analytics/alerts?workspaceId={id}&unreadOnly=true
```

## 📈 Key Features

1. **Zero Fluff Analytics** - Only metrics that matter to roofers
2. **Complete Visibility** - See every part of the business
3. **Data-Driven Decisions** - Replace guessing with data
4. **Proactive Alerts** - Get notified when metrics change
5. **Revenue Forecasting** - Predict future revenue based on pipeline
6. **Marketing ROI** - Track which campaigns make money
7. **Team Performance** - Coach, reward, or replace with data
8. **Profitability Tracking** - Know which jobs make money

## 🎯 Why This Makes SmartSend Unreplaceable

Once SmartSend handles:
- Reporting
- Forecasting
- Profitability
- Performance scoring
- Marketing ROI
- Job tracking

Roofers realize: **"SmartSend knows my roofing business better than I do."**

Canceling SmartSend = blindness. They won't do it.

## 📝 Notes

- The system builds on existing `roofing_jobs`, `leads`, and `campaigns` tables
- Some metrics require additional data (e.g., crew assignments, material costs) to be fully populated
- The alerts system can be enhanced with automated alert generation based on threshold rules
- Revenue forecasting can be improved with seasonality factors and weather impact scoring

## 🔄 Future Enhancements

- Automated alert generation based on threshold rules
- Enhanced seasonality and weather impact scoring
- Supplier performance tracking
- Insurance payout speed tracking
- Material waste trend analysis
- Neighborhood heatmap integration
- Custom report builder





































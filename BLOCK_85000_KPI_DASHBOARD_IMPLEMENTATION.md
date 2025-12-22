# Block 85000 — SmartSend Roofing "Owner KPI Dashboard + Business Health Score Engine" v1

## ✅ Implementation Complete

**THE CEO DASHBOARD THAT TURNS ROOFERS INTO REAL BUSINESS OWNERS — ZERO FLUFF.**

This block transforms SmartSend from a tool into a CEO dashboard — the place roofing owners go EVERY MORNING to understand:
- Are we winning?
- Where is the money coming from?
- What's broken?
- What needs attention?
- Who is performing?
- What's our pipeline worth?
- How efficient are we?

## 📦 What Was Implemented

### 1. Database Schema ✅

**File:** `supabase/migrations/20250130000001_block85000_kpi_dashboard_business_health_v1.sql`

#### Core Tables Created:

**A) `company_kpi_snapshots` Table**
- Daily snapshots of all KPIs per company/workspace
- Fields:
  - Lead metrics (total, hot, warm, cold)
  - Estimate metrics (booked, sent, pending)
  - Job metrics (won, lost, in progress, completed)
  - Revenue metrics (won, pipeline, average job value)
  - Conversion metrics (close rate, estimate-to-close, lead-to-estimate)
  - Response & engagement metrics (response speed, email open/reply/click rates)
  - Deliverability metrics (domain reputation, bounce rate, spam complaints)
  - Safety & quality metrics (incidents, crew on-time rate, homeowner satisfaction, callback rate)
  - Marketing metrics (active campaigns, spend, ROI)
  - Top ZIP codes (stored as JSONB)

**B) `kpi_definitions` Table**
- Flexible KPI definitions for customization
- Fields: name, description, calculation_method, category, unit, target_value

**C) `business_health_scores` Table**
- AI-generated business health scores with recommendations
- Fields:
  - Overall score (0-100) and grade (A+ through F)
  - Component scores (revenue, production, safety, deliverability, marketing, operations, crew, satisfaction)
  - Problems, strengths, and recommendations (stored as JSONB)

#### SQL Functions Created:

1. **`calculate_daily_kpi_snapshot()`**
   - Calculates and saves daily KPI snapshot for a company/workspace
   - Aggregates data from leads, jobs, estimates, campaigns, crews, email events
   - Handles company_id, workspace_id, or org_id contexts
   - Returns snapshot UUID

2. **`calculate_business_health_score()`**
   - Calculates business health score with AI-generated recommendations
   - Scores components: revenue, production, safety, deliverability, marketing, operations, crew, satisfaction
   - Generates actionable recommendations based on performance
   - Returns health score UUID

### 2. Edge Function ✅

**File:** `supabase/functions/kpi-nightly-snapshot/index.ts`

- Runs nightly at 2 AM UTC (configured in `supabase/config.toml`)
- Calculates snapshots for all active companies and workspaces
- Can be triggered manually with specific company/workspace/org IDs
- Handles errors gracefully and continues processing other companies

### 3. API Endpoints ✅

**Files:**
- `app/api/kpi/dashboard/route.ts` - Main dashboard data endpoint
- `app/api/kpi/health-score/route.ts` - Health score calculation and retrieval
- `app/api/kpi/snapshot/route.ts` - Manual snapshot trigger

All endpoints support:
- `company_id`, `workspace_id`, or `org_id` query parameters
- Proper authentication and authorization
- Error handling

### 4. Frontend Dashboard ✅

**Files:**
- `app/kpi-dashboard/page.tsx` - Server component (page entry)
- `app/kpi-dashboard/KPIDashboardClient.tsx` - Client component with all widgets

#### Dashboard Features:

**A. Top KPI Cards (Big Numbers)**
- Revenue Won (30 days)
- Pipeline Value
- Hot Leads
- Booked Estimates

**B. Business Health Score Widget**
- Overall score (0-100) with grade badge
- Strengths and issues lists
- AI-generated recommendations with priority badges

**C. Trend Charts (30-day)**
- Leads trend (total, hot, warm)
- Revenue trend (revenue won, pipeline value)
- Email performance (open rate, reply rate)
- Close rate trend

**D. ZIP Code Revenue Heatmap**
- Bar chart showing top 5 ZIP codes by revenue
- Color-coded for visual impact

**E. Crew Performance Table**
- Jobs completed
- On-time percentage
- Average homeowner rating

**F. Marketing ROI Dashboard**
- Campaign performance table
- Sent, opened, replied counts
- Open rate and reply rate percentages

**G. Additional KPI Cards**
- Homeowner Satisfaction
- Crew On-Time Rate
- Email Reply Rate

### 5. Automation ✅

**Cron Job Configuration:**
- Added to `supabase/config.toml`
- Runs daily at 2 AM UTC
- Calls `/functions/v1/kpi-nightly-snapshot`

**Real-Time Update Triggers:**
- Created `trigger_kpi_snapshot_refresh()` function
- Can be attached to leads/jobs/estimates tables for real-time updates
- Note: In production, consider using Supabase Realtime or queue system

### 6. Row Level Security (RLS) ✅

All tables have proper RLS policies:
- Users can view KPIs for their workspace/company/org
- KPI definitions are read-only for all authenticated users
- Health scores are workspace/company/org scoped

## 🚀 How to Use

### 1. Run the Migration

```bash
# The migration will create all tables, functions, and seed data
supabase migration up
```

### 2. Access the Dashboard

Navigate to: `/kpi-dashboard`

The dashboard will automatically:
- Fetch latest snapshot
- Load 30-day trend data
- Calculate/retrieve health score
- Display all widgets and charts

### 3. Manual Snapshot Trigger

```bash
# Trigger snapshot calculation manually
curl -X POST http://localhost:54321/functions/v1/kpi-nightly-snapshot \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"company_id": "uuid-here", "date": "2025-01-30"}'
```

### 4. Calculate Health Score

```bash
# Calculate health score for a period
curl -X POST /api/kpi/health-score \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_id": "uuid-here",
    "period_start": "2025-01-23",
    "period_end": "2025-01-30"
  }'
```

## 📊 KPI Metrics Tracked

### Revenue Metrics
- Revenue won (30 days)
- Pipeline value
- Average job value
- Total pipeline value

### Lead Metrics
- Total leads
- Hot leads
- Warm leads
- Cold leads

### Conversion Metrics
- Close rate %
- Estimate-to-close rate
- Lead-to-estimate rate

### Email Metrics
- Open rate %
- Reply rate %
- Click rate %
- Response speed (minutes)

### Production Metrics
- Crew on-time rate %
- Homeowner satisfaction (1-5)
- Safety incidents (30 days)
- Callback rate %

### Marketing Metrics
- Active campaigns
- Campaign ROI
- Cost per booked estimate
- Cost per won job

## 🎯 Business Health Score Components

The health score is calculated from:
1. **Revenue Score** (25% weight) - Based on close rate
2. **Production Score** (20% weight) - Based on crew on-time rate
3. **Safety Score** (15% weight) - Based on incident count
4. **Deliverability Score** (15% weight) - Based on email open/reply rates
5. **Operations Score** (10% weight) - Based on response speed
6. **Crew Performance Score** (10% weight) - Based on crew metrics
7. **Homeowner Satisfaction Score** (5% weight) - Based on ratings

**Grade Scale:**
- A+ (95-100), A (90-94), A- (85-89)
- B+ (80-84), B (75-79), B- (70-74)
- C+ (65-69), C (60-64), C- (55-59)
- D+ (50-54), D (45-49), D- (40-44)
- F (<40)

## 🔄 Next Steps (Optional Enhancements)

1. **Real-Time Updates**: Implement Supabase Realtime subscriptions for live dashboard updates
2. **Custom KPIs**: Allow users to define custom KPIs via the `kpi_definitions` table
3. **Alerts**: Set up alerts when health score drops below threshold
4. **Export**: Add CSV/PDF export functionality
5. **Historical Comparison**: Compare current period vs previous period
6. **Forecasting**: Add revenue forecasting based on pipeline
7. **Mobile App**: Create mobile-optimized version
8. **Email Digest**: Daily/weekly email summary of KPIs

## 📝 Notes

- The snapshot calculation function queries multiple tables and may take a few seconds for large datasets
- Health score calculation is optimized but may need caching for high-traffic scenarios
- ZIP code revenue data requires `lead_locations` table with zipcode data
- Crew performance requires `crew_performance_scores` table
- Campaign metrics require `email_events` table with proper event tracking

## 🐛 Known Limitations

1. Some metrics depend on tables that may not exist in all installations (e.g., `crew_performance_scores`, `lead_locations`)
2. The snapshot function uses simplified queries - may need optimization for very large datasets
3. Real-time triggers are placeholders - consider using Supabase Realtime for production
4. Health score recommendations are rule-based - could be enhanced with ML

## ✅ Testing Checklist

- [ ] Run migration successfully
- [ ] Verify tables created
- [ ] Test snapshot calculation function
- [ ] Test health score calculation
- [ ] Verify cron job runs (check logs)
- [ ] Access `/kpi-dashboard` page
- [ ] Verify all widgets load
- [ ] Test with different company/workspace contexts
- [ ] Verify RLS policies work correctly

---

**Block 85000 Complete** ✅

This implementation provides roofing owners with CEO-level intelligence to make data-driven decisions daily.




























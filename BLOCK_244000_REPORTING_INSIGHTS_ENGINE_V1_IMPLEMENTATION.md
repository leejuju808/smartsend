# Block 244000 — SmartSend Roofing Reporting & Insights Engine v1 Implementation

## 🎯 Mission

**THE BRAINS OF A ROOFING COMPANY**

This block gives SmartSend TRUE intelligence by providing:
- Job Profitability Reports
- Sales Rep Performance Analytics
- Marketing Attribution + ROI
- Crew Efficiency Metrics
- Production Speed Analysis
- Customer Lifetime Value
- Payment Metrics
- AR & Cashflow Forecasting
- Lead Source Breakdown
- AI-Generated Daily Insights
- AI Predictive Alerts

## ✅ Implementation Complete

### 1. Database Schema ✅

**File:** `supabase/migrations/20250130000001_block244000_reporting_insights_engine_v1.sql`

#### Core Tables Created:

**A) `report_sales_reps` Table**
- Sales rep performance summaries by period
- Fields:
  - `workspace_id`, `roofing_company_id`, `rep_id`
  - `period`: daily, weekly, monthly, quarterly, yearly
  - `leads_assigned`, `leads_contacted`, `contact_rate`
  - `estimates_sent`, `jobs_sold`, `revenue`, `avg_ticket`
  - `close_rate`, `conversion_rate`, `performance_score`, `rank_in_team`

**B) `report_job_profit` Table**
- Job profitability analysis
- Fields:
  - `revenue`, `estimated_revenue`
  - `labor_cost`, `material_cost`, `equipment_cost`, `overhead_cost`, `total_cost`
  - `profit`, `margin` (percentage)
  - `cost_variance`, `margin_variance`
  - `square_footage`, `profit_per_square`

**C) `report_marketing_channels` Table**
- Marketing channel ROI and attribution
- Fields:
  - `channel`: google_ads, facebook, referral, direct, organic, etc.
  - `leads`, `qualified_leads`, `jobs_won`, `conversions`
  - `revenue`, `cost`, `profit`, `roi` (percentage)
  - `cost_per_lead`, `cost_per_job`, `revenue_per_lead`

**D) `report_crews` Table**
- Crew performance and efficiency metrics
- Fields:
  - `jobs_completed`, `jobs_scheduled`, `on_time_rate`
  - `avg_duration_hours`, `efficiency_score`
  - `issues_reported`, `rework_count`, `rework_rate`, `quality_score`
  - `safety_incidents`, `safety_score`
  - `labor_cost`, `material_waste_cost`, `cost_per_job`
  - `performance_score` (composite 0-100)

**E) `report_cashflow` Table**
- Cashflow and AR/AP forecasting
- Fields:
  - `cash_in`, `cash_out`, `net_cashflow`
  - `projected_in`, `projected_out`, `projected_net`
  - `ar_total`, `ar_current`, `ar_overdue_30`, `ar_overdue_60`, `ar_overdue_90`
  - `ap_total`, `ap_current`, `ap_upcoming`
  - `days_sales_outstanding`, `collection_rate`, `cashflow_health_score`

**F) `ai_insights` Table**
- AI-generated daily insights and recommendations
- Fields:
  - `insight_type`: daily_summary, trend_analysis, performance_alert, opportunity, risk_warning
  - `category`: sales, profit, crew, marketing, cashflow, production
  - `title`, `message`, `severity`: info, warning, critical
  - `data` (JSONB), `is_read`, `is_archived`

**G) `predictive_alerts` Table**
- Predictive alerts for risks and opportunities
- Fields:
  - `alert_type`: weather_delay, overbooking, budget_overrun, quality_issue, cashflow_dip, material_delay, crew_underperformance
  - `severity`: low, medium, high, critical
  - `title`, `message`, `predicted_date`
  - `related_entity_type`, `related_entity_id`
  - `is_acknowledged`, `is_resolved`

**Features:**
- Row-Level Security (RLS) on all tables
- Comprehensive indexes for performance
- Helper functions: `generate_sales_rep_report()`, `mark_insight_read()`, `acknowledge_alert()`
- Automatic `updated_at` triggers

### 2. API Routes ✅

**Base Path:** `/api/reports`

#### Implemented Routes:

**A) Report Generation**
- `POST /api/reports/generate` - Generate reports for a specific period and type
  - Supports: sales_reps, job_profit, marketing_channels, crews, cashflow

**B) Report Retrieval**
- `GET /api/reports/sales` - Get sales rep performance report
- `GET /api/reports/job-profit` - Get job profitability report
- `GET /api/reports/marketing` - Get marketing channel ROI report
- `GET /api/reports/crews` - Get crew performance report
- `GET /api/reports/cashflow` - Get cashflow and AR/AP report

**C) AI Insights**
- `GET /api/reports/ai/insights` - Get existing AI insights
- `POST /api/reports/ai/insights` - Generate new AI insights

**D) Predictive Alerts**
- `GET /api/reports/alerts` - Get predictive alerts
- `POST /api/reports/alerts` - Acknowledge or resolve an alert

**E) Automation**
- `POST /api/cron/reports/daily` - Daily cron job for report generation

**Authentication:**
- All routes require workspace membership verification
- Uses Supabase Auth for user authentication
- RLS policies enforce workspace-level access control

### 3. UI Dashboard Components ✅

**File:** `components/reports/ReportingEngineDashboard.tsx`

#### Main Dashboard Features:

**A) Overview Tab**
- Key metrics cards: Total Revenue, Avg Job Margin, Jobs Sold, Cashflow Health
- Alerts & warnings panel
- Quick stats grid

**B) Job Profitability Dashboard** (`JobProfitabilityDashboard.tsx`)
- Summary cards: Avg Job Profit, Avg Job Margin, Total Revenue, Loss-Generating Jobs
- Loss jobs alert panel
- Profitability by job type breakdown
- Recent jobs table with profit/margin details

**C) Sales Dashboard** (`SalesDashboard.tsx`)
- Summary cards: Total Revenue, Jobs Sold, Avg Close Rate, Avg Ticket Size
- Top performers leaderboard
- All sales reps table with detailed metrics

**D) Marketing Dashboard** (`MarketingDashboard.tsx`)
- Summary cards: Total Leads, Total Revenue, Total Spend, Avg Cost Per Lead
- Channel performance sorted by ROI
- All marketing channels comparison table

**E) Crew Performance Dashboard** (`CrewPerformanceDashboard.tsx`)
- Summary cards: Total Jobs Completed, Avg Efficiency, Avg Quality Score, Avg Safety Score
- Top performing crews leaderboard
- All crews table with performance metrics

**F) Cashflow Dashboard** (`CashflowDashboard.tsx`)
- Summary cards: Cash In, Cash Out, Net Cashflow, Cashflow Health
- AR aging breakdown (Current, 31-60, 61-90, 90+ days)
- Overdue invoices alert
- Cashflow forecast (30/60/90 days)

**G) AI Insights Panel** (`AIInsightsPanel.tsx`)
- Daily AI-generated insights
- Generate new insights button
- Color-coded by severity (info, warning, critical)

**H) Predictive Alerts Panel** (`PredictiveAlertsPanel.tsx`)
- Active predictive alerts
- Severity indicators (low, medium, high, critical)
- Predicted date display
- Acknowledge/resolve functionality

### 4. AI Insights Generation ✅

**Implementation:**
- Uses OpenAI GPT-4o-mini for insight generation
- Analyzes sales, profit, crew, and marketing data
- Generates 5-7 actionable insights per workspace
- Saves insights to `ai_insights` table
- Categorizes by type and severity

**Example Insights:**
- "Crew 2 is trending 18% slower this month."
- "Material costs increased 7% vs last quarter."
- "Your average job margin is down from 37% → 29%."
- "Sales rep John has the highest close rate."
- "Leads from Facebook produced $28k profit last month."

### 5. Predictive Alerts System ✅

**File:** `supabase/migrations/20250130000002_block244000_reporting_automations.sql`

#### Alert Types:

**A) Budget Overrun**
- Detects jobs trending over budget
- Flags when cost > 90% of revenue
- Severity: high/critical based on margin risk

**B) Cashflow Dip**
- Alerts when AR overdue 90+ days > 20% of total AR
- Predicts cashflow issues 14 days out
- Severity: high

**C) Crew Underperformance**
- Flags crews with performance score < 60%
- Alerts on rework rate > 15%
- Severity: medium/high

**D) Weather Delay** (placeholder for future)
**E) Overbooking** (placeholder for future)
**F) Quality Issue** (placeholder for future)
**G) Material Delay** (placeholder for future)

### 6. Automation Functions ✅

**File:** `supabase/migrations/20250130000002_block244000_reporting_automations.sql`

#### Database Functions:

**A) `generate_daily_reports(p_workspace_id)`**
- Generates sales rep reports (monthly)
- Placeholder for marketing, crew, cashflow reports
- Called daily via cron

**B) `generate_predictive_alerts(p_workspace_id)`**
- Checks for budget overruns
- Monitors cashflow health
- Flags crew underperformance
- Creates alerts in `predictive_alerts` table

#### Cron Job:

**File:** `app/api/cron/reports/daily/route.ts`
- Runs daily (configure via Vercel Cron or external scheduler)
- Processes all active workspaces
- Generates reports, alerts, and AI insights
- Protected by `CRON_SECRET` environment variable

### 7. Integration Points

**Ties into existing SmartSend systems:**
- **Scheduling Engine** - For capacity and backlog forecasting
- **Billing Hub** - For cashflow and AR data
- **Supplier Hub** - For material cost tracking
- **Job Pipeline** - For job status and profit data
- **Crew Dispatch** - For crew performance metrics
- **Marketing Hub** - For lead source attribution

## 📊 Key Metrics Tracked

### Job Profitability
- Avg job profit & margin
- Most profitable job types
- Loss-generating jobs
- Material cost variance
- Crew-related cost overruns

### Sales Performance
- Close rates
- % of leads contacted
- Jobs sold per rep
- Revenue per rep
- Avg ticket size
- Estimate-to-job conversion rate

### Marketing ROI
- Leads by channel
- Cost per lead
- Cost per job
- Revenue per channel
- ROI percentage

### Crew Performance
- Jobs completed
- Avg job duration
- Issues reported
- Rework jobs
- Safety score
- Travel time efficiency

### Cashflow & AR
- Cash collected
- Cash outstanding
- Payment plan projections
- Overdue invoices
- Forecast next 30/60/90 days

## 🚀 Why Roofers Love This

**Roofers WITHOUT SmartSend:**
- ❌ Don't know which jobs make money
- ❌ Don't know which jobs lose money
- ❌ Don't know which rep is strongest
- ❌ Crews operate without accountability
- ❌ Marketing money gets wasted
- ❌ Cashflow guessing
- ❌ Zero forecasting
- ❌ Reactive business, not strategic

**Roofers WITH SmartSend:**
- ✅ Data-driven decisions
- ✅ Real profitability visibility
- ✅ Predictable cashflow
- ✅ Best salespeople identified
- ✅ Crew performance measured
- ✅ Marketing ROI clear
- ✅ Forecasting done automatically
- ✅ Problems caught early
- ✅ 10× smarter business

## 📝 Next Steps

1. **Set up cron job** - Configure daily report generation (Vercel Cron, GitHub Actions, etc.)
2. **Connect data sources** - Ensure all subsystems feed into reporting tables
3. **Customize alerts** - Adjust thresholds based on business needs
4. **Add more alert types** - Weather delays, overbooking, material delays
5. **Enhance AI insights** - Add more sophisticated analysis
6. **Export functionality** - Add CSV/PDF export for reports
7. **Email summaries** - Send daily/weekly email summaries to owners

## 🔧 Configuration

**Environment Variables:**
- `OPENAI_API_KEY` - For AI insights generation
- `CRON_SECRET` - For securing cron endpoints
- `NEXT_PUBLIC_APP_URL` - For cron job callbacks

**Database:**
- Run migrations in order:
  1. `20250130000001_block244000_reporting_insights_engine_v1.sql`
  2. `20250130000002_block244000_reporting_automations.sql`

## 📚 Files Created

### Database
- `supabase/migrations/20250130000001_block244000_reporting_insights_engine_v1.sql`
- `supabase/migrations/20250130000002_block244000_reporting_automations.sql`

### API Routes
- `app/api/reports/generate/route.ts`
- `app/api/reports/sales/route.ts`
- `app/api/reports/job-profit/route.ts`
- `app/api/reports/marketing/route.ts`
- `app/api/reports/crews/route.ts`
- `app/api/reports/cashflow/route.ts`
- `app/api/reports/ai/insights/route.ts`
- `app/api/reports/alerts/route.ts`
- `app/api/cron/reports/daily/route.ts`

### UI Components
- `components/reports/ReportingEngineDashboard.tsx`
- `components/reports/JobProfitabilityDashboard.tsx`
- `components/reports/SalesDashboard.tsx`
- `components/reports/MarketingDashboard.tsx`
- `components/reports/CrewPerformanceDashboard.tsx`
- `components/reports/CashflowDashboard.tsx`
- `components/reports/AIInsightsPanel.tsx`
- `components/reports/PredictiveAlertsPanel.tsx`

### Pages
- `app/(dashboard)/reports/page.tsx` (updated)

---

**Block 244000 Complete** ✅

This block makes SmartSend the brains of a roofing company. Roofers will say:

> "SmartSend shows me EXACTLY where my money goes. Anyone not using this is running their business blindfolded."

> "SmartSend is like having a CFO, sales manager, production manager, and analyst all in one system."

> "Anyone not using SmartSend is running an outdated business."


























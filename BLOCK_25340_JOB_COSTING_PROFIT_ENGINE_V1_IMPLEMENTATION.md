# Block 25340 — SmartSend Roofing Job Costing & Profit Engine v1 Implementation

## Overview

This implementation delivers **THE ROOFING PROFIT ENGINE — ZERO FLUFF**. This is the feature that makes SmartSend not just an operations system… but a MONEY SYSTEM.

Roofers are terrible at knowing their true profit:
- ❌ Wrong labor assumptions
- ❌ Missing material costs
- ❌ Supplements not tracked
- ❌ Extra dump fees
- ❌ Wood replacement not logged
- ❌ Undercharging
- ❌ Profit showing on paper but not in reality
- ❌ Jobs priced wrong
- ❌ Crews going over labor hours

SmartSend Job Costing & Profit Engine v1 solves ALL OF IT.

## What Was Built

### 1. Enhanced Labor Cost Tracking ✅

**Database Schema:**
- Enhanced `job_labor_costs` table with:
  - **TOT Hours** (Time on Tear-Off)
  - **TOI Hours** (Time on Install)
  - Extra hours, decking labor, repair labor
  - Overtime hours with multiplier
  - Crew size tracking
  - **Per-square rate option** (alternative to hourly)
  - Automatic total cost calculation

**API Routes:**
- `POST /api/jobs/[jobId]/labor` - Create/update labor costs
- `GET /api/jobs/[jobId]/labor` - Get all labor costs for a job
- `DELETE /api/jobs/[jobId]/labor` - Delete labor cost entry

**UI Component:**
- `LaborCostInput.tsx` - Full-featured labor input form with TOT/TOI, crew size, hourly/per-square options

### 2. Addon Costs Tracking ✅

**Database Schema:**
- New `job_addon_costs` table tracking:
  - Wood replacement (plywood/decking)
  - Dumpster/dump fees
  - Additional repairs
  - Skylight replacement
  - Plumbing boot changes
  - Permit fees
  - Equipment rental
  - Gas/travel costs
  - Change orders
  - Other add-ons
  - **Supplement eligibility** (insurance tracking)
  - **Supplement status** (not_submitted/submitted/approved/denied)

**API Routes:**
- `POST /api/jobs/[jobId]/addon-costs` - Create/update addon costs
- `GET /api/jobs/[jobId]/addon-costs` - Get all addon costs
- `DELETE /api/jobs/[jobId]/addon-costs` - Delete addon cost

**UI Component:**
- `AddonCostsInput.tsx` - Form for adding wood, dumpster, repairs, and other add-ons

### 3. Material Cost Sync Enhancement ✅

**Database Schema:**
- Enhanced `material_orders` table with:
  - `actual_invoice_cost` - Actual cost from supplier invoice
  - `actual_invoice_received_at` - When invoice was received
  - `actual_invoice_variance_pct` - % difference from estimated
  - `invoice_synced` - Whether cost was synced from invoice

**Integration:**
- Material costs automatically pulled from supplier invoices (when available)
- Variance tracking to identify supplier accuracy issues
- Auto-recalculation of profit when invoice costs are updated

### 4. Margin Alerts System ✅

**Database Schema:**
- New `margin_alerts` table with:
  - Alert types: `low_margin`, `negative_profit`, `material_cost_variance`, `labor_cost_overrun`, `supplement_opportunity`, `cost_increase`
  - Severity levels: `low`, `medium`, `high`, `critical`
  - Current margin and profit tracking
  - Human-readable messages and suggestions
  - Acknowledgment and resolution tracking

**Automated Alerts:**
- **Negative Profit**: Critical alert when job loses money
- **Low Margin**: Alert when margin drops below 30% (configurable threshold)
- **Material Cost Variance**: Alert when material cost >20% higher than estimated
- **Labor Cost Overrun**: Alert when crew hours exceed target

**API Routes:**
- `GET /api/jobs/[jobId]/margin-alerts` - Get unresolved margin alerts
- `POST /api/jobs/[jobId]/margin-alerts` - Acknowledge or resolve alerts

**UI Component:**
- `MarginAlerts.tsx` - Display margin alerts with severity colors and action buttons

### 5. Real-Time Profit Calculator ✅

**Enhanced `recalc_job_financials` Function:**
- Calculates profit including:
  - Revenue (payments + supplements + change orders)
  - Material costs (from cost entries + actual invoice costs)
  - Labor costs (from `job_labor_costs` table)
  - Addon costs (wood, dumpster, repairs, etc.)
  - Other costs (from cost entries)
- Auto-updates `profit_status`: `strong`, `acceptable`, `at_risk`, `losing`
- Triggers margin alerts automatically

**Auto-Update Triggers:**
- Recalculates when labor costs change
- Recalculates when addon costs change
- Recalculates when material invoice costs update
- Recalculates when payments change

### 6. Insurance vs Retail Profit Comparison ✅

**Database Schema:**
- Added `job_revenue_type` to `roofing_jobs`: `insurance`, `retail`, `mixed`
- Created `insurance_vs_retail_profit_comparison` view:
  - Average margin by job type
  - Average profit by job type
  - Total profit by job type
  - Job counts by type

**Dashboard Integration:**
- Shows comparison of insurance vs retail profitability
- Helps roofers prioritize which type of work to focus on

### 7. Owner-Only Profit Dashboard ✅

**API Route:**
- `GET /api/dashboard/profit` - Owner-only profit dashboard data

**Dashboard Features:**
- **Top 10 Most Profitable Jobs** - See which jobs make the most money
- **Top 10 Least Profitable Jobs** - Identify problem jobs
- **Crew Cost Efficiency** - Which crews make money vs lose money
- **Supplier Cost Accuracy** - Which suppliers overcharge vs are accurate
- **Insurance vs Retail ROI** - Compare profitability by job type
- **Average Margin** (30 days) - Company-wide margin tracking
- **Projected vs Actual Revenue** - Revenue variance tracking

**UI Component:**
- `app/(dashboard)/dashboard/profit/page.tsx` - Full profit dashboard (owner-only access)

### 8. Profit Status Integration ✅

**Database Schema:**
- Added `profit_status` to `roofing_jobs`: `strong`, `acceptable`, `at_risk`, `losing`
- Auto-calculated based on margin:
  - `losing`: Profit < 0
  - `at_risk`: Margin < 20%
  - `acceptable`: Margin 20-30%
  - `strong`: Margin > 30%

**Visual Indicators:**
- Profit status displayed in job views
- Color-coded badges (green/yellow/red)
- Integrated into job health score

### 9. Job Health Score Integration ✅

**New Function:**
- `calculate_profit_score()` - Calculates profit pillar score (0-100) for job health score
- Penalties for:
  - Negative profit (-30 points)
  - Low margin (< 20%: -25, < 30%: -15)
  - Unresolved margin alerts (-5 per critical/high alert)
  - Material cost variance >20% (-10)
- Bonuses for:
  - Strong margin >= 35% (+10)

**Integration:**
- Profit score can be integrated into overall job health score calculation
- Low profit jobs automatically show lower health scores
- Margin alerts impact health score visibility

### 10. Future Bidding Intelligence (Foundation) ✅

**Database Schema:**
- New `bidding_intelligence` table:
  - Job characteristics (size, type, complexity)
  - Learned costs (material per square, labor hours per square, common overages)
  - City/market data (permit costs, zip code patterns)
  - Supplier performance tracking
  - Insurance supplement patterns
  - Recommendations (suggested buffers for estimates)

**Future Enhancement:**
- Can be populated by analyzing completed jobs
- Provides bidding suggestions: "Based on past 12 installs of this size, add 2 additional squares to estimate"

## Database Migration

**File:** `supabase/migrations/20250206000000_block25340_job_costing_profit_engine_v1.sql`

**Tables Created:**
- `job_addon_costs` - Track wood, dumpster, repairs, etc.
- `margin_alerts` - Profit protection alerts
- `bidding_intelligence` - Future bidding suggestions (foundation)

**Tables Enhanced:**
- `job_labor_costs` - Added TOT/TOI, crew size, per-square rates
- `material_orders` - Added actual invoice cost tracking
- `roofing_jobs` - Added `job_revenue_type`, `profit_status`

**Functions Created:**
- `calculate_labor_total_cost()` - Auto-calculate labor costs
- `check_margin_alerts()` - Check and create margin alerts
- `get_crew_efficiency()` - Calculate crew efficiency for dashboard
- `calculate_profit_score()` - Profit pillar for health score

**Views Created:**
- `insurance_vs_retail_profit_comparison` - Compare job type profitability
- `profit_dashboard_summary` - Owner dashboard data

**Triggers Created:**
- Auto-recalculate profit when labor costs change
- Auto-recalculate profit when addon costs change
- Auto-recalculate profit when material invoice costs update
- Auto-check margin alerts when profit changes

## API Routes

1. **Labor Costs:**
   - `POST /api/jobs/[jobId]/labor` - Create/update labor cost
   - `GET /api/jobs/[jobId]/labor` - Get labor costs
   - `DELETE /api/jobs/[jobId]/labor` - Delete labor cost

2. **Addon Costs:**
   - `POST /api/jobs/[jobId]/addon-costs` - Create/update addon cost
   - `GET /api/jobs/[jobId]/addon-costs` - Get addon costs
   - `DELETE /api/jobs/[jobId]/addon-costs` - Delete addon cost

3. **Margin Alerts:**
   - `GET /api/jobs/[jobId]/margin-alerts` - Get margin alerts
   - `POST /api/jobs/[jobId]/margin-alerts` - Acknowledge/resolve alert

4. **Profit Dashboard:**
   - `GET /api/dashboard/profit` - Owner-only profit dashboard (requires owner role)

## UI Components

1. **LaborCostInput.tsx** - Labor cost input form with TOT/TOI, crew size, hourly/per-square
2. **AddonCostsInput.tsx** - Addon costs form (wood, dumpster, repairs, etc.)
3. **MarginAlerts.tsx** - Margin alerts display component
4. **Profit Dashboard** - Owner-only dashboard at `/dashboard/profit`

## How This Makes SmartSend Unreplaceable

Once SmartSend becomes:
- ✅ The profit engine
- ✅ The cost tracker
- ✅ The supplement analyzer
- ✅ The job margin calculator
- ✅ The estimator assist tool
- ✅ The owner financial dashboard

**Canceling SmartSend becomes financially dangerous.**

Roofers will NEVER leave a system that protects their margins.

## Next Steps (Future Enhancements)

1. **Material Invoice Sync Automation:**
   - Parse supplier invoices automatically
   - Extract line-item costs
   - Auto-populate `actual_invoice_cost`

2. **Bidding Intelligence Population:**
   - Analyze completed jobs
   - Learn common overages
   - Generate bidding suggestions automatically

3. **Crew Performance Tracking:**
   - Track crew efficiency over time
   - Identify top-performing crews
   - Suggest crew assignments based on job type

4. **Supplier Performance Dashboard:**
   - Track supplier accuracy over time
   - Identify suppliers that consistently overcharge
   - Recommend suppliers based on cost accuracy

5. **Profit Forecasting:**
   - Predict job profit before starting
   - Alert on jobs likely to lose money
   - Suggest pricing adjustments

## Summary

Block 25340 delivers a complete Job Costing & Profit Engine that:
- ✅ Tracks ALL job costs (materials, labor, addons)
- ✅ Calculates real-time profit and margin
- ✅ Protects profit with margin alerts
- ✅ Compares insurance vs retail profitability
- ✅ Provides owner-only profit dashboard
- ✅ Integrates with job health score
- ✅ Foundation for future bidding intelligence

This is the feature that transforms SmartSend from "email software" into a **MONEY SYSTEM**.





































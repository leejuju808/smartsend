# Block 43000 — SmartSend Roofing "Job Costs + Labor & Material Budget Engine" v1

## ✅ Implementation Complete

This block protects roofer profits by tracking estimated vs actual costs in real-time, detecting overruns, and providing margin protection alerts.

## 📦 Files Created

### Database Migration (1 file)
- ✅ `supabase/migrations/20250130000001_block43000_job_costs_labor_material_budget_engine_v1.sql`
  - Creates `job_estimates` table for estimated costs at estimate time
  - Creates `job_actual_costs` table for aggregated actual costs
  - Creates `job_cost_overruns` table for tracking cost overruns
  - Creates `calculate_job_costs()` function to aggregate costs
  - Creates `check_cost_overruns()` function to detect overruns
  - Creates triggers for auto-calculation on material usage, labor logs, and job completion

### API Routes (2 files)
- ✅ `app/api/jobs/[jobId]/costs/calculate/route.ts` - Calculate job costs (POST/GET)
- ✅ `app/api/jobs/[jobId]/estimate/route.ts` - Create/update job estimates (POST/GET)

### UI Pages (2 files)
- ✅ `app/(dashboard)/jobs/costs/page.tsx` - Job Costing Overview Page
- ✅ `app/(dashboard)/jobs/[jobId]/costs/page.tsx` - Job Cost Detail Page with tabs

## 🎯 Features Implemented

### 1. Estimated Job Cost Tracking ✅
- Stores estimated materials (bundles, ridge, underlayment, ice & water, etc.) as JSONB
- Tracks estimated labor hours, labor rate, and crew size
- Tracks dumpster cost, delivery cost, and other costs
- Calculates total estimated cost automatically
- Created via API route `/api/jobs/[jobId]/estimate`

### 2. Actual Material Cost Calculation ✅
- Aggregates material usage from `material_usage` table (Block 42000)
- Calculates cost using unit prices (defaults: bundles $45, ridge $35, underlayment $120, etc.)
- Supports pattern matching for material names (e.g., "bundles", "ridge", "plywood")
- Auto-updates when material usage is logged

### 3. Actual Labor Cost Calculation ✅
- Aggregates labor hours from `crew_check_ins` or `crew_hours` tables
- Calculates cost using hourly rate (from estimate or default $50/hr)
- Auto-updates when labor logs are updated

### 4. Real-Time Margin Snapshot ✅
- Dashboard shows:
  - Estimated Profit
  - Actual Profit
  - Margin Loss
  - Margin %
- Color-coded indicators (green ≥30%, yellow ≥20%, red <20%)

### 5. Overrun Alerts ✅
- Triggers when:
  - Material use > estimate by 10%
  - Labor hours > estimate by 20%
  - Plywood added without change order
- Creates entries in `job_cost_overruns` table
- Displays alerts on job detail page with ⚠️ icon

### 6. Final Job Cost Report ✅
- Generated automatically when job is marked "completed"
- Shows:
  - Estimated vs actual breakdown
  - All materials with usage + cost
  - Labor totals
  - Change orders added
  - Final margin
- Available via Job Cost Detail Page with tabs:
  - Overview
  - Estimate Breakdown
  - Actual Costs
  - Material Usage
  - Labor Hours

## 🔄 Auto-Calculation Triggers

The system automatically recalculates costs when:
1. Material usage is logged (via `material_usage` table trigger)
2. Labor hours are logged (via `crew_check_ins` or `crew_hours` table trigger)
3. Job status changes to "completed" (via `roofing_jobs` table trigger)
4. Manual recalculation via API call

## 📊 Database Schema

### `job_estimates`
- Stores estimated costs at estimate time
- Links to `roofing_jobs` via `job_id`
- JSONB field for flexible material tracking
- Auto-calculates `estimated_total_cost`

### `job_actual_costs`
- Aggregated actual costs (updated on-demand or nightly)
- Links to `roofing_jobs` via `job_id`
- Auto-calculates `actual_total_cost`, `estimated_profit`, `actual_profit`, `margin_loss`

### `job_cost_overruns`
- Tracks cost overruns flagged for investigation
- Categories: material, labor, plywood, other
- Tracks percentage over estimate
- Supports acknowledgment workflow

## 🚀 Usage

### Creating an Estimate
```typescript
POST /api/jobs/[jobId]/estimate
{
  "estimated_materials": {
    "bundles": 30,
    "ridge": 6,
    "underlayment": 4,
    "ice_water": 2
  },
  "estimated_labor_hours": 24,
  "estimated_labor_rate": 50,
  "estimated_crew_size": 3,
  "dumpster_cost": 400,
  "delivery_cost": 150,
  "other_costs": 0,
  "markup_percentage": 35
}
```

### Calculating Costs
```typescript
POST /api/jobs/[jobId]/costs/calculate
// Automatically aggregates material usage and labor hours
// Returns calculation result with actual costs and profit
```

### Viewing Costs
- **Overview**: `/jobs/costs` - See all jobs with cost summaries
- **Detail**: `/jobs/[jobId]/costs` - See detailed breakdown with tabs

## 🔍 Overrun Detection Logic

1. **Material Overrun**: If actual material cost > estimated by 10%
2. **Labor Overrun**: If actual labor hours > estimated by 20%
3. **Plywood Overrun**: If plywood used but not in estimate and no change order exists

All overruns are logged to `job_cost_overruns` table and displayed as alerts.

## 💡 Business Value

This block transforms SmartSend into a full roofing operations platform by:
- **Protecting Margins**: Real-time alerts when costs exceed estimates
- **Profit Visibility**: Know actual profitability per job, not just revenue
- **Crew Accountability**: Track if crews are wasting materials or dragging on labor
- **Change Order Tracking**: Ensure plywood and extras are properly documented
- **Data-Driven Bidding**: Learn from actual costs to improve future estimates

## 🔗 Integration Points

- **Block 42000**: Uses `material_usage` table for actual material tracking
- **Block 25500**: Uses `crew_check_ins` for labor hour tracking
- **Block 27700**: Uses `roofing_change_orders` for change order revenue
- **Block 25340**: Complements existing profit engine with budget tracking

## 📝 Next Steps

1. Add unit price configuration per workspace (currently uses defaults)
2. Add PDF export for final job cost reports
3. Add email notifications for overrun alerts
4. Add historical cost analysis dashboard
5. Integrate with bidding intelligence (Block 25340) for better estimates

































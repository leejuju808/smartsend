# Block 255700 — SmartSend Job Costing & Profit Engine v1 Implementation

## 🎯 Mission

**THE FINANCIAL COMMAND CENTER — ZERO BULLSHIT.**

This block turns SmartSend into the roofing company's money brain — showing EXACTLY how much profit each job makes, where money leaks, and how to fix it instantly.

## ✅ Implementation Complete

### 1. Database Schema ✅

**File:** `supabase/migrations/20250230000000_block255700_job_costing_profit_engine_v1.sql`

#### Core Tables Created:

**A) `job_costs` Table**
- Main cost aggregation with auto-calculated profit and margin
- Fields:
  - `materials_cost`, `labor_cost`, `overhead_allocated`, `total_cost`
  - `revenue` (from job_value)
  - `profit` (GENERATED: revenue - total_cost)
  - `margin` (GENERATED: ((revenue - total_cost) / revenue) * 100)
- Unique constraint on `job_id`

**B) Enhanced `material_usage` Table**
- Added `quantity_expected` and `quantity_actual` for variance tracking
- Added `cost_per_unit` for cost calculation
- Renamed `quantity` to `quantity_actual` for clarity

**C) `labor_entries` Table**
- Labor tracking with clock-in/out integration
- Fields:
  - `clock_in`, `clock_out` timestamps
  - `hours_worked` (GENERATED from clock times)
  - `hourly_rate`, `cost` (GENERATED: hours * rate)
- Links to `crew_members` and `roofing_jobs`

**D) `overhead_allocation_settings` Table**
- Per-workspace overhead configuration
- Categories: office, vehicle/fuel, insurance, software/tools, other
- Allocation methods: per_job, per_square, percentage_of_revenue

**E) `job_variance_alerts` Table**
- Variance alerts for material, labor, scope, cost overruns, low margins
- Severity levels: low, medium, high, critical
- Acknowledgment and resolution tracking

**F) `insurance_job_profits` Table**
- Insurance job profit calculator with ACV/RCV breakdown
- Fields: `acv_paid`, `depreciation`, `deductible_collected`, `supplements_approved`
- Auto-calculated `profit` and `margin`

**G) `repair_job_profits` Table**
- Repair job profitability tracking
- Same structure as `job_costs` but specific to repair jobs

### 2. Material Cost Engine ✅

**Function:** `calculate_material_cost(job_id)`

- Reads from `material_usage` table
- Integrates with `materials_catalog` (Block 254800) for live supplier pricing
- Falls back to `cost_per_unit` if catalog price not available
- Returns total material cost for a job

**Integration:**
- Syncs with supplier network from Block 254800
- Uses `current_price` from `materials_catalog` when available
- Updates automatically when materials are delivered

### 3. Labor Hour Tracking ✅

**Function:** `calculate_labor_cost(job_id)`

- Sums all completed `labor_entries` (where `clock_out` is set)
- Calculates total labor cost from hours × hourly_rate

**Integration with Crew Clock-In/Out:**
- Trigger `sync_crew_time_to_labor_entries()` automatically syncs `crew_time_logs` → `labor_entries`
- When crew members clock out, labor entry is created automatically
- Job costs recalculate in real-time

**API Endpoints:**
- Existing: `/api/mobile/crew/time` (clock-in/out)
- New: Labor entries automatically created via trigger

### 4. Automatic Overhead Allocation ✅

**Function:** `calculate_overhead_allocation(job_id)`

- Reads `overhead_allocation_settings` for workspace
- Supports three allocation methods:
  - `per_job`: Divides total overhead by number of active jobs
  - `per_square`: Allocates based on square footage (if tracked)
  - `percentage_of_revenue`: Allocates as % of job revenue
- Categories: office, vehicle/fuel, insurance, software/tools, other

**API Endpoints:**
- `GET /api/workspaces/[workspaceId]/costing/overhead-settings` - Get settings
- `POST /api/workspaces/[workspaceId]/costing/overhead-settings` - Update settings

### 5. Real-Time Job Profit Dashboard ✅

**Function:** `update_job_costs(job_id)`

- Aggregates all costs: materials + labor + overhead
- Updates `job_costs` table with calculated values
- Auto-calculates profit and margin
- Triggers variance checks

**Auto-Update Triggers:**
- `material_usage` changes → recalculate costs
- `labor_entries` changes → recalculate costs
- `roofing_jobs.job_value` changes → recalculate costs

**API Endpoints:**
- `GET /api/jobs/[jobId]/costing/profit` - Get real-time profit dashboard
- `POST /api/jobs/[jobId]/costing/profit` - Recalculate profit

**Dashboard Data Includes:**
- Revenue, materials cost, labor cost, overhead, total cost
- Profit (dollars) and margin (percentage)
- Material usage with variance
- Labor entries summary
- Active variance alerts

### 6. Variance Alerts System ✅

**Function:** `check_job_variances(job_id)`

- **Material Variance:**
  - Compares `quantity_expected` vs `quantity_actual`
  - Creates alert if variance > 5%
  - Severity: >20% = critical, >10% = high, >5% = medium
  - Shows cost impact in dollars

- **Labor Variance:**
  - Flags if labor cost is unusually high (>50% of material cost)
  - Tracks hours worked vs expected

- **Margin Alerts:**
  - Low margin warning if < 30%
  - Critical if < 20%

**API Endpoints:**
- `GET /api/jobs/[jobId]/costing/variance-alerts` - Get alerts
- `PATCH /api/jobs/[jobId]/costing/variance-alerts/[alertId]` - Acknowledge/resolve

**Alert Types:**
- `material_variance` - Material over-usage
- `labor_variance` - Labor overrun
- `scope_variance` - Scope changes
- `cost_overrun` - General cost overrun
- `margin_low` - Low profit margin

### 7. Insurance Job Profit Calculator ✅

**Function:** `calculate_insurance_job_profit(job_id)`

- Tracks ACV (Actual Cash Value), depreciation, deductible, supplements
- Calculates total paid vs total cost
- Shows profit and margin for insurance jobs

**API Endpoints:**
- `GET /api/jobs/[jobId]/costing/insurance-profit` - Get insurance profit
- `POST /api/jobs/[jobId]/costing/insurance-profit` - Calculate/update

**Example Output:**
```json
{
  "profit": 10470.00,
  "margin": 66.3,
  "total_paid": 15800.00,
  "acv_paid": 9600.00,
  "depreciation": 5200.00,
  "deductible_collected": 1000.00,
  "total_cost": 5340.00
}
```

### 8. Repair Profitability Module ✅

**Function:** `calculate_repair_job_profit(job_id)`

- Specific profitability tracking for repair jobs
- Only processes jobs where `job_type = 'repair'`
- Shows high-margin repair profitability

**API Endpoints:**
- `GET /api/jobs/[jobId]/costing/repair-profit` - Get repair profit
- `POST /api/jobs/[jobId]/costing/repair-profit` - Calculate

**Example Output:**
```json
{
  "profit": 258.00,
  "margin": 73.7,
  "revenue": 350.00,
  "total_cost": 92.00
}
```

### 9. Company-Wide Profit Insights ✅

**Function:** `get_company_profit_insights(workspace_id, start_date, end_date)`

- Returns company-wide profit metrics
- Most/least profitable jobs
- Average margin
- Material waste percentage
- Average labor hours per square

**API Endpoints:**
- `GET /api/workspaces/[workspaceId]/costing/insights` - Get insights

**Example Output:**
```json
{
  "insights": {
    "total_revenue": 812400.00,
    "total_profit": 498100.00,
    "average_margin": 61.3,
    "most_profitable_job": {
      "job_id": "...",
      "title": "Job #1102",
      "margin": 67.0,
      "profit": 9396.00
    },
    "least_profitable_job": {
      "job_id": "...",
      "title": "Job #1098",
      "margin": 29.0,
      "profit": 1200.00
    }
  },
  "metrics": {
    "average_labor_hours_per_square": 0.42,
    "material_waste_percentage": 8.2
  }
}
```

## 🔄 Integration Points

### Existing Systems Integrated With:

1. **Roofing Jobs (Block 22270)** — Uses `roofing_jobs` table with `job_value` as revenue
2. **Material Usage (Block 42000)** — Enhanced with expected/actual tracking
3. **Supplier Network (Block 254800)** — Uses `materials_catalog` for live pricing
4. **Crew Time Tracking (Block 238000)** — Syncs `crew_time_logs` → `labor_entries`
5. **Workspaces** — Multi-tenant support via `workspace_id`

### Ready For Integration:

1. **Job Estimates** — Can feed expected material quantities
2. **Square Footage Tracking** — For per-square overhead allocation
3. **Insurance Claims** — For ACV/RCV data
4. **Crew Member Rates** — For accurate hourly rate calculation

## 📊 Usage Examples

### 1. Get Job Profit Dashboard

```typescript
GET /api/jobs/{jobId}/costing/profit

Response:
{
  "job": {
    "id": "...",
    "title": "Job #1102",
    "status": "in_progress",
    "revenue": 14800.00
  },
  "costs": {
    "materials_cost": 3843.00,
    "labor_cost": 936.00,
    "overhead_allocated": 625.00,
    "total_cost": 5404.00,
    "revenue": 14800.00,
    "profit": 9396.00,
    "margin": 63.4
  },
  "materials": {
    "variance": {
      "expected": 100,
      "actual": 103,
      "cost_impact": 114.00
    }
  },
  "labor": {
    "summary": {
      "total_hours": 18.4,
      "total_cost": 936.00
    }
  },
  "variance_alerts": [...]
}
```

### 2. Set Overhead Allocation

```typescript
POST /api/workspaces/{workspaceId}/costing/overhead-settings

Body:
{
  "office_overhead": 350.00,
  "vehicle_fuel": 150.00,
  "insurance_allocation": 75.00,
  "software_tools": 50.00,
  "allocation_method": "per_job"
}
```

### 3. Calculate Insurance Job Profit

```typescript
POST /api/jobs/{jobId}/costing/insurance-profit

Body:
{
  "acv_paid": 9600.00,
  "depreciation": 5200.00,
  "deductible_collected": 1000.00,
  "supplements_approved": 0
}
```

## 🎯 Key Features

### Real-Time Profit Tracking
- ✅ Auto-calculates profit and margin
- ✅ Updates instantly when costs change
- ✅ Shows exact dollar profit per job

### Variance Detection
- ✅ Material over-usage alerts
- ✅ Labor overrun warnings
- ✅ Low margin alerts
- ✅ Cost impact in dollars

### Overhead Allocation
- ✅ Automatic overhead per job
- ✅ Configurable allocation methods
- ✅ Multiple overhead categories

### Insurance Job Profitability
- ✅ ACV/RCV breakdown
- ✅ Depreciation tracking
- ✅ Deductible collection
- ✅ Supplement tracking

### Repair Profitability
- ✅ High-margin repair tracking
- ✅ Repair-specific profit calculations

### Company-Wide Insights
- ✅ Total revenue and profit
- ✅ Average margin
- ✅ Most/least profitable jobs
- ✅ Material waste tracking
- ✅ Labor efficiency metrics

## 🚀 Next Steps

1. **Frontend Dashboard** — Build UI for profit dashboard
2. **Material Expected Quantities** — Integrate with job estimates
3. **Crew Member Rates** — Store hourly rates in `crew_members` table
4. **Square Footage** — Add to `roofing_jobs` for per-square allocation
5. **Insurance Claim Integration** — Connect with insurance claim data
6. **Alerts Notifications** — Send alerts via email/push when variances occur

## 📝 Notes

- All profit and margin calculations are **GENERATED ALWAYS AS** columns for performance
- Triggers automatically update costs when materials, labor, or revenue changes
- Variance alerts are created automatically but can be acknowledged/resolved
- Overhead allocation is configurable per workspace
- Insurance and repair profits are separate tables for specialized tracking

---

**Block 255700 — Job Costing & Profit Engine v1 — COMPLETE ✅**






















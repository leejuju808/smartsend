# Block 252600 — SmartSend Profitability Engine v1

## Overview

The Profitability Engine is the financial brain of SmartSend, providing real-time job profit tracking, cost analysis, margin calculations, and profit alerts. This feature makes SmartSend UNTOUCHABLE in the roofing CRM market by solving the #1 problem roofing companies face: **not knowing their true job profit until it's too late**.

## Features

✅ **Real-Time Job Profit Dashboard** - Live view of every job's profitability  
✅ **Live Labor Cost Feed** - Automatically syncs from time clock + payroll engine  
✅ **Material Cost Tracking** - Expected vs actual material costs with reconciliation  
✅ **Sub Costs Tracking** - Automatic tracking from sub pay sheets  
✅ **Overhead Allocation** - Configurable overhead allocation per company  
✅ **Gross & Net Margin Calculator** - Real-time margin calculations  
✅ **Profit Alerts** - SMS/Email alerts for low margins (<30% warning, <15% critical)  
✅ **Forecasted Profit** - Predicts profit based on remaining work estimates  
✅ **Company Profit Overview** - Executive-level business intelligence  

## Database Schema

### Tables

1. **`job_costs`** - Consolidated cost entries
   - Tracks all costs: labor, materials, subs, overhead, misc
   - Links to source records (payroll, invoices, pay sheets)
   - Supports expected vs actual for materials

2. **`job_overhead_settings`** - Company overhead allocation settings
   - Configurable overhead rate (default 10%)
   - Supports percentage or flat rate allocation

### Views

1. **`job_profitability`** - Core profitability view
   - Real-time profit, costs, and margin calculations
   - Cost breakdown by type (labor, materials, subs, overhead)
   - Cost distribution percentages

### Functions

1. **`sync_labor_costs_from_time_clock()`** - Auto-syncs labor costs from time clock
2. **`insert_material_cost()`** - Inserts material costs (expected or actual)
3. **`sync_sub_costs_from_pay_sheets()`** - Auto-syncs sub costs from pay sheets
4. **`allocate_job_overhead()`** - Allocates overhead to jobs
5. **`calculate_forecasted_profit()`** - Calculates forecasted profit

## Live Cost Feeds

### Labor Feed
- **Source**: `crew_time_clock` table
- **Trigger**: Automatically inserts into `job_costs` when `clock_out` is set
- **Calculation**: Uses `payroll_time_expanded` view for hours × hourly_rate

### Material Costs Feed
- **Expected**: Use `insert_material_cost()` with `is_expected=true`
- **Actual**: Use `insert_material_cost()` with `is_expected=false` and invoice_number
- **Reconciliation**: System tracks expected vs actual automatically

### Subcontractor Costs Feed
- **Source**: `sub_pay_sheets` table
- **Trigger**: Automatically inserts into `job_costs` when pay sheet is created
- **Description**: Includes sub name and pay type

### Overhead Allocation
- **Trigger**: Automatically allocates when job is created or contract_value changes
- **Method**: Configurable per company (percentage or flat rate)
- **Default**: 10% of contract price

## Profit Alerts

### Edge Function: `profit-alerts`

**Location**: `/supabase/functions/profit-alerts/index.ts`

**Features**:
- Monitors jobs with margins < 30% (warning) or < 15% (critical)
- Sends SMS and Email alerts to company owner
- Can be triggered manually or via scheduled job

**Usage**:
```bash
# Check all jobs for a company
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/profit-alerts \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"company_id": "uuid-here"}'

# Check specific job
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/profit-alerts \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"job_id": "uuid-here"}'
```

**Alert Thresholds**:
- ⚠️ **Warning**: Margin < 30% (below company target)
- 🚨 **Critical**: Margin < 15% (immediate review needed)

## Frontend Pages

### 1. Profitability Dashboard
**Path**: `/app/workforce/profit/page.tsx`

**Features**:
- Job-level overview table
- Cost distribution pie chart
- Low margin jobs warning list
- High performers list
- Period selector (week/month/all)

**Access**: `/workforce/profit?company_id=xxx`

### 2. CEO Overview Dashboard
**Path**: `/app/ceo/overview/page.tsx`

**Features**:
- Total revenue, costs, net profit
- Company-wide margin
- Top performing crews
- Most expensive jobs
- Company performance summary

**Access**: `/ceo/overview?company_id=xxx`

## API Routes

### GET `/api/workforce/profitability`

**Query Parameters**:
- `company_id` (required if no job_id)
- `job_id` (optional, for single job)
- `period` (optional: "week" | "month" | "all", default: "month")

**Response**:
```json
{
  "data": [...],
  "summary": {
    "total_revenue": 0,
    "total_costs": 0,
    "total_profit": 0,
    "avg_margin": 0,
    "job_count": 0
  },
  "period": "month"
}
```

## Setup Instructions

### 1. Run Migration

```bash
# The migration is in:
supabase/migrations/20250130000001_block252600_profitability_engine_v1.sql
```

### 2. Deploy Edge Function

```bash
supabase functions deploy profit-alerts
```

### 3. Configure Environment Variables

Set in Supabase Dashboard → Edge Functions → Settings:
- `RESEND_API_KEY` (for email alerts)
- `TWILIO_ACCOUNT_SID` (for SMS alerts)
- `TWILIO_AUTH_TOKEN` (for SMS alerts)
- `TWILIO_PHONE_NUMBER` (for SMS alerts)

### 4. Set Up Overhead Settings

For each company, configure overhead allocation:

```sql
INSERT INTO job_overhead_settings (company_id, overhead_rate, allocation_method)
VALUES ('company-uuid', 0.10, 'percent');
```

### 5. Schedule Profit Alerts (Optional)

Set up a cron job to check for low margins daily:

```sql
-- Example: Check daily at 9 AM
SELECT cron.schedule(
  'profit-alerts-daily',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/profit-alerts',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

## Usage Examples

### Insert Expected Material Cost

```sql
SELECT insert_material_cost(
  'job-uuid',
  'company-uuid',
  'Estimated shingles (30 squares)',
  4500.00,
  true  -- is_expected
);
```

### Insert Actual Material Invoice

```sql
SELECT insert_material_cost(
  'job-uuid',
  'company-uuid',
  'Supplier Invoice #12345',
  4750.00,
  false,  -- is_actual
  '12345'  -- invoice_number
);
```

### Get Job Profitability

```sql
SELECT * FROM job_profitability WHERE job_id = 'job-uuid';
```

### Calculate Forecasted Profit

```sql
SELECT calculate_forecasted_profit('job-uuid');
```

### Manually Allocate Overhead

```sql
SELECT allocate_job_overhead('job-uuid');
```

## Why This Makes SmartSend UNTOUCHABLE

1. **Real-Time Truth** - Roofers see profit immediately, not 30-60 days later
2. **Zero Guessing** - All costs automatically tracked from existing systems
3. **Early Warning** - Alerts catch problems before jobs become losses
4. **Forecasting** - Predict problems before they happen
5. **Executive Intelligence** - Business intelligence roofing companies never had before

## Next Steps

- [ ] Add profit trend charts (time series)
- [ ] Add crew-level profitability tracking
- [ ] Add material cost variance analysis
- [ ] Add profit forecasting with ML
- [ ] Add profit benchmarking vs industry standards
- [ ] Add profit optimization recommendations

## Support

For issues or questions, refer to:
- Migration file: `supabase/migrations/20250130000001_block252600_profitability_engine_v1.sql`
- Edge function: `supabase/functions/profit-alerts/index.ts`
- Dashboard: `app/workforce/profit/page.tsx`
- CEO Dashboard: `app/ceo/overview/page.tsx`

























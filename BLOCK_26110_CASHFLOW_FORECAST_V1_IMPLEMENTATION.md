# BLOCK 26110 — SMARTSEND ROOFING CASHFLOW FORECAST v1

## Implementation Complete ✅

This block turns SmartSend into a financial crystal ball for roofing companies, predicting future cashflow and warning owners BEFORE they run out of money.

## What Was Built

### 1. Database Schema (`supabase/migrations/20250220000000_block26110_cashflow_forecast_v1.sql`)

**Table: `roofing_cashflow_events`**
- Tracks all incoming and outgoing cashflow events tied to roofing jobs
- Fields:
  - `workspace_id` - Links to workspace
  - `job_id` - Optional link to specific job
  - `type` - 'incoming' or 'outgoing'
  - `category` - e.g., 'insurance_check', 'deposit', 'progress_payment', 'material_order', 'crew_payroll', etc.
  - `amount` - Cashflow amount
  - `expected_date` - When the cashflow is expected
  - `actual` - Whether the event has actually happened
  - `actual_date` - When it actually happened
  - `description` - Optional notes

**Helper Functions:**
- `get_cashflow_forecast()` - Returns daily cashflow breakdown for a date range
- `get_cashflow_alerts()` - Returns days with negative cashflow forecast

**Security:**
- Row Level Security (RLS) policies ensure users can only access cashflow events in their workspace
- Indexes for performance on common queries

### 2. Supabase Edge Function (`supabase/functions/forecast-cashflow/`)

**Purpose:** Forecasts cashflow 30/60/90 days out and calculates:
- Total incoming
- Total outgoing
- Net cashflow by day
- Cumulative balance
- Identifies negative dips (red flag days)

**Features:**
- Supports 30, 60, or 90 day forecasts
- Returns timeline with daily breakdown
- Calculates summary statistics
- Identifies red flag days automatically

### 3. API Route (`app/api/cashflow/forecast/route.ts`)

**Endpoint:** `GET /api/cashflow/forecast`

**Query Parameters:**
- `workspace_id` (optional) - Uses current workspace if not provided
- `days` (optional) - 30, 60, or 90 (default: 90)

**Response:**
```json
{
  "ok": true,
  "forecast": {
    "workspace_id": "...",
    "days": 90,
    "start_date": "2025-02-20",
    "end_date": "2025-05-21",
    "timeline": {
      "2025-02-20": {
        "incoming": 5000,
        "outgoing": 3000,
        "net": 2000,
        "cumulative": 2000
      },
      ...
    },
    "summary": {
      "total_incoming": 150000,
      "total_outgoing": 120000,
      "total_net": 30000,
      "min_daily_net": -5000,
      "min_cumulative_balance": -2000,
      "red_flag_days_count": 3
    },
    "red_flag_days": [
      {
        "day": "2025-03-15",
        "net": -5000,
        "incoming": 0,
        "outgoing": 5000
      }
    ]
  }
}
```

### 4. UI Components

**CashflowForecastPanel** (`app/(dashboard)/cashflow/_components/CashflowForecastPanel.tsx`)
- Main dashboard panel component
- Shows summary cards (Total Incoming, Total Outgoing, Net Cashflow, Risk Days)
- Displays red flag alerts with specific dates and amounts
- 30/60/90 day toggle buttons
- Toggle for cumulative balance view

**CashflowForecastChart** (`app/(dashboard)/cashflow/_components/CashflowForecastChart.tsx`)
- Interactive line chart using Recharts
- Shows incoming (green), outgoing (orange), and net cashflow (blue) lines
- Optional cumulative balance line (purple, dashed)
- Zero line reference for easy visualization
- Formatted currency tooltips

**Dashboard Page** (`app/(dashboard)/cashflow/page.tsx`)
- Main cashflow forecast dashboard page
- Clean, focused UI

## How This Helps Roofers (Real Money Impact)

### 1. Prevents Cashflow Crises
Roofers stop running out of cash in the middle of jobs. SmartSend warns them before they hit trouble.

### 2. Smart Job Scheduling
They schedule roofing projects based on cash priority:
- Homeowner project → slow
- Insurance job → fast
- Supplement-heavy → very profitable

SmartSend becomes their PM + CFO.

### 3. Material Order Timing
Roofers don't waste money on early orders. They know exactly when to order materials based on cashflow.

### 4. Hiring Decisions
Cashflow forecast shows available runway, helping them know when they can hire another crew.

### 5. Recession-Proof Value
Even in slow seasons, SmartSend protects liquidity. This is why they'll NEVER cancel the tool.

## Usage

### Adding Cashflow Events

```sql
-- Example: Insurance check coming in
INSERT INTO roofing_cashflow_events (
  workspace_id,
  job_id,
  type,
  category,
  amount,
  expected_date,
  description
) VALUES (
  'workspace-uuid',
  'job-uuid',
  'incoming',
  'insurance_check',
  25000.00,
  '2025-03-01',
  'ACV payment from State Farm'
);

-- Example: Material order going out
INSERT INTO roofing_cashflow_events (
  workspace_id,
  job_id,
  type,
  category,
  amount,
  expected_date,
  description
) VALUES (
  'workspace-uuid',
  'job-uuid',
  'outgoing',
  'material_order',
  8000.00,
  '2025-02-25',
  'Shingles and materials for Smith job'
);
```

### Viewing Forecast

Navigate to `/cashflow` in the dashboard to see the forecast panel.

## Files Created

1. `supabase/migrations/20250220000000_block26110_cashflow_forecast_v1.sql` - Database schema
2. `supabase/functions/forecast-cashflow/index.ts` - Edge function
3. `supabase/functions/forecast-cashflow/deno.json` - Deno config
4. `app/api/cashflow/forecast/route.ts` - API route
5. `app/(dashboard)/cashflow/page.tsx` - Dashboard page
6. `app/(dashboard)/cashflow/_components/CashflowForecastPanel.tsx` - Main panel component
7. `app/(dashboard)/cashflow/_components/CashflowForecastChart.tsx` - Chart component

## Next Steps

1. **Deploy Migration:** Run the SQL migration in Supabase
2. **Deploy Edge Function:** `supabase functions deploy forecast-cashflow`
3. **Add Cashflow Events:** Integrate with job creation/updates to auto-create cashflow events
4. **Automated Warnings:** Set up email/SMS alerts for red flag days
5. **Integration:** Connect with job scheduling to show cash impact of scheduling decisions

## Technical Notes

- Uses Recharts for visualization
- Edge function uses Supabase service role key for database access
- RLS policies ensure workspace isolation
- Forecast calculates cumulative balance for running total
- Red flag detection happens automatically in the forecast




































# Block 51000 — SmartSend Roofing "Crew Payroll + Labor Cost Tracking System" v1 Implementation

## 🎯 Mission

**THE CREW PAYROLL + LABOR COST TRACKING SYSTEM — ZERO FLUFF.**

This block makes SmartSend the money hub for crews — tracking EXACTLY what each crew member earns, what the company owes, and what labor costs per job actually are.

This is massive for roofers. Most roofing companies don't track labor correctly. They lose money every week because:
- ❌ labor hours aren't logged
- ❌ piecework (per square) isn't documented
- ❌ overtime isn't calculated
- ❌ pay disputes happen
- ❌ job profitability is unknown
- ❌ owners get surprised by labor bills

**SmartSend will now manage ALL OF IT.**

## ✅ Implementation Complete

### 1. Database Schema ✅

**File:** `supabase/migrations/20250302000000_block51000_crew_payroll_labor_cost_tracking_v1.sql`

#### Core Tables Created:

**A) `crew_pay_settings` Table**
- Per-member pay type configuration
- Fields:
  - `pay_type`: hourly, piecework, or hybrid
  - `hourly_rate`, `overtime_rate`, `double_time_rate`
  - `square_rate`, `ridge_rate`, `vent_rate`, `plywood_rate`, `removal_rate`
  - `overtime_threshold_hours` (default 40)
  - `daily_overtime_enabled` (CA law: daily overtime)
  - `require_gps_verification`, `job_site_radius_meters`
  - `scheduled_start_hour`, `scheduled_end_hour`

**B) `timecards` Table**
- Auto-generated via crew app
- Fields:
  - `member_id`, `job_id`
  - `clock_in`, `clock_out`
  - `total_hours`, `overtime_hours`
  - `gps_in`, `gps_out`, `gps_verified`
  - `hourly_rate`, `regular_pay`, `overtime_pay`, `piecework_pay`, `total_pay`
  - `status`: active, paused, completed, disputed
  - `supervisor_id`, `supervisor_sign_off_at` (for dispute prevention)

**C) `piecework_records` Table**
- Per job piecework tracking
- Fields:
  - `squares`, `ridge_feet`, `plywood_sheets`, `vents_count`, `removal_squares`
  - `additional_items` (JSONB for flexibility)
  - `square_rate`, `ridge_rate`, etc. (snapshot of rates)
  - `total_pay` (calculated)
  - `photos` (array of photo URLs for verification)
  - `supervisor_verified`, `supervisor_verified_at`

**D) `payroll_runs` Table**
- Weekly or per payday payroll runs
- Fields:
  - `period_start`, `period_end`, `pay_date`
  - `total_labor_cost`, `total_hours`, `total_overtime_hours`, `total_piecework_pay`
  - `total_members`
  - `status`: open, processing, processed, paid, cancelled
  - `exported_to_csv`, `exported_to_quickbooks`, `exported_to_pdf`, `export_file_url`

**E) `payroll_items` Table**
- Per member per payroll run items
- Fields:
  - `payroll_id`, `member_id`
  - `total_hours`, `regular_hours`, `overtime_hours`
  - `regular_pay`, `overtime_pay`, `piecework_pay`, `total_pay`
  - `jobs_worked` (JSONB array of job IDs)
  - `status`: pending, calculated, approved, paid

#### Views Created:

**`job_labor_cost_summary` View**
- Job-level labor cost summary
- Shows: total hours, overtime, regular pay, overtime pay, piecework pay, total labor cost
- Integrates with job costing engine

#### Functions Created:

**`calculate_overtime_hours()`**
- Calculates overtime hours (40-hour weekly or daily 8-hour CA law)
- Supports both weekly and daily overtime rules

**`verify_gps_location()`**
- Verifies GPS is within job site radius
- Uses Haversine formula for distance calculation

**`calculate_timecard_pay()` (Trigger)**
- Auto-calculates timecard pay when clock_out is set
- Calculates regular hours, overtime hours, regular pay, overtime pay

**`calculate_piecework_pay()` (Trigger)**
- Auto-calculates piecework pay when quantities are set
- Uses rates from pay settings

### 2. Edge Functions ✅

**File:** `supabase/functions/payroll/index.ts`

#### Endpoints:

**POST `/payroll/clock-in`**
- Validates GPS
- Creates timecard or updates it
- Marks time as "active"
- Returns: timecard with GPS verification status

**POST `/payroll/clock-out`**
- Calculates hours
- Calculates overtime
- Calculates pay
- Closes timecard
- Returns: timecard with calculated pay

**POST `/payroll/calc-piecework`**
- Triggered when job marked complete or when materials logged
- Calculates piecework pay for each crew member
- Returns: piecework record with calculated pay

**POST `/payroll/run`**
- Creates payroll run
- Pulls all timecards for period
- Sums hourly + OT + piecework
- Generates totals
- Creates payroll items for each member
- Returns: payroll run with items

**GET `/payroll/forecast`**
- Uses production calendar to predict labor cost
- Returns: forecast with estimated jobs and labor cost

### 3. API Routes ✅

**Files:** `app/api/payroll/*/route.ts`

#### Routes Created:

**POST `/api/payroll/clock-in`**
- Next.js API route for clock-in
- Validates user authentication
- Calls edge function logic
- Returns: timecard

**POST `/api/payroll/clock-out`**
- Next.js API route for clock-out
- Validates user authentication
- Calls edge function logic
- Returns: timecard with calculated pay

**POST `/api/payroll/piecework`**
- Next.js API route for piecework calculation
- Validates user authentication
- Creates/updates piecework records
- Returns: piecework record with calculated pay

**POST `/api/payroll/run`**
- Next.js API route for payroll run creation
- Validates user authentication
- Aggregates timecards and piecework
- Creates payroll items
- Returns: payroll run with items

**GET `/api/payroll/dashboard`**
- Next.js API route for payroll dashboard
- Returns: payroll summary, totals, top jobs

**GET `/api/payroll/forecast`**
- Next.js API route for labor cost forecast
- Returns: forecast data

### 4. Features Implemented ✅

#### ✅ Time Tracking → Payroll Pipeline
- Crew app can start/pause/end job
- SmartSend automatically builds timecard
- Tracks: member_id, job_id, total hours, overtime hours, hourly rate, total pay

#### ✅ Multi-Pay Types
- **Hourly**: Crew members earn hourly wages
- **Piecework**: Per-square pay (squares, ridge, vent, plywood, removal)
- **Hybrid**: Supports both

#### ✅ Overtime Engine
- Configurable: 40-hour overtime, daily overtime (CA law)
- Time-and-a-half calculation
- Double time support (optional v1.5)

#### ✅ GPS-Verified Clock-Ins
- Start time only valid if within job site radius
- Inside scheduled work hours
- Prevents "start shift from home"

#### ✅ Job-Level Labor Cost Summary
- Owners see: estimated labor, actual labor, overtime, piecework payments, variance, profit impact
- Powers Job Cost Engine (Block 43000)

#### ✅ Crew Payroll Report
- Per week or per payday
- Shows: crew member, hours worked, jobs worked, overtime, piecework payment, total due
- Exports to: CSV, QuickBooks, PDF (structure ready)

#### ✅ Pay Dispute Prevention
- Every timecard has: timestamps, GPS logs, supervisor QC sign-off, job start/end logs
- No arguing

#### ✅ Labor Forecasting (simple v1)
- Using the Production Calendar
- SmartSend predicts weekly labor cost
- Alerts owner if projected costs > budget

## 📋 MVP Build Slice (Ship Fast)

✅ Timecard creation (clock-in/out)
✅ Hourly payroll calculation
✅ Piecework calculation (simple v1)
✅ Payroll run summary export
✅ Job-level labor cost view

**Enough for v1.**

## 🔄 Next Steps

1. **Crew App UI Upgrades**
   - Punch In / Punch Out interface
   - Piecework submission form
   - Show: Job, Clock status, Hours worked, Pay type

2. **Owner Dashboard — Payroll View**
   - Payroll Summary Page
   - Crew Member Payroll Cards
   - Job Cost Integration

3. **Export Functionality**
   - CSV export
   - QuickBooks integration
   - PDF generation

4. **Production Calendar Integration**
   - Connect forecast to actual scheduled jobs
   - Improve labor cost prediction

## 🎯 How This Makes SmartSend Money

This is one of the MOST VALUABLE modules in roofing operations.

Roofers will pay because:
- Payroll is a nightmare
- Labor disputes cost $$$
- Overtime surprises destroy margin
- Piecework is messy
- Owners want job-level labor cost instantly
- No other roofing SaaS has payroll this clean

This pushes SmartSend firmly into:
**Operations + Finance + Crew Management = UNREPLACEABLE.**

This is what locks roofing companies into SmartSend for years.

## 📝 Notes

- Tables are flexible to work with both `jobs` and `roofing_jobs` tables
- GPS verification uses Haversine formula
- Overtime calculation supports both weekly (40-hour) and daily (8-hour CA law) rules
- All pay calculations are automatic via database triggers
- RLS policies are set up for service role (application-level auth can be added)

## 🚀 Deployment

1. Run migration: `supabase/migrations/20250302000000_block51000_crew_payroll_labor_cost_tracking_v1.sql`
2. Deploy edge function: `supabase functions deploy payroll`
3. API routes are ready in `app/api/payroll/`
4. Integrate with crew app UI
5. Integrate with owner dashboard

---

**Block 51000 Complete ✅**

**Next Block:** Block 52000 — SmartSend Roofing "Warranty Tracking + Service Call System" v1

































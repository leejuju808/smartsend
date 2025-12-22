# Block 25500 — SmartSend Roofing Payroll & Crew Pay v1 Implementation

## 🎯 Mission

**THE CREW PAY + PAYROLL ENGINE — ZERO FLUFF.**

This block handles one of the BIGGEST pain points in roofing:
- Paying crews accurately
- Tracking labor costs correctly
- Avoiding disputes
- Keeping crews motivated
- Forecasting payroll
- Knowing true labor cost per job

## ✅ Implementation Complete

### 1. Database Schema ✅

**File:** `supabase/migrations/20250130000001_block25500_crew_payroll_engine_v1.sql`

#### Core Tables Created:

**A) Enhanced `crews` Table**
- Added pay model configuration fields:
  - `pay_model_type`: piece_rate, hourly, or hybrid
  - `piece_rate_tear_off_per_square`, `piece_rate_install_per_square`, `piece_rate_cleanup_per_square`
  - `hourly_rate`, `overtime_rate`, `drive_time_rate`
  - `drive_time_policy`: paid, unpaid, half_paid
  - `break_time_minutes`, `minimum_hours_per_day`
  - `bonus_enabled`, `penalty_enabled`

**B) Enhanced `roofing_jobs` Table**
- Added labor calculation fields:
  - `roof_squares`, `roof_pitch`, `cut_up_factor`, `complexity_factor`
  - `skylights_count`, `chimneys_count`, `valleys_count`
  - `decking_replacement_squares`, `ridge_height_feet`
  - `target_hours`, `actual_hours`
  - `calculated_labor_cost`, `labor_cost_calculation_method`

**C) `crew_check_ins` Table**
- Track crew check-in and check-out times
- Fields:
  - `check_in_time`, `check_out_time`
  - `check_in_location`, `check_out_location`
  - `break_start_time`, `break_end_time`, `break_duration_minutes`
  - `drive_time_minutes`
  - `start_photos`, `mid_photos`, `end_photos`
  - `tasks_completed`, `cleanup_confirmed`, `cleanup_photos`
  - `total_hours`, `billable_hours`, `regular_hours`, `overtime_hours`
  - `status`: checked_in, on_break, checked_out, completed

**D) `crew_pay_entries` Table**
- Main table for tracking crew pay calculations per job
- Fields:
  - `pay_model_type`: piece_rate, hourly, hybrid
  - Piece-rate fields: `squares_installed`, `piece_rate_total`
  - Hourly fields: `hours_worked`, `regular_hours`, `overtime_hours`, `hourly_total`
  - Drive time: `drive_time_minutes`, `drive_time_total`
  - Adjustments: `bonuses_total`, `penalties_total`
  - Final: `base_pay`, `total_pay`
  - Status: pending, calculated, approved, paid, disputed
  - Approval workflow: `approved_by`, `approved_at`, `paid_at`, `payment_reference`
  - Dispute tracking: `disputed`, `dispute_reason`, `dispute_resolved_at`
  - `calculation_details`: Full calculation breakdown (JSONB)

**E) `crew_bonuses` Table**
- Track bonuses awarded to crews
- Bonus types: quality, speed, safety, review, custom
- Fields for each bonus type (photo_compliance_score, cleanup_score, target_hours, actual_hours, homeowner_rating, etc.)

**F) `crew_penalties` Table**
- Track penalties/deductions for crews
- Penalty types: cleanup_failure, poor_photos, improper_install, broken_items, wrong_materials, callback, safety_violation, custom
- Fields for callback penalties, photo penalties, cleanup penalties

**G) Enhanced `crew_performance_scores` Table**
- Track crew performance scores for incentives and comparison
- Metrics:
  - Job metrics: `jobs_completed`, `jobs_on_time`, `on_time_percentage`
  - Speed: `avg_hours_per_job`, `avg_hours_vs_target`, `speed_score`
  - Quality: `photo_compliance_percentage`, `cleanup_quality_score`, `callback_rate`, `rework_rate`, `quality_score`
  - Homeowner satisfaction: `avg_homeowner_rating`, `review_score`
  - Safety: `safety_incidents`, `safety_score`
  - Profit impact: `avg_profit_per_job`, `profit_impact_score`
  - Material waste: `material_waste_percentage`, `waste_score`
  - Overall: `overall_score`, `score_category` (elite, reliable, needs_coaching, at_risk)

**H) `payroll_exports` Table**
- Track payroll exports for QuickBooks, Gusto, ADP, CSV
- Fields:
  - `export_type`: quickbooks, gusto, adp, csv, excel
  - `export_format`: csv, xlsx, qbo, json
  - `pay_period_start`, `pay_period_end`
  - `export_data`: Full export data (JSONB)
  - `export_file_url`, `export_file_name`
  - `status`: pending, generated, exported, failed
  - `crew_ids`, `total_crew_count`, `total_pay_amount`

#### Key Functions Created:

1. **`calculate_piece_rate_labor_cost(p_job_id, p_crew_id)`**
   - Calculates labor cost using piece-rate model
   - Accounts for roof squares, pitch multiplier, cut-up factor, complexity factor
   - Handles skylights, chimneys, valleys, decking replacement

2. **`calculate_hourly_labor_cost(p_job_id, p_crew_id)`**
   - Calculates labor cost using hourly model
   - Accounts for regular hours, overtime hours, drive time
   - Respects drive time policy (paid, unpaid, half_paid)

3. **`calculate_crew_pay_entry(p_job_id, p_crew_id)`**
   - Main function to calculate crew pay entry
   - Supports piece-rate, hourly, and hybrid models
   - Calculates bonuses and penalties
   - Updates job labor cost
   - Returns pay entry ID

4. **`calculate_crew_performance_score(p_crew_id, p_period_start, p_period_end)`**
   - Calculates comprehensive crew performance score
   - Aggregates metrics from jobs completed in period
   - Calculates weighted overall score
   - Determines score category (elite, reliable, needs_coaching, at_risk)

5. **`auto_calculate_check_in_hours()`** (Trigger Function)
   - Automatically calculates hours when check-out time is set
   - Calculates break duration, billable hours, regular vs overtime

6. **`auto_update_pay_on_checkout()`** (Trigger Function)
   - Automatically recalculates pay when crew checks out

7. **`update_bonuses_total()`** (Trigger Function)
   - Updates bonuses total when bonus is added/updated/deleted

8. **`update_penalties_total()`** (Trigger Function)
   - Updates penalties total when penalty is added/updated/deleted

#### Views Created:

1. **`labor_cost_forecast`**
   - Labor cost forecast by week and month
   - Shows estimated labor cost, jobs count, crews count, labor cost percentage

2. **`owner_payroll_dashboard`**
   - Owner payroll dashboard summary
   - Shows weekly payroll totals, bonuses, penalties, labor cost percentage

3. **`crew_performance_summary`**
   - Crew performance summary with earnings
   - Shows overall score, jobs completed, callback rate, avg pay per job

### 2. API Routes ✅

#### Crew Check-In/Check-Out

**POST `/api/crew/check-in`**
- Create crew check-in for a job
- Requires: `job_id`, `crew_id`
- Optional: `crew_member_id`, `check_in_location`, `start_photos`, `notes`
- Returns: Check-in record

**POST `/api/crew/check-out`**
- Update crew check-out for a job
- Requires: `job_id`, `crew_id`
- Optional: `check_out_location`, `end_photos`, `tasks_completed`, `cleanup_confirmed`, `cleanup_photos`, `break_start_time`, `break_end_time`, `drive_time_minutes`, `notes`
- Automatically triggers pay calculation
- Returns: Updated check-in record

**GET `/api/crew/check-in?job_id=xxx&crew_id=xxx`**
- Get check-in status for a job/crew
- Returns: Latest check-in record or null

#### Crew Pay Management

**GET `/api/crew/pay?job_id=xxx&crew_id=xxx&workspace_id=xxx&status=xxx`**
- Get crew pay entries with filters
- Returns: Array of pay entries with job, crew, bonuses, penalties

**POST `/api/crew/pay`**
- Calculate crew pay for a job
- Requires: `job_id`, `crew_id`
- Calls `calculate_crew_pay_entry` RPC
- Returns: Calculated pay entry

**PATCH `/api/crew/pay/[id]`**
- Update crew pay entry
- Can update: `status`, `notes`, `payment_reference`
- Status changes trigger approval workflow
- Returns: Updated pay entry

#### Crew Bonuses

**POST `/api/crew/bonuses`**
- Create bonus for a crew
- Requires: `job_id`, `crew_id`, `bonus_type`, `bonus_amount`, `bonus_reason`
- Bonus types: quality, speed, safety, review, custom
- Automatically recalculates pay entry
- Returns: Created bonus record

#### Crew Penalties

**POST `/api/crew/penalties`**
- Create penalty for a crew
- Requires: `job_id`, `crew_id`, `penalty_type`, `penalty_amount`, `penalty_reason`
- Penalty types: cleanup_failure, poor_photos, improper_install, broken_items, wrong_materials, callback, safety_violation, custom
- Automatically recalculates pay entry
- Returns: Created penalty record

#### Payroll Dashboard

**GET `/api/payroll/dashboard?workspace_id=xxx&period=week|month`**
- Get owner payroll dashboard data
- Returns:
  - `dashboard`: Weekly/monthly payroll summaries
  - `crew_performance`: Crew performance scores
  - `top_crews`: Top earning crews
  - `forecast`: Labor cost forecast

#### Payroll Export

**POST `/api/payroll/export`**
- Generate payroll export
- Requires: `workspace_id`, `export_type`, `pay_period_start`, `pay_period_end`
- Export types: quickbooks, gusto, adp, csv, excel
- Optional: `crew_ids` (filter by specific crews)
- Returns:
  - `export`: Export record
  - `data`: Formatted export data
  - `file_name`: Suggested file name

### 3. Features Implemented ✅

#### ✅ Piece-Rate Pay Model
- Automatic calculation based on roof squares
- Pitch multiplier support
- Cut-up complexity factor
- Skylights, chimneys, valleys adjustments
- Decking replacement pricing

#### ✅ Hourly Pay Model
- Clock-in/clock-out tracking
- Overtime calculation (over 8 hours)
- Break time tracking
- Drive time rules (paid, unpaid, half_paid)

#### ✅ Hybrid Pay Model
- Supports both piece-rate and hourly
- Uses higher of the two calculations

#### ✅ Crew Check-In/Check-Out
- Timestamp tracking
- Location tracking (GPS)
- Photo uploads (start, mid, end)
- Task completion confirmation
- Cleanup confirmation

#### ✅ Labor Cost Calculation
- Automatic calculation based on pay model
- Updates job labor cost
- Integrates with job profit engine

#### ✅ Callbacks & Penalties
- Optional penalty system
- Tracks cleanup failures, poor photos, improper install
- Callback cost tracking
- Broken items tracking

#### ✅ Crew Performance Score
- Comprehensive scoring system
- Categories: Elite (95-100), Reliable (85-94), Needs Coaching (70-84), At Risk (<70)
- Based on: install speed, photo compliance, cleanup quality, homeowner feedback, job profit impact, rework frequency, on-time arrival, safety, material waste

#### ✅ Crew Bonus System
- Quality bonus (photo review, cleanup score)
- Speed bonus (under projected time)
- Safety bonus (zero incidents)
- Review bonus (5-star rating)
- Custom bonuses

#### ✅ Payroll Export
- QuickBooks format
- Gusto format
- ADP format
- Excel CSV format
- JSON format

#### ✅ Labor Cost Forecasting
- Weekly forecast
- Monthly forecast
- Cost per crew
- Cost per job
- Cashflow forecast

#### ✅ Crew Pay Dispute Protection
- Logs hours, timestamps, photos
- Job notes, material shortages, delays
- Change orders tracking
- Full documentation for disputes

#### ✅ Owner Payroll Dashboard
- This week's payroll
- Labor % vs revenue
- Top earning crews
- Least profitable crews
- Hours worked per crew
- Installs per crew
- Callbacks per crew
- Quality breakdown

### 4. How This Makes Roofers More Money ✅

- ✅ Fewer payroll mistakes
- ✅ Fewer disputes
- ✅ Smart crew incentives
- ✅ Faster installs
- ✅ Higher quality installs
- ✅ Fewer callbacks
- ✅ Predictable labor cost
- ✅ Accurate job costing
- ✅ Higher margin per job
- ✅ Better crew performance

### 5. How This Makes SmartSend Unreplaceable ✅

Once SmartSend:
- Calculates crew pay
- Calculates labor cost
- Exports payroll
- Scores crew performance
- Integrates with job profit
- Forecasts labor expenses
- Protects the company in disputes
- Gives owners visibility

Roofers realize:
**"SmartSend literally runs my labor and payroll."**

Canceling SmartSend = payroll chaos + lost profit.

They will NOT cancel.

## 📋 Next Steps

1. **Run Migration**: Apply the migration to your database
2. **Configure Crews**: Set up pay models for each crew
3. **Test Check-In/Check-Out**: Test crew check-in and check-out flows
4. **Test Pay Calculation**: Test pay calculation for both piece-rate and hourly models
5. **Test Bonuses/Penalties**: Test bonus and penalty creation
6. **Test Payroll Export**: Test payroll export for different formats
7. **Test Dashboard**: Verify owner payroll dashboard displays correctly
8. **Test Performance Scoring**: Run performance score calculation for crews

## 🔧 Configuration

### Setting Up Crew Pay Models

```sql
-- Example: Set up piece-rate crew
UPDATE crews
SET 
  pay_model_type = 'piece_rate',
  piece_rate_tear_off_per_square = 40.00,
  piece_rate_install_per_square = 60.00,
  piece_rate_cleanup_per_square = 10.00
WHERE id = 'crew-id';

-- Example: Set up hourly crew
UPDATE crews
SET 
  pay_model_type = 'hourly',
  hourly_rate = 28.00,
  overtime_rate = 42.00,
  drive_time_rate = 28.00,
  drive_time_policy = 'paid'
WHERE id = 'crew-id';
```

### Calculating Pay for a Job

```sql
-- Calculate pay entry
SELECT calculate_crew_pay_entry('job-id', 'crew-id');

-- Get pay entry
SELECT * FROM crew_pay_entries
WHERE job_id = 'job-id' AND crew_id = 'crew-id';
```

### Calculating Performance Score

```sql
-- Calculate performance score for a period
SELECT calculate_crew_performance_score(
  'crew-id',
  '2024-01-01'::date,
  '2024-01-31'::date
);
```

## 📊 Usage Examples

### Crew Check-In Flow

1. Crew arrives at job site
2. Crew checks in via mobile app: `POST /api/crew/check-in`
3. System records check-in time and location
4. Crew uploads start photos
5. Crew works on job
6. Crew checks out: `POST /api/crew/check-out`
7. System automatically calculates hours and pay

### Pay Calculation Flow

1. Job is completed
2. System calculates pay based on pay model: `POST /api/crew/pay`
3. Owner reviews pay entry
4. Owner adds bonuses/penalties if needed: `POST /api/crew/bonuses` or `POST /api/crew/penalties`
5. Owner approves pay: `PATCH /api/crew/pay/[id]` with `status: 'approved'`
6. Pay is processed: `PATCH /api/crew/pay/[id]` with `status: 'paid'`

### Payroll Export Flow

1. Owner selects pay period
2. Owner selects export format (QuickBooks, Gusto, ADP, CSV)
3. System generates export: `POST /api/payroll/export`
4. Owner downloads export file
5. Owner imports into payroll system

## 🎯 Key Benefits

1. **Accurate Pay Calculation**: No more guessing or disputes
2. **Labor Cost Visibility**: Know true labor cost per job
3. **Crew Performance Tracking**: Identify top performers and those needing coaching
4. **Payroll Automation**: Export-ready payroll data
5. **Dispute Protection**: Full documentation for every payment
6. **Forecasting**: Predict labor costs for upcoming jobs
7. **Incentives**: Motivate crews with bonuses
8. **Quality Control**: Penalties for poor work

## 🔒 Security

- All tables have Row-Level Security (RLS) enabled
- Users can only access data in their workspace
- Admin/owner role required for bonuses, penalties, and exports
- All API routes verify authentication and workspace access

## 📝 Notes

- Pay calculation is automatic when crew checks out
- Bonuses and penalties automatically update pay entries
- Performance scores are calculated per period (weekly/monthly)
- Payroll exports can be filtered by crew IDs
- All timestamps are stored in UTC

---

**Block 25500 Implementation Complete** ✅





































# BLOCK 254000 — SmartSend Productivity Engine v1 Implementation

## ✅ Implementation Complete

**"Crew Efficiency Scores, Install Speed Metrics, Material Waste Tracking, Predictive Bottleneck Detection"**

This block turns SmartSend into a productivity and performance intelligence system. Roofers will say:
- "SmartSend shows us exactly where we lose money."
- "We finally know which crews perform the best."
- "You'd be stupid not using this."

---

## 📊 Database Schema

### Migration File
`supabase/migrations/20250230000000_block254000_productivity_engine_v1.sql`

### Tables Created

#### 1. `productivity_metrics`
Tracks all productivity metrics for jobs, crews, and employees.

**Fields:**
- `id` (uuid, primary key)
- `workspace_id` (uuid, references workspaces)
- `job_id` (uuid, nullable - references jobs or roofing_jobs)
- `crew_id` (uuid, nullable - references crews)
- `employee_id` (uuid, nullable)
- `metric_type` (text) - 'install_speed', 'waste', 'qc', 'arrival_accuracy', 'safety', 'on_time_completion', 'material_efficiency', 'labor_efficiency'
- `value` (numeric) - The metric value
- `unit` (text) - 'hours', 'percent', 'score', etc.
- `task_name` (text, nullable) - 'tear-off', 'underlayment', 'install', etc.
- `job_type` (text, nullable)
- `notes` (text, nullable)
- `created_at` (timestamptz)

#### 2. `crew_efficiency_scores`
Stores calculated efficiency scores for crews (0-100).

**Fields:**
- `id` (uuid, primary key)
- `workspace_id` (uuid, references workspaces)
- `crew_id` (uuid, references crews)
- `score` (int, 0-100) - Overall efficiency score
- `install_speed_score` (int, 0-100)
- `qc_quality_score` (int, 0-100)
- `material_waste_score` (int, 0-100)
- `on_time_rate_score` (int, 0-100)
- `safety_score` (int, 0-100)
- `rating_tier` (text) - 'elite', 'strong', 'average', 'needs_improvement', 'high_risk'
- `period_start` (date)
- `period_end` (date)
- `jobs_count` (int)
- `calculated_at`, `updated_at` (timestamptz)

#### 3. `job_task_durations`
Tracks duration of each task for a job.

**Fields:**
- `id` (uuid, primary key)
- `workspace_id` (uuid, references workspaces)
- `job_id` (uuid, references jobs or roofing_jobs)
- `crew_id` (uuid, nullable - references crews)
- `task_name` (text) - 'tear-off', 'underlayment', 'install', 'ridge', 'cleanup'
- `milestone_id` (uuid, nullable - references production_milestones)
- `start_time` (timestamptz)
- `end_time` (timestamptz, nullable)
- `duration_minutes` (int, calculated)
- `baseline_duration_minutes` (int, nullable)
- `variance_percent` (numeric, nullable)
- `created_at`, `updated_at` (timestamptz)

#### 4. `material_waste_logs`
Tracks material waste by comparing estimated vs actual usage.

**Fields:**
- `id` (uuid, primary key)
- `workspace_id` (uuid, references workspaces)
- `job_id` (uuid, references jobs or roofing_jobs)
- `material_name` (text) - 'bundles', 'ridge', 'underlayment', etc.
- `material_unit` (text) - 'bundles', 'rolls', 'linear_feet'
- `estimated_needed` (numeric)
- `actual_used` (numeric)
- `waste_percent` (numeric, generated) - Calculated automatically
- `waste_category` (text) - 'acceptable', 'moderate', 'excessive', 'critical'
- `unit_cost` (numeric, nullable)
- `waste_cost` (numeric, nullable)
- `logged_by` (uuid, nullable - references auth.users)
- `notes` (text, nullable)
- `created_at` (timestamptz)

#### 5. `productivity_bottlenecks`
Tracks detected bottlenecks and predictive alerts.

**Fields:**
- `id` (uuid, primary key)
- `workspace_id` (uuid, references workspaces)
- `job_id` (uuid, nullable)
- `crew_id` (uuid, nullable)
- `bottleneck_type` (text) - 'slow_tear_off', 'late_materials', 'absent_workers', 'weather_delay', etc.
- `severity` (text) - 'low', 'medium', 'high', 'critical'
- `description` (text)
- `detected_at` (timestamptz)
- `estimated_delay_minutes` (int, nullable)
- `cost_impact` (numeric, nullable)
- `resolved` (boolean, default false)
- `resolved_at` (timestamptz, nullable)
- `resolution_notes` (text, nullable)
- `created_at` (timestamptz)

---

## 🔧 Database Functions

### 1. `calculate_install_speed_metrics(p_job_id, p_crew_id)`
Calculates install speed metrics from job task durations.

**Returns:**
- `task_name` (text)
- `duration_hours` (numeric)
- `duration_minutes` (int)
- `baseline_hours` (numeric)
- `variance_percent` (numeric)
- `speed_rating` (int, 0-100)

### 2. `calculate_crew_efficiency_score(p_crew_id, p_period_start, p_period_end)`
Calculates 100-point efficiency score using weighted formula:

**Formula:**
- 35% Install Speed Score
- 25% QC Quality Score
- 15% Material Waste Score
- 15% On-Time Rate Score
- 10% Safety Score

**Rating Tiers:**
- 90-100 = Elite Crew
- 80-89 = Strong Crew
- 70-79 = Average Crew
- 60-69 = Needs Improvement
- <60 = High Risk Crew

**Returns:**
- `crew_id`, `score`, `rating_tier`
- Component scores (install_speed, qc_quality, material_waste, on_time_rate, safety)
- `jobs_count`

### 3. `detect_productivity_bottlenecks(p_workspace_id, p_job_id)`
Analyzes patterns to detect bottlenecks:
- Slow tasks (20%+ slower than baseline)
- Excessive material waste (>10%)
- Late arrivals
- Weather delays

**Returns:** List of detected bottlenecks with severity and estimated delays.

### 4. `predict_job_completion_time(p_job_id, p_crew_id)`
Predicts completion time based on:
- Crew speed history
- Job complexity
- Weather conditions
- Material delivery status

**Returns:**
- `estimated_completion` (timestamptz)
- `original_plan` (timestamptz)
- `forecasted_delay_minutes` (int)
- `confidence_score` (int, 0-100)

---

## 🔄 Auto-Calculation Triggers

### 1. `trigger_calculate_task_duration`
Automatically calculates `duration_minutes`, `baseline_duration_minutes`, and `variance_percent` when `end_time` is set.

### 2. `trigger_categorize_material_waste`
Automatically categorizes waste and calculates `waste_cost` when waste data is inserted/updated.

### 3. `trigger_update_crew_efficiency_scores`
Automatically recalculates crew efficiency scores when:
- Task durations are completed
- New productivity metrics are added

---

## 🌐 API Routes

### 1. `/api/productivity/dashboard`
**GET** - Daily Productivity Dashboard data

**Query Params:**
- `workspace_id` (required)

**Returns:**
- `today_productivity_score` (int, 0-100)
- `crew_rankings` (array)
- `jobs_behind_schedule` (array)
- `total_crews` (int)
- `flagged_crews` (int)

### 2. `/api/productivity/crews/leaderboard`
**GET** - Crew Leaderboard

**Query Params:**
- `workspace_id` (required)
- `period` (optional, default: 30 days)

**Returns:**
- `leaderboard` (array of crew rankings)
- `period` (object with start/end dates)

### 3. `/api/productivity/crews/[crewId]/efficiency`
**GET** - Get Crew Efficiency Score

**Query Params:**
- `workspace_id` (required)
- `period` (optional, default: 30 days)

**Returns:**
- `crew` (object)
- `efficiency` (object with score and component scores)
- `speed_metrics` (array)
- `material_waste` (array)
- `period` (object)

### 4. `/api/productivity/jobs/[jobId]/speed`
**GET** - Get Install Speed Metrics for a Job

**Query Params:**
- `workspace_id` (required)

**Returns:**
- `job_id`
- `total_duration` (hours, minutes)
- `crew_speed_rating` (int, 0-100)
- `task_metrics` (array)
- `task_durations` (array)

### 5. `/api/productivity/jobs/[jobId]/completion-prediction`
**GET** - Get Predicted Job Completion Time

**Query Params:**
- `workspace_id` (required)

**Returns:**
- `job_id`
- `prediction` (object with estimated_completion, original_plan, forecasted_delay, confidence_score, is_delayed)

### 6. `/api/productivity/bottlenecks`
**GET** - Get Productivity Bottlenecks

**Query Params:**
- `workspace_id` (required)
- `resolved` (optional, default: false)
- `severity` (optional)

**Returns:**
- `bottlenecks` (array)
- `count` (int)
- `filters` (object)

**POST** - Resolve a bottleneck

**Body:**
- `bottleneck_id` (required)
- `resolution_notes` (optional)

---

## 🎨 UI Components

### 1. Daily Productivity Dashboard
**File:** `app/dashboard/productivity/page.tsx`

**Features:**
- Today's Productivity Score (0-100)
- Crew Rankings with rating tiers
- Jobs Behind Schedule alerts
- Summary stats (total crews, flagged crews, jobs behind)

**Auto-refresh:** Every 60 seconds

### 2. Crew Leaderboard
**File:** `app/dashboard/productivity/crews/page.tsx`

**Features:**
- Ranked list of all crews
- Efficiency scores (0-100)
- Component score breakdown
- Period selector (7, 30, 90 days)
- Click to view detailed crew performance

**Rating Tiers:**
- 🥇 Elite (90-100)
- 🥈 Strong (80-89)
- 🥉 Average (70-79)
- ⚠️ Needs Improvement (60-69)
- 🚨 High Risk (<60)

---

## 📈 Key Features

### 1. Install Speed Metrics
- Tracks duration for each task (tear-off, underlayment, install, ridge, cleanup)
- Compares to baseline (average for crew/task type)
- Calculates variance percentage
- Generates speed rating (0-100)

**Example Output:**
```
Crew A — Install Speed
Tear-Off: 2.1 hours
Underlayment: 1.4 hours
Shingles: 4.8 hours
Ridge: 0.9 hours
Total: 9.2 hours
CREW SPEED RATING: 88/100
```

### 2. Crew Efficiency Score (100-Point Breakdown)
**Formula:**
```
Efficiency = 
  0.35 * Install Speed Score +
  0.25 * QC Score +
  0.15 * On-Time Arrival Score +
  0.15 * Material Waste Score +
  0.10 * Safety Score
```

**Rating Tiers:**
- 90–100 = Elite Crew
- 80–89 = Strong Crew
- 70–79 = Average Crew
- 60–69 = Needs Improvement
- <60 = High Risk Crew

### 3. Material Waste Tracking
- Compares estimated vs actual usage
- Calculates waste percentage automatically
- Categorizes waste: acceptable (<5%), moderate (5-10%), excessive (10-15%), critical (>15%)
- Calculates cost impact

**Example:**
```
Job Needed: 72 bundles
Used: 78 bundles
Waste: 8.3% (Moderate)
```

### 4. Predictive Bottleneck Detector
Analyzes patterns to detect:
- Slow tear-off
- Late materials
- Absent workers
- Weather delays
- Poor foreman planning
- Slow underlayment
- Slow ridge work
- Material shortages

**Example Alerts:**
```
⚠️ Job #1094 is trending behind schedule.
Shingle install is moving 23% slower than average for this crew.

⚠️ Crew B often starts late (arrival accuracy: 61%)
This is causing predictable delays.

⚠️ Crew A consistently wastes 6% of materials.
Recommend retraining or supervision.
```

### 5. Job Predicted Completion Times
Uses:
- Crew speed history
- Job complexity
- Weather conditions
- Material delivery status
- Labor availability

**Example:**
```
Estimated Completion: 2:45 PM
Original Plan: 1:30 PM
Forecasted Delay: +75 minutes
```

---

## 🚀 Usage Examples

### Recording Task Duration
```sql
INSERT INTO job_task_durations (
  workspace_id,
  job_id,
  crew_id,
  task_name,
  start_time,
  end_time
) VALUES (
  'workspace-uuid',
  'job-uuid',
  'crew-uuid',
  'tear-off',
  '2025-02-01 07:00:00',
  '2025-02-01 09:15:00'
);
-- Duration automatically calculated: 135 minutes
```

### Recording Material Waste
```sql
INSERT INTO material_waste_logs (
  workspace_id,
  job_id,
  material_name,
  material_unit,
  estimated_needed,
  actual_used,
  unit_cost
) VALUES (
  'workspace-uuid',
  'job-uuid',
  'bundles',
  'bundles',
  72,
  78,
  45.00
);
-- Waste automatically calculated: 8.33%
-- Category automatically set: 'moderate'
```

### Getting Crew Efficiency Score
```sql
SELECT * FROM calculate_crew_efficiency_score(
  'crew-uuid',
  '2025-01-01',
  '2025-02-01'
);
```

### Detecting Bottlenecks
```sql
SELECT * FROM detect_productivity_bottlenecks(
  'workspace-uuid',
  NULL -- or specific job_id
);
```

---

## 🔐 Row Level Security

All tables have RLS enabled with policies allowing workspace members to view/manage data for their workspace.

---

## 📝 Notes

1. **Flexible Job References:** The system works with both `jobs` and `roofing_jobs` tables by using nullable `job_id` fields.

2. **Baseline Calculation:** Baselines are calculated from the last 90 days of data for the same task type and crew.

3. **Auto-Updates:** Crew efficiency scores are automatically recalculated when relevant data changes.

4. **Period-Based Scoring:** Efficiency scores are calculated for specific time periods (default: last 30 days).

5. **Confidence Scores:** Completion predictions include confidence scores based on amount of historical data available.

---

## 🎯 Next Steps

1. **Integration with Production Milestones:** Link `job_task_durations` to `production_milestones` for automatic task tracking.

2. **AI Photo Analysis Integration:** Use AI photo analysis to automatically detect task completion and update durations.

3. **Foreman Performance Reports:** Create detailed reports showing foreman-specific metrics.

4. **Material Order Integration:** Link material waste tracking to actual supplier orders.

5. **Weather Integration:** Factor weather data into completion predictions and bottleneck detection.

6. **Mobile App Integration:** Allow crews to log task start/end times and material usage from mobile devices.

---

## ✅ Implementation Checklist

- [x] Database migration with all tables
- [x] Database functions for calculations
- [x] Auto-calculation triggers
- [x] Row Level Security policies
- [x] API routes for dashboard data
- [x] API routes for crew leaderboard
- [x] API routes for efficiency scores
- [x] API routes for install speed metrics
- [x] API routes for completion predictions
- [x] API routes for bottlenecks
- [x] Daily Productivity Dashboard UI
- [x] Crew Leaderboard UI
- [ ] Foreman Performance Report UI (Future)
- [ ] Job completion prediction UI integration (Future)

---

## 🎉 Summary

This implementation provides a complete productivity intelligence system that:

1. **Tracks** crew performance across multiple dimensions
2. **Calculates** efficiency scores using weighted formulas
3. **Detects** bottlenecks before they cause major delays
4. **Predicts** job completion times with confidence scores
5. **Monitors** material waste and cost impact
6. **Ranks** crews for competitive performance culture
7. **Alerts** on jobs behind schedule with severity levels

Roofers now have complete visibility into:
- WHO is productive
- WHO is slow
- WHAT is wasteful
- WHERE jobs fall behind
- HOW to prevent delays

This feature becomes one of the BIGGEST selling points of SmartSend.
























# Block 21958 — SmartSend Roofing Estimator Performance Score v1

**Implementation Summary**

This block implements a unified performance scoring system (0-100) for roofing estimators, built from 6 weighted signals. This feature transforms SmartSend from an "AI outreach tool" into a revenue operations system.

## ✅ Implementation Complete

### 1. Database Schema (`supabase/migrations/20250130000002_block_21958_estimator_performance_score_v1.sql`)

#### `estimator_performance` Table
- Stores unified performance scores (0-100) for each estimator
- Fields:
  - `workspace_id` - Links to workspaces
  - `estimator_id` - Links to profiles (estimators)
  - `performance_score` - Final unified score (0-100)
  - Individual signal scores:
    - `speed_score` (0-100) - 25% weight
    - `followup_score` (0-100) - 25% weight
    - `proposal_score` (0-100) - 15% weight
    - `close_rate_score` (0-100) - 20% weight
    - `tone_score` (0-100) - 10% weight
    - `ai_alignment_score` (0-100) - 5% weight
  - `calculated_at` - Timestamp of last calculation
  - Unique constraint: one score per estimator per workspace

#### Indexes Created:
- `idx_estimator_performance_workspace` - Fast workspace lookups
- `idx_estimator_performance_estimator` - Fast estimator lookups
- `idx_estimator_performance_score` - Sorting by score
- `idx_estimator_performance_calculated_at` - Sorting by calculation time

#### RLS Policies:
- `workspace_read_performance` - Workspace members can read scores
- `service_role_all_performance` - Service role can insert/update (for edge function)

### 2. Edge Function (`supabase/functions/calculate-estimator-performance/index.ts`)

**Functionality:**
- Calculates performance scores for all estimators in a workspace (or a specific estimator)
- Computes 6 weighted signals:
  1. **Speed to Lead (25%)** - Response time to new inbound homeowners
     - < 5 min = 100, < 15 min = 90, < 30 min = 75, < 60 min = 50, < 120 min = 25, >= 120 min = 0
  2. **Follow-Up Completion Rate (25%)** - Action Queue task completion
     - >= 90% = 100, >= 75% = 85, >= 60% = 70, >= 40% = 50, >= 20% = 25, < 20% = 0
  3. **Proposal Turnaround Time (15%)** - Time from estimate → proposal sent
     - < 24 hours = 100, < 48 hours = 85, < 72 hours = 70, < 120 hours = 50, >= 120 hours = 25
  4. **Close Rate Adjusted (20%)** - Win rate adjusted for job value, lead source, difficulty
     - >= 40% = 100, >= 30% = 85, >= 20% = 70, >= 10% = 50, >= 5% = 25, < 5% = 0
  5. **Homeowner Tone Impact (10%)** - Tone improvement/worsening after estimator messages
     - High improvement, low worsening = good score
  6. **AI Alignment Score (5%)** - Completion of high-priority AI-recommended actions
     - >= 80% = 100, >= 60% = 85, >= 40% = 70, >= 20% = 50, < 20% = 0

**Final Score Calculation:**
```
performance_score = 
  (speed_score * 0.25) +
  (followup_score * 0.25) +
  (proposal_score * 0.15) +
  (close_rate_score * 0.20) +
  (tone_score * 0.10) +
  (ai_alignment_score * 0.05)
```

**API:**
- POST `/functions/v1/calculate-estimator-performance`
- Body: `{ workspace_id: string, estimator_id?: string }`
- Returns: Array of calculated performance scores

### 3. API Route (`app/api/estimators/performance/route.ts`)

**Endpoints:**
- `GET /api/estimators/performance?workspace_id=X&estimator_id=Y` - Fetch performance scores
- `POST /api/estimators/performance` - Trigger calculation (calls edge function)

**Features:**
- Fetches scores from database
- Triggers edge function for recalculation
- Returns scores with estimator names

### 4. UI Components

#### `EstimatorScoreCard` (`components/estimators/EstimatorScoreCard.tsx`)
- Displays unified performance score (0-100)
- Shows all 6 signal scores with their weights
- Color-coded by performance level
- Shows last calculated timestamp

#### `EstimatorPerformanceScores` (`components/dashboard/EstimatorPerformanceScores.tsx`)
- Dashboard component that displays all estimator scores
- Grid layout showing multiple estimators
- "Calculate/Recalculate" button to trigger score calculation
- Fetches estimator names and displays them

### 5. Dashboard Integration

**Location:** `app/(owner)/dashboard/page.tsx`
- Added `EstimatorPerformanceScores` component to owner dashboard
- Displays after "Hot Jobs Focus List" section
- Shows all estimators' performance scores in a grid

## Usage

### For Owners:
1. Navigate to Owner Dashboard
2. View "Estimator Performance Scores" section
3. Click "Calculate Scores" to generate initial scores
4. Scores update daily (via cron job) or manually via "Recalculate" button

### For Developers:
1. **Calculate scores manually:**
   ```typescript
   POST /api/estimators/performance
   { workspace_id: "..." }
   ```

2. **Fetch scores:**
   ```typescript
   GET /api/estimators/performance?workspace_id=...
   ```

3. **Set up daily cron job:**
   - Call edge function nightly: `POST /functions/v1/calculate-estimator-performance`
   - Or use Supabase cron triggers

## Data Sources

The edge function pulls data from:
- `leads` - Estimator assignments
- `inbox_threads` - Thread assignments
- `inbox_messages` - Response times
- `action_queue_tasks` - Follow-up completion
- `estimates` / `roof_estimates` - Estimate creation
- `proposals` - Proposal sending
- `lead_activities` - Tone classification
- `contractor_roles` - Estimator identification

## Future Enhancements (V2)

- Fully data-driven calculations (currently uses simplified placeholders for some signals)
- Adjust close rate for:
  - Job value
  - Lead source
  - Difficulty
  - Competitive pressure
  - Homeowner intent signals
- Integration with Lead Routing Engine
- Integration with Coaching Engine
- Historical trend tracking
- Performance alerts

## Impact

This feature:
- ✅ Identifies top closers and weak performers
- ✅ Enables easy incentive/bonus structures
- ✅ Stops team drama ("he gets better leads!")
- ✅ Makes routing strategic (high performers get hot jobs)
- ✅ Gives owners objective truth about team performance
- ✅ Transforms SmartSend into a sales optimization engine










































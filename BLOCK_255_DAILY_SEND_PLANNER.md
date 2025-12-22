# Block 255 — Daily Send Planner v1 ✅

## Overview
This block implements the Daily Send Planner system that calculates safe send limits per mailbox, respects warmup curves, adjusts based on bounce rates, and ensures SmartSend never exceeds safe limits.

## What Was Implemented

### 1. Database Schema

#### `mailbox_stats` Table (Migration 271)
- Tracks daily metrics per mailbox: sent, opens, clicks, bounces, spam_reports, replies
- Used for calculating bounce rates and health scores
- Auto-populated via triggers when sends/bounces occur

#### `send_plan` Table (Migration 272)
- Stores daily send plans per workspace
- Plan is a JSONB array of `{ mailbox_id, max_sends, status }`
- One plan per workspace per day
- Updated hourly via re-evaluation function

#### Mailboxes Table Updates
- Added `warmup_started_at` column (when warmup began)
- Added `daily_cap` column (user-configured max daily limit)

### 2. Core Functions

#### Warmup Functions
- `get_warmup_day(mailbox_id)` - Calculates days since warmup started
- `get_warmup_limit(mailbox_id)` - Returns warmup limit based on day
  - Day 1: 10, Day 2: 15, Day 3: 20, ... up to Day 29: 150
  - After warmup: returns max (150)

#### Safe Limit Calculation
- `compute_7d_bounce_rate(mailbox_id)` - Calculates 7-day bounce rate
- `compute_safe_limit(mailbox_id)` - Main function that computes safe send limit
  - Formula: `min(warmup_limit, user_cap) * (health_score / 100)`
  - If bounce rate > 5%: multiply by 0.5
  - If bounce rate > 10%: return 0 (pause mailbox)

#### Plan Management
- `get_today_plan(workspace_id)` - Gets today's plan for a workspace
- `get_remaining_budget(mailbox_id)` - Returns remaining sends for today
- `sync_mailbox_stats(date)` - Syncs stats from send_logs/bounces

#### Auto-Increment Functions
- `increment_mailbox_sent(mailbox_id)` - Increments sent count
- `increment_mailbox_bounce(mailbox_id)` - Increments bounce count
- Triggers automatically call these when sends/bounces occur

### 3. Cron Functions

#### `calculate-daily-plan` (Morning 6 AM)
- Runs every morning to calculate today's send plan
- For each workspace:
  - Gets all active mailboxes
  - Computes safe limit for each mailbox
  - Determines status (healthy/throttled/paused)
  - Saves plan to `send_plan` table

#### `reevaluate-send-plan` (Hourly)
- Re-checks plans throughout the day
- Detects bounce spikes → reduces limits
- Detects health improvements → increases limits
- Updates plans if changes detected (>10% difference)

### 4. Dispatcher Integration

#### Updated `send-dispatcher/index.ts`
- Checks `get_remaining_budget()` before claiming jobs
- Skips mailboxes with 0 remaining budget
- Limits batch size to remaining budget
- Calls `increment_mailbox_sent()` after successful sends

### 5. RLS Policies

All tables have proper RLS:
- `mailbox_stats`: Workspace members can view stats for their workspace
- `send_plan`: Workspace members can view plans for their workspace
- Service role can insert/update for both tables

## Setup Instructions

### 1. Run Migrations
```sql
-- Run in order:
-- 271_mailbox_stats.sql
-- 272_send_plan.sql
```

### 2. Set Up Cron Jobs

#### Option A: Supabase Cron (pg_cron)
```sql
-- Daily plan calculation at 6 AM UTC
SELECT cron.schedule(
  'calculate-daily-plan',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/calculate-daily-plan',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  );
  $$
);

-- Hourly re-evaluation
SELECT cron.schedule(
  'reevaluate-send-plan',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/reevaluate-send-plan',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  );
  $$
);
```

#### Option B: External Scheduler (e.g., Vercel Cron, GitHub Actions)
- Call `/functions/v1/calculate-daily-plan` daily at 6 AM
- Call `/functions/v1/reevaluate-send-plan` hourly

### 3. Start Warmup for Mailboxes
```sql
-- When ready to start warmup for a mailbox:
UPDATE mailboxes
SET warmup_started_at = NOW()
WHERE id = 'mailbox-uuid';
```

### 4. Configure Daily Caps
```sql
-- Set user-configured max daily cap:
UPDATE mailboxes
SET daily_cap = 200
WHERE id = 'mailbox-uuid';
```

## Usage

### Dashboard Query Example
```sql
-- Get today's plan for a workspace
SELECT 
  sp.date,
  jsonb_array_elements(sp.plan) as mailbox_plan
FROM send_plan sp
WHERE sp.workspace_id = 'workspace-uuid'
  AND sp.date = CURRENT_DATE;

-- Get mailbox stats for last 7 days
SELECT 
  ms.date,
  ms.sent,
  ms.bounces,
  ms.opens,
  ms.clicks,
  ms.replies,
  ROUND((ms.bounces::numeric / NULLIF(ms.sent, 0)) * 100, 2) as bounce_rate_pct
FROM mailbox_stats ms
WHERE ms.mailbox_id = 'mailbox-uuid'
  AND ms.date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY ms.date DESC;
```

### Check Remaining Budget
```sql
-- Check how many sends remaining for a mailbox today
SELECT get_remaining_budget('mailbox-uuid');
```

## Features Delivered

✅ Calculate safe send limits per mailbox  
✅ Respect warmup curves  
✅ Adjust send volume based on recent bounce rate  
✅ Detect reputation dips → auto-throttle  
✅ Evenly distribute sends across connected mailboxes  
✅ Build a per-day send plan  
✅ Pause sending for a mailbox with issues  
✅ Auto-shift volume to healthy mailboxes  
✅ Integration with Quota-Aware Dispatcher  
✅ RLS policies for workspace-scoped access  

## Next Steps (Future Enhancements)

- [ ] Dashboard UI widget showing "Today's Plan"
- [ ] UI for editing warmup curves per mailbox
- [ ] Alerts when mailboxes get paused
- [ ] Historical plan analytics
- [ ] Warmup curve customization per mailbox
- [ ] Timezone-aware plan calculation (6 AM workspace-local time)

## Notes

- Warmup curve is currently static: [10, 15, 20, ..., 150]
- Health score comes from existing `mailboxes.health_score` column (Block 249)
- Bounce data comes from existing `bounces` table (Block 249)
- Stats sync happens automatically via triggers
- Plans are recalculated daily and re-evaluated hourly










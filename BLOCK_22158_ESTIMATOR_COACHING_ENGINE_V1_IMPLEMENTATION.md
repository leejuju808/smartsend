# Block 22158 — Estimator Coaching Engine v1 Implementation

## 🎯 Overview

This is the **Estimator Coaching Engine v1** — AI Performance Coaching for Every Estimator. This system makes SmartSend feel like a sales manager, not software.

**Key Value Proposition:**
- Transforms SmartSend into a sales leadership system, not just CRM
- Directly impacts revenue through improved estimator performance
- Gives owners clarity on estimator ROI
- Builds estimator trust and improvement habits
- Creates STICKINESS — once teams rely on this, they NEVER leave

## 📋 What Was Built

### 1. Database Schema (`supabase/migrations/20250130000001_block_22158_estimator_coaching_engine_v1.sql`)

**Updated `estimator_coaching_reports` table:**
- Added `report_type` (daily | weekly)
- Added JSONB fields for structured data:
  - `insights` (jsonb) - AI-generated insights about performance
  - `recommendations` (jsonb) - Array of actionable recommendations
  - `strengths_data` (jsonb) - Array of strengths identified
  - `weaknesses_data` (jsonb) - Array of weaknesses identified
  - `top_priority` (text) - Single top priority improvement
  - `scripts` (jsonb) - Suggested scripts/templates
  - `patterns` (jsonb) - Patterns hurting/improving performance
- Kept legacy text fields for backward compatibility
- Added proper indexes (including GIN indexes for JSONB fields)
- Updated unique constraint to include `report_type`

**Created `estimator_full_intelligence_view`:**
- Unified view aggregating ALL intelligence signals:
  - Performance scores (from `estimator_performance`)
  - Leaderboard metrics (from `estimator_leaderboard_view`)
  - Scorecard metrics (from `estimator_scorecards`)
  - Pipeline behavior (from `leads`)
  - Speed metrics (response times, proposal timing)
  - Follow-up consistency
  - Conversation behavior (tone, intent)
  - Job health patterns
  - Win vs loss patterns
  - Lead source compatibility
  - Job save performance
  - Revenue metrics
  - Intelligence indicators

**Helper Function:**
- `get_coaching_period_dates()` - Calculates period start/end dates for daily/weekly reports

### 2. Edge Function (`supabase/functions/generate-estimator-coaching/index.ts`)

**Features:**
- Generates coaching reports using OpenAI GPT-4o-mini
- Supports both daily and weekly reports
- Processes all estimators in a workspace or a specific estimator
- Uses `estimator_full_intelligence_view` for comprehensive data
- Compares performance to peer averages
- Generates structured JSON output with:
  - Strengths (array)
  - Weaknesses (array)
  - Recommendations (array)
  - Top priority (string)
  - Patterns (hurting/improving)
  - Scripts (array)

**AI Prompt Engineering:**
- Comprehensive prompt analyzing all performance signals
- Focuses on revenue-impacting behaviors
- Provides specific, actionable feedback
- Includes peer comparison context

### 3. UI Components

**Owner Dashboard (`components/estimators/EstimatorCoachingDashboard.tsx`):**
- Shows all estimators with performance summaries
- Displays latest coaching insights for each estimator
- Highlights top priorities, strengths, weaknesses, and recommendations
- Color-coded by performance level
- Links to full coaching reports

**Estimator Personal Feed (`components/estimators/EstimatorPersonalCoachingFeed.tsx`):**
- Personal improvement feed for estimators
- Shows weekly coaching report with:
  - Top priority improvement
  - Performance summary
  - Strengths section
  - Areas for improvement
  - This week's recommendations
  - Performance patterns
  - Suggested scripts
- Beautiful, card-based UI with color coding

### 4. API Routes

**`/api/estimators/coaching` (GET):**
- Fetches coaching reports for an estimator
- Supports filtering by `report_type` (daily/weekly)
- Returns latest report or specific period

**`/api/estimators/coaching-dashboard` (GET):**
- Fetches coaching dashboard data for owner view
- Combines leaderboard data with latest coaching reports
- Returns array of estimators with coaching insights

**`/api/estimators/compute-coaching` (POST):**
- Triggers coaching report generation
- Supports both daily and weekly reports
- Can generate for all estimators or specific estimator
- Calls `generate-estimator-coaching` edge function

## 🚀 How It Works

### Weekly Report Generation Flow:

1. **Cron Job** (to be set up) runs every Monday at 5am
2. Calls `/api/estimators/compute-coaching` with `report_type: "weekly"`
3. Edge function fetches `estimator_full_intelligence_view` for each estimator
4. AI analyzes performance data and generates coaching insights
5. Report saved to `estimator_coaching_reports` table
6. Estimators see their weekly coaching report when they log in
7. Owners see coaching dashboard with all estimators

### Daily Report Generation Flow:

1. **Cron Job** (to be set up) runs nightly
2. Same flow as weekly, but with `report_type: "daily"`
3. Provides more frequent, focused feedback

## 📊 Coaching Input Signals

The engine analyzes:

**Closing Behavior:**
- Win rate
- Revenue generated
- Leads handled
- Avg job size closed
- Lost jobs patterns

**Pipeline Behavior:**
- Speed to lead
- Speed to proposal
- Follow-up consistency
- Job save execution
- Task completion

**Conversation Behavior:**
- Tone match score
- Objection handling quality
- Response time
- Frustration triggers
- Question-answer quality
- Confidence markers

**Performance vs Peers:**
- Leaderboard rank
- Health of pipeline compared to others
- Performance split by lead source

**Intelligence Indicators:**
- Average momentum generated
- Average experience score influenced
- Reduction of risk in jobs
- Improvement patterns over time

## 🎨 UI Features

### Owner View:
- ⭐ Performance Summary (Score, Rank, Revenue, Win/Loss trend)
- 📉 Weakness Signals (slow proposals, low follow-up, bad tone, etc.)
- 📈 Strength Signals (high experience score lift, strong closer, etc.)
- 🧠 AI Coaching Recommendations (specific, actionable insights)

### Estimator View:
- Top Priority improvement item
- Strengths section
- Weaknesses section
- This Week's Recommendations
- Performance Patterns (hurting/improving)
- Suggested Scripts

## 🔧 Next Steps (To Complete Implementation)

### 1. Set Up Cron Jobs

**Weekly Reports (Monday 5am):**
```sql
-- Add to Supabase cron jobs
SELECT cron.schedule(
  'generate-weekly-coaching-reports',
  '0 5 * * 1', -- Every Monday at 5am
  $$
  SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/generate-estimator-coaching',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := json_build_object(
      'workspace_id', w.id,
      'report_type', 'weekly'
    )::text
  )
  FROM workspaces w;
  $$
);
```

**Daily Reports (Nightly):**
```sql
SELECT cron.schedule(
  'generate-daily-coaching-reports',
  '0 2 * * *', -- Every day at 2am
  $$
  SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/generate-estimator-coaching',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := json_build_object(
      'workspace_id', w.id,
      'report_type', 'daily'
    )::text
  )
  FROM workspaces w;
  $$
);
```

### 2. Create Page Routes

**Owner Coaching Dashboard:**
- Create `app/(owner)/estimators/coaching/page.tsx`
- Use `EstimatorCoachingDashboard` component

**Estimator Personal Coaching:**
- Create `app/(dashboard)/estimators/[id]/coaching/page.tsx`
- Use `EstimatorPersonalCoachingFeed` component

### 3. Pipeline Integration (Future Enhancement)

Integrate coaching signals into pipeline view:
- Highlight jobs matching estimator weaknesses
- Show coaching recommendations inline
- Display "This is your #1 issue" badges

### 4. Add to Owner Dashboard

Add `EstimatorCoachingDashboard` to the owner dashboard:
```tsx
import { EstimatorCoachingDashboard } from "@/components/estimators/EstimatorCoachingDashboard";

// In OwnerDashboardPage:
<EstimatorCoachingDashboard workspaceId={workspaceId} />
```

## 📝 Example Coaching Output

```json
{
  "strengths": [
    "Fast response time — averaging 4 minutes to first response",
    "Strong close rate on referral leads — 45% vs team average of 28%",
    "Excellent lead coverage — responding quickly to homeowner inquiries"
  ],
  "weaknesses": [
    "You lose 72% of jobs when proposal delivery exceeds 24 hours",
    "Inconsistent follow-ups — missed 4 follow-ups this week, likely costing $14,000 in job value",
    "Struggles with frustrated homeowners — 3 out of 4 negative tone leads resulted in losses"
  ],
  "recommendations": [
    "Deliver proposals within 12 hours. This is your #1 revenue opportunity.",
    "Use AI soft re-engagement script more often for ghosting jobs",
    "Ask timeline earlier in the conversation — you close 30% more when timeline is discussed in first 3 messages"
  ],
  "top_priority": "Deliver proposals within 12 hours. This is your #1 revenue opportunity.",
  "patterns": {
    "hurting": [
      "You always lose when proposal delivery exceeds 24 hours",
      "Momentum drops after your second follow-up"
    ],
    "improving": [
      "Homeowners with price-sensitive intent respond better to your longer explanations",
      "You close 30% more when timeline is discussed early"
    ]
  },
  "scripts": [
    "Timeline clarification script",
    "Frustration reset script",
    "Soft re-engagement script for ghosting jobs"
  ]
}
```

## 🎯 Impact

This engine:
- ✅ Improves estimator performance WITHOUT owner intervention
- ✅ Dramatically improves close rates
- ✅ Solves accountability problems
- ✅ Turns average estimators into top performers
- ✅ Helps owners see WHO is worth keeping
- ✅ Reduces friction between owners and sales team
- ✅ Creates LONG-TERM RETENTION

## 🔐 Security

- RLS policies ensure estimators can only see their own reports
- Workspace members can see all reports in their workspace
- Service role has full access for edge function operations

## 📚 Related Blocks

- Block 21958: Estimator Performance Score v1
- Block 22064: Estimator Leaderboard v1
- Block 22029: Estimator Scorecard v1
- Block 22094: AI Next-Action Engine v1

## 🐛 Known Issues / Future Improvements

1. **Pipeline Integration**: Not yet integrated into pipeline view (planned for v2)
2. **Cron Jobs**: Need to be set up manually (see Next Steps)
3. **Page Routes**: Need to be created (see Next Steps)
4. **Script Library**: Suggested scripts are text only — could link to actual script templates
5. **Historical Trends**: Could add trend analysis over time
6. **Skill Ratings**: Mentioned in spec but not yet implemented (v2 feature)

## ✅ Implementation Checklist

- [x] Database migration with JSONB fields
- [x] `estimator_full_intelligence_view` created
- [x] Edge function with OpenAI integration
- [x] Owner coaching dashboard component
- [x] Estimator personal feed component
- [x] API routes for fetching/triggering reports
- [ ] Cron jobs for daily/weekly generation
- [ ] Page routes for UI components
- [ ] Pipeline integration (v2)
- [ ] Add to owner dashboard

---

**Block 22158 — Estimator Coaching Engine v1**  
*AI Performance Coaching for Every Estimator — Personalized, Automatic, Relentless*










































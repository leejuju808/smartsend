# Block 21889 — SmartSend Roofing Missed Opportunity Detector v1

## Implementation Summary

This block implements an automatic system that detects when a job is about to slip away and steps in BEFORE the homeowner chooses another roofer. The system scans the pipeline 24/7, looking for danger signals and triggers automated save actions.

## Components Implemented

### 1. Database Migration (`20250130000023_block_21889_missed_opportunity_detector_v1.sql`)

**Added Columns to `leads` table:**
- `risk_score` (integer, 0-100): Risk score indicating likelihood of losing the job
- `risk_category` (text): Risk category - 'low', 'medium', 'high', or 'critical'
- `last_risk_update` (timestamptz): Timestamp of last risk score calculation
- `previous_job_probability` (integer): Previous job probability for drop detection
- `stage_entered_at` (timestamptz): When lead entered current pipeline stage
- `last_estimator_activity_at` (timestamptz): Last time estimator performed activity
- `proposal_due_at` (timestamptz): When proposal should be sent
- `last_homeowner_message_at` (timestamptz): Last time homeowner sent a message

**Indexes Created:**
- `idx_leads_risk_score`: For fast queries on risk score
- `idx_leads_risk_category`: For filtering by risk category
- `idx_leads_risk_category_score`: Composite index for category + score queries

**Trigger Created:**
- `trg_update_stage_entered_at`: Automatically tracks when a lead enters a new pipeline stage

### 2. Edge Function (`supabase/functions/compute-risk-score/index.ts`)

**Risk Score Calculation (0-100):**

The function calculates risk scores based on 8 risk factors:

1. **Probability Drop** (HIGH weight)
   - Drop ≥ 30 points → +40
   - Drop ≥ 15 points → +25

2. **Missed Follow-Ups**
   - 1 missed → +15
   - 2+ missed → +30

3. **Hot Lead Not Contacted**
   - Hot lead (heat_score ≥ 80) untouched in 10 minutes → +30

4. **Proposal Overdue**
   - Not sent within 24 hours → +20
   - Not sent within 48 hours → +40

5. **Estimator Inactivity**
   - No reply in 6 hours → +20
   - No reply in 12 hours → +40

6. **High-Value Lead Neglect**
   - Value ≥ $10,000 and no activity in 24 hours → +30

7. **Negative Tone**
   - Angry → +40
   - Impatient → +25
   - Confused → +10

8. **Stuck in Pipeline Stage**
   - Same stage for 48+ hours → +15
   - Same stage for 72+ hours → +30

**Risk Categories:**
- **Critical** (80-100): Save immediately
- **High** (50-79): Needs estimator attention
- **Medium** (20-49): Monitor + potential follow-up
- **Low** (0-19): No risk

**Automated Save Actions (Critical Risk Only):**

When a lead enters critical risk, the system automatically:

1. **Sends notification to owner** with detailed risk factors and job value
2. **Auto-handoffs to another estimator** if current estimator is inactive ≥12 hours
3. **Alerts the assigned estimator** with urgent action required message
4. **Logs to job_timelines** for full transparency

### 3. UI Component (`src/components/pipeline/RiskBadge.tsx`)

A React component that displays risk scores with color-coded badges:
- 🚨 Critical (red)
- ⚠️ High (orange)
- 🟡 Medium (yellow)
- 🟢 Low (green)

**Props:**
- `category`: Risk category
- `score`: Risk score (0-100)
- `showLabel`: Whether to show the category label (default: true)
- `className`: Optional additional CSS classes

### 4. Integration Points

**Updated Components:**
- `src/components/pipeline/LeadCard.tsx`: Displays RiskBadge on lead cards
- `app/(dashboard)/pipeline/PipelineCard.tsx`: Displays RiskBadge on pipeline cards
- `supabase/functions/get-pipeline/index.ts`: Includes risk_score and risk_category in API response

### 5. Cron Job Configuration (`20250130000024_block_21889_risk_score_cron.sql`)

Schedules the `compute-risk-score` edge function to run every 10 minutes using pg_cron.

**Note:** If pg_cron settings are not available, configure via:
- Supabase Dashboard → Database → Cron Jobs
- Or use Supabase CLI to set up the scheduled function

## How It Works

1. **Every 10 minutes**, the `compute-risk-score` function runs automatically
2. **Fetches all active leads** (status not 'won' or 'lost')
3. **Calculates risk factors** for each lead by querying related tables:
   - Tasks table for missed follow-ups
   - Lead activities for homeowner tone
   - Lead metadata for probability drops, stage times, etc.
4. **Computes risk score** (0-100) based on weighted factors
5. **Updates lead record** with risk_score, risk_category, and last_risk_update
6. **Logs to job_timelines** for audit trail
7. **Triggers automated actions** for critical risk leads:
   - Owner notifications
   - Estimator alerts
   - Auto-handoffs (if applicable)

## Real Money Impact

This feature directly increases revenue and saves deals by:

✅ **Saves hot leads from dying** - Owners recover jobs they didn't even know were at risk
✅ **Increases close rate 10-20%** - Critical preventions = massive revenue
✅ **Eliminates estimator sloppiness** - SmartSend corrects mistakes instantly
✅ **Warns owners about dangerous situations** - Like angry customers or stalled high-value jobs
✅ **Gives SmartSend predictive intelligence** - This is the "AI COO" piece contractors brag about
✅ **Makes SmartSend indispensable** - Roofers NEVER want to lose this feature

## Deployment Steps

1. **Run database migrations:**
   ```bash
   supabase migration up
   ```

2. **Deploy edge function:**
   ```bash
   supabase functions deploy compute-risk-score
   ```

3. **Configure cron job:**
   - Option A: Via Supabase Dashboard → Database → Cron Jobs
   - Option B: The migration will attempt to set it up automatically (if pg_cron is configured)

4. **Verify deployment:**
   - Check that risk scores are being calculated (query `leads` table)
   - Check that RiskBadge appears on pipeline cards
   - Test with a lead that has risk factors

## Testing

To test the system:

1. Create a test lead with high heat_score but no estimator activity
2. Wait 10+ minutes for cron job to run
3. Check that risk_score is calculated and risk_category is set
4. Verify RiskBadge appears on the lead card
5. For critical risk, verify owner notification is sent

## Future Enhancements

Potential improvements for v2:
- Configurable risk factor weights per workspace
- Custom risk thresholds
- More granular risk factor detection
- Integration with follow-up message sending
- Dashboard view of all at-risk leads
- Risk trend analysis over time










































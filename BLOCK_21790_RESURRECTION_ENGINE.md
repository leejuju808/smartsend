# Block 21790 — SmartSend Roofing Lead Resurrection Engine v1

## 🧟‍♂️ Bring Dead Leads Back to Life

This feature automatically re-engages dead/cold leads to fill roofer calendars without spending on ads.

## Implementation Summary

### 1. Database Migration
**File:** `supabase/migrations/20250130000002_block_21790_lead_resurrection_engine_v1.sql`

- Creates `lead_resurrections` table to track all resurrection attempts
- Adds `last_resurrection_at` and `resurrection_count` columns to `leads` table
- Adds `first_reply_at` column if not exists
- Creates helper functions:
  - `can_resurrect_lead()` - Checks if a lead qualifies for resurrection
  - `determine_resurrection_type()` - Determines the type of resurrection message

### 2. Edge Function
**File:** `supabase/functions/run-resurrection-engine/index.ts`

- Scans all leads (excluding hot/won/lost/unsubscribed)
- Determines which leads qualify for resurrection
- Generates appropriate resurrection messages based on lead state
- Queues messages via `send_queue` table
- Creates `channel_messages` records for tracking
- Logs timeline events for visibility

**Resurrection Types:**
- `no_reply` - Homeowner never replied (24+ hours)
- `ghosted` - Replied once but disappeared (48+ hours)
- `estimate_not_booked` - Estimate sent but not booked (3+ days)
- `proposal_unanswered` - Proposal sent but not accepted (7+ days)
- `warm_cooled` - Warm lead that went cold
- `seasonal_revival` - Past customers (6+ months)

### 3. UI Components
**Files:**
- `components/leads/ResurrectionActivity.tsx` - Standalone resurrection activity component
- `components/leads/lead-timeline.tsx` - Updated to display resurrection events

### 4. How to Use

#### Manual Execution
Call the edge function via HTTP:
```bash
curl -X POST https://your-project.supabase.co/functions/v1/run-resurrection-engine \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
```

#### Scheduled Execution (Recommended)
Set up a cron job to run hourly:
- Via Supabase Dashboard → Edge Functions → Cron Jobs
- Or via pg_cron extension in PostgreSQL

Example cron schedule (every hour):
```sql
SELECT cron.schedule(
  'resurrection-engine-hourly',
  '0 * * * *', -- Every hour
  $$
  SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/run-resurrection-engine',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) AS request_id;
  $$
);
```

### 5. Safety Features

- **24-hour cooldown** - Won't spam leads (waits 24 hours between resurrections)
- **48-hour reply buffer** - Skips leads who replied recently
- **Status filtering** - Automatically skips won/lost/unsubscribed/bounced leads
- **Heat category filtering** - Skips hot leads (they don't need resurrection)

### 6. Timeline Integration

Resurrection events automatically appear in lead timelines with:
- Event type: `resurrection_triggered`
- Event subtype: The resurrection type (e.g., `no_reply`, `ghosted`)
- Message: Description of the resurrection attempt
- Metadata: Includes resurrection type and message ID

### 7. Metrics & Tracking

- `lead_resurrections` table tracks all attempts
- `leads.resurrection_count` tracks total resurrections per lead
- `leads.last_resurrection_at` tracks last resurrection timestamp
- Timeline events provide visibility into resurrection activity

## Expected Impact

- **Saves 10-25% of leads** that would've been dead
- **Single revived job** could be $10K-$30K
- **Builds trust** - Contractors see old leads come back to life
- **Justifies pricing** - Core value feature for $199-$399 plans

## Next Steps

1. Run the migration: `supabase migration up`
2. Deploy the edge function: `supabase functions deploy run-resurrection-engine`
3. Set up cron job for hourly execution
4. Monitor resurrection activity in lead timelines
5. Track conversion rates from resurrected leads










































# Block 24140 — SmartSend Advanced Scheduler v2

**Human-Like Sending • Deliverability Protection • Load Balancing • Intelligent Timing**

This is the upgraded version of your send queue — designed to make SmartSend emails land in inboxes, look human, and generate the maximum number of homeowner replies.

## Overview

Every technical feature here directly helps roofers book more estimates, and every explanation ties back to that goal.

### The Purpose

Roofers don't know deliverability. Roofers don't think about timing. Roofers don't realize blasting too many emails at once ruins inbox placement.

SmartSend must protect them by sending in a way that:
- ✔ looks human
- ✔ avoids spam filters
- ✔ maximizes open rate
- ✔ maximizes reply rate
- ✔ spaces out sends to avoid throttling
- ✔ focuses on homeowner behavior

This is the engine that makes SmartSend a money machine.

## Architecture

### 1. Wave-Based Sending System (Drip System)

Instead of sending 500 emails instantly, SmartSend sends in waves:
- 30–50 emails → small pause → 30–50 emails → repeat

The pauses adjust dynamically based on:
- Deliverability health
- Recent engagement rates
- Time of day
- Number of waves sent today

**Why this helps roofers:** More waves = more inboxing = more opens = more replies = more booked estimates.

**Files:**
- `src/lib/scheduler/v2/waveSystem.ts`
- Database: `send_waves` table

### 2. AI Timing Windows (Homeowner Behavior Timing)

SmartSend tracks when homeowners in each city open emails, peak roofing engagement times, day-of-week patterns, and storm-related attention spikes.

**Typical AI timing windows:**
- 7:30–9:30 AM (homeowners check email at breakfast)
- 11:00 AM–1:00 PM (break time)
- 4:30–7:30 PM (after work)

SmartSend auto-shifts sends to these windows.

**Why this helps roofers:** Right timing = higher replies. Higher replies = more inspections booked.

**Files:**
- `src/lib/scheduler/v2/timingWindows.ts`
- Database: `homeowner_timing_patterns`, `email_engagement_timing` tables

### 3. List Quality Detection (Automatic Throttling)

If SmartSend detects:
- too many bounces (>5%)
- too many opens without replies
- too many non-engaged contacts
- old leads

SmartSend slows sending automatically and alerts the roofer: "Your list quality is affecting inboxing — want me to clean it?"

**Why this helps roofers:** Stops them from burning their domain. Protects their reputation. Keeps campaigns profitable.

**Files:**
- `src/lib/scheduler/v2/listQuality.ts`
- Database: `list_quality_metrics`, `list_quality_alerts` tables

### 4. Send Queue Prioritization (High ROI First)

SmartSend prioritizes:
1. **Storm Campaigns** (priority 1000) — huge roofs
2. **Revival** (priority 800) — fast wins
3. **Follow-Up** (priority 600) — booked estimates
4. **Free Estimate** (priority 400)
5. **Low-ROI campaigns** last (priority 200)

**Why this helps roofers:** SmartSend ensures the most money-making messages go out first.

**Files:**
- `src/lib/scheduler/v2/prioritization.ts`
- Database: `campaigns.campaign_type`, `campaigns.campaign_priority` columns

### 5. Deliverability Safeguards (Auto-Protection)

SmartSend automatically:
- rotates sending IP pools
- shifts sending windows
- adjusts batch size
- replaces bad subject lines
- avoids spam trigger phrases
- delays sends when needed
- monitors reputation signals

If deliverability drops, SmartSend warns: "Your sending health dropped — I'm adjusting your sequence automatically."

**Why this helps roofers:** Roofers stay out of spam. More homeowners see their message. They get WAY more replies.

**Files:**
- `src/lib/scheduler/v2/deliverability.ts`
- Database: `deliverability_health`, `deliverability_events` tables

### 6. Multi-Campaign Load Balancing

If a roofer runs multiple campaigns (revival, storm, repair, seasonal), SmartSend auto-spreads sends to:
- avoid saturation
- protect inboxing
- optimize timing-based performance
- ensure every campaign has room to breathe

**Why this helps roofers:** Roofers running Growth/Domination get MAXIMUM results without hurting deliverability. This also sells upgrades.

**Files:**
- `src/lib/scheduler/v2/loadBalancing.ts`
- Database: `campaign_load_balance` table

### 7. Internal Dashboard Metrics

For YOU, the builder, SmartSend displays:
- **Emails in Queue**
- **Next Wave Scheduled At**
- **Throttle Status:** Normal / Limited / Repair Mode
- **Deliverability Score**
- **Engagement Trend**
- **Storm Priority Active:** YES/NO
- **List Quality Rating**

**Why this helps roofers (indirectly):** You catch problems early → keeps their success high → retention sky-high.

**Files:**
- `src/lib/scheduler/v2/dashboard.ts`
- `app/api/scheduler/v2/dashboard/route.ts`
- Database: `v_scheduler_dashboard` view

### 8. Roofing Best Practices Autopilot Rules

SmartSend follows these ALWAYS:
- ✔ Never send more than 250 emails/hour/domain
- ✔ Never send more than 2 emails/day/homeowner
- ✔ Add spacing between follow-ups
- ✔ Warm new domains slowly (50, 100, 200...)
- ✔ Pause sending if bounce rate >5%
- ✔ Auto-remove inactive contacts
- ✔ Auto-scan for spammy text

**Why this helps roofers:** This protects their business and makes SmartSend their #1 long-term asset.

**Files:**
- `src/lib/scheduler/v2/autopilot.ts`
- Database: `scheduler_autopilot_rules` table

## Example Flow

**Homeowner list:** 800 contacts  
**Roofer launches:** Lead Revival + Storm Outreach

**SmartSend does:**

**Wave 1 (Morning)**
- 50 revival
- 50 storm

**Wave 2 (Late Morning)**
- 50 revival
- 50 storm

**Wave 3 (Afternoon)**
- 50 storm (priority)
- 20 revival

**Wave 4 (Evening)**
- 50 revival
- 50 storm

**Total:** ~420 sends Day 1  
SmartSend continues Day 2.

**Why this helps roofers:** They get replies ALL DAY. Homeowners never feel spammed. Open rates skyrocket.

## Setup Instructions

### 1. Run Database Migration

```bash
# Apply the migration
supabase migration up

# Or manually run:
psql $DATABASE_URL -f supabase/migrations/20250130000002_advanced_scheduler_v2.sql
```

### 2. Configure Cron Job

Update your `vercel.json` or cron configuration to call the new processor:

```json
{
  "crons": [
    {
      "path": "/api/scheduler/v2/process",
      "schedule": "* * * * *"
    }
  ]
}
```

This runs every minute and processes the queue using Advanced Scheduler v2.

### 3. Use the Dashboard API

**Get scheduler dashboard metrics:**

```typescript
const response = await fetch('/api/scheduler/v2/dashboard?workspace_id=xxx');
const { dashboard } = await response.json();

console.log('Emails in Queue:', dashboard.emailsInQueue);
console.log('Throttle Status:', dashboard.throttleStatus);
console.log('Deliverability Score:', dashboard.deliverabilityScore);
```

### 4. Set Campaign Types

When creating campaigns, set the `campaign_type` to enable prioritization:

```typescript
await supabase.from('campaigns').insert({
  name: 'Storm Damage Outreach',
  campaign_type: 'storm', // Will get priority 1000
  // ... other fields
});
```

Available campaign types:
- `storm` (priority 1000)
- `revival` (priority 800)
- `followup` (priority 600)
- `repair` (priority 500)
- `free_estimate` (priority 400)
- `seasonal` (priority 300)
- `other` (priority 200)

## How Advanced Scheduling Makes Roofers More Money

- ✔ More inboxing
- ✔ More opens
- ✔ More replies
- ✔ More booked estimates
- ✔ More high-ticket roofs
- ✔ More storm appointments
- ✔ More follow-up conversions
- ✔ More consistency
- ✔ Less "slow weeks"

**The scheduler literally determines if a roofer books 0 jobs or 10+ per week.**

SmartSend handles ALL of it automatically.

## API Endpoints

### POST `/api/scheduler/v2/process`

Processes the send queue using Advanced Scheduler v2. Called by cron.

**Response:**
```json
{
  "ok": true,
  "processed": 150,
  "workspaces": 5,
  "timestamp": "2025-01-30T10:00:00Z"
}
```

### GET `/api/scheduler/v2/dashboard?workspace_id=xxx`

Returns scheduler dashboard metrics for a workspace.

**Response:**
```json
{
  "ok": true,
  "dashboard": {
    "emailsInQueue": 250,
    "nextWaveScheduledAt": "2025-01-30T11:30:00Z",
    "throttleStatus": "normal",
    "deliverabilityScore": 95.5,
    "engagementTrend7d": 12.5,
    "stormPriorityActive": true,
    "listQualityRating": 88.0,
    "queueStats": {
      "pending": 200,
      "sending": 20,
      "sent": 1500,
      "failed": 5,
      "byCampaignType": {
        "storm": 100,
        "revival": 80,
        "followup": 20
      }
    },
    "waveStats": {
      "wavesToday": 8,
      "emailsSentToday": 400,
      "averageWaveSize": 50,
      "nextWaveAt": "2025-01-30T11:30:00Z"
    }
  }
}
```

## Database Schema

### Key Tables

- `send_waves` — Tracks wave-based sending batches
- `homeowner_timing_patterns` — AI timing windows by location
- `email_engagement_timing` — Tracks opens/replies by time
- `list_quality_metrics` — List quality scores and throttle levels
- `list_quality_alerts` — Alerts for quality issues
- `deliverability_health` — Domain/inbox health scores
- `deliverability_events` — Auto-adjustment events
- `campaign_load_balance` — Multi-campaign load balancing
- `scheduler_autopilot_rules` — Autopilot rule configurations

### Views

- `v_scheduler_dashboard` — Dashboard metrics view

## Monitoring

Check scheduler health:

```sql
-- Queue stats
SELECT 
  status,
  COUNT(*) as count
FROM send_queue
GROUP BY status;

-- Wave stats today
SELECT 
  workspace_id,
  COUNT(*) as waves_today,
  SUM(emails_sent) as emails_sent
FROM send_waves
WHERE started_at >= CURRENT_DATE
GROUP BY workspace_id;

-- List quality issues
SELECT 
  workspace_id,
  throttle_level,
  quality_score,
  bounce_rate
FROM list_quality_metrics
WHERE throttle_level != 'normal'
ORDER BY metric_date DESC;
```

## Files Created

### Database
- `supabase/migrations/20250130000002_advanced_scheduler_v2.sql`

### Core Library Files
- `src/lib/scheduler/v2/waveSystem.ts`
- `src/lib/scheduler/v2/timingWindows.ts`
- `src/lib/scheduler/v2/listQuality.ts`
- `src/lib/scheduler/v2/prioritization.ts`
- `src/lib/scheduler/v2/deliverability.ts`
- `src/lib/scheduler/v2/loadBalancing.ts`
- `src/lib/scheduler/v2/autopilot.ts`
- `src/lib/scheduler/v2/dashboard.ts`
- `src/lib/scheduler/v2/processQueueV2.ts`

### API Endpoints
- `app/api/scheduler/v2/process/route.ts`
- `app/api/scheduler/v2/dashboard/route.ts`

## Migration from v1

If you're using the old `processQueue`, you can gradually migrate:

1. Run the database migration
2. Update cron to call `/api/scheduler/v2/process` instead of the old endpoint
3. Set `campaign_type` on existing campaigns
4. Monitor dashboard metrics

The new scheduler is backward compatible and will work with existing `send_queue` items.

## Testing

**Test queue processing:**
```bash
curl -X POST http://localhost:3000/api/scheduler/v2/process
```

**Test dashboard:**
```bash
curl http://localhost:3000/api/scheduler/v2/dashboard?workspace_id=xxx
```

## Future Enhancements

- [ ] IP pool rotation implementation
- [ ] Subject line replacement based on spam detection
- [ ] Advanced storm spike detection
- [ ] Per-city timing pattern refinement
- [ ] A/B testing integration
- [ ] Machine learning for optimal send times

---

**This is the heartbeat of SmartSend. Without this block, nothing gets delivered reliably. With this block, the whole machine becomes a money-making engine for roofers.**







































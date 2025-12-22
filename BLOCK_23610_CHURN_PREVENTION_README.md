# Block 23610 — SmartSend Roofing Churn Prevention Engine v1

**FULL RETENTION MACHINE — BUILT FOR ROOFERS, ZERO FLUFF.**

This system eliminates churn by detecting early signals and proactively intervening.

## Overview

Roofers cancel for one of three reasons:
1. They forget SmartSend exists
2. They don't launch enough campaigns
3. They never saw a "win"

This system eliminates all three.

## System Architecture

### 1. The 3-Level Retention Engine

**LEVEL 1 — Usage Monitoring (Automatic)**
- Tracks campaigns sent, replies received, open rates, dashboard visits
- Automatically triggers interventions if usage is low

**LEVEL 2 — Monthly Success Check-In**
- Sends monthly metrics via email + SMS
- Shows replies, leads created, estimated job value
- Cuts churn by 60%

**LEVEL 3 — Win Creation System**
- Automatically launches campaigns for inactive roofers
- Forces wins by creating results

### 2. Early Churn Signals (Week 1-2)

Detects these signals automatically:
- 0 campaigns launched in 7 days
- 0 replies in first 3-5 days
- User hasn't opened SmartSend dashboard
- Added no email list
- They reply slowly to check-ins
- They say: "I've been busy"
- They miss 2+ scheduled calls

### 3. Intervention Scripts

Four word-for-word scripts:
- **Script A** — Easy Win Fix (Day 7)
- **Script B** — Low Reply Fix (Day 3-5)
- **Script C** — Dashboard Ghost
- **Script D** — Busy Excuse

### 4. Campaign Ladder

Automatically launches campaigns monthly:
- Lead Revival Campaign
- Free Estimate Campaign
- Storm Damage Campaign
- Seasonal Campaign
- Referral Booster Campaign
- 5-Star Review Campaign
- Upsell Campaigns (Gutters, Fascia, Siding)

### 5. 90-Day Retention Play

When usage drops after 45 days:
1. Launch high-impact sequence automatically
2. Show results 48 hours later
3. Help them book one estimate

### 6. Win-Back Engine

For cancellations:
- Sends win-back script
- Launches revival campaign
- Offers to restart if they get one win

## Database Schema

### Tables Created

1. **roofer_usage_metrics** — Tracks daily/weekly/monthly usage
2. **churn_signals** — Stores detected churn signals
3. **retention_interventions** — Tracks all interventions sent
4. **monthly_checkins** — Monthly check-in history
5. **campaign_ladder_history** — Campaign ladder tracking
6. **winback_attempts** — Win-back attempt history

## Integration Points

### 1. Track Dashboard Visits

Add to your dashboard page:

```tsx
import { useDashboardTracker } from '@/lib/churn-prevention';

export default function DashboardPage() {
  useDashboardTracker(); // Tracks visits automatically
  
  // ... rest of component
}
```

### 2. Track Campaign Launches

When a campaign is created/activated:

```typescript
import { trackCampaignLaunch } from '@/lib/churn-prevention';

// After campaign creation
await trackCampaignLaunch(workspaceId, userId);
```

### 3. Track Replies

When a reply is detected:

```typescript
import { trackReplyReceived } from '@/lib/churn-prevention';

// When processing inbound reply
await trackReplyReceived(workspaceId, userId);
```

### 4. Track Email Events

```typescript
import { 
  trackCampaignSent,
  trackEmailOpen,
  trackEmailClick 
} from '@/lib/churn-prevention';

// When email is sent
await trackCampaignSent(workspaceId, userId, count);

// When email is opened
await trackEmailOpen(workspaceId, userId);

// When link is clicked
await trackEmailClick(workspaceId, userId);
```

## API Endpoints

### Detect Churn Signals

```bash
POST /api/churn-prevention/detect-signals
Body: { workspaceId: string }
```

### Track Dashboard Visit

```bash
POST /api/churn-prevention/track-dashboard-visit
```

### Cron Job (Daily)

```bash
POST /api/cron/churn-prevention
Headers: { Authorization: Bearer ${CRON_SECRET} }
```

## Cron Job Setup

Set up a daily cron job to call:

```
POST https://your-domain.com/api/cron/churn-prevention
Authorization: Bearer ${CRON_SECRET}
```

This job:
1. Detects churn signals for new workspaces (days 1-14)
2. Sends monthly check-ins
3. Sends win-back attempts
4. Executes 90-day retention plays
5. Launches campaign ladder campaigns

## Manual Usage

### Send Monthly Check-In

```typescript
import { sendMonthlyCheckIn } from '@/lib/churn-prevention';

await sendMonthlyCheckIn(workspaceId, userId);
```

### Send Win-Back Attempt

```typescript
import { sendWinBackAttempt } from '@/lib/churn-prevention';

await sendWinBackAttempt(workspaceId, userId);
```

### Execute 90-Day Retention Play

```typescript
import { execute90DayRetentionPlay } from '@/lib/churn-prevention';

await execute90DayRetentionPlay(workspaceId, userId);
```

## Churn Prevention Rules

**Rule 1** — No roofer should ever be allowed to be inactive.
- If they don't use SmartSend, YOU use SmartSend for them.

**Rule 2** — Wins prevent churn.
- One booked estimate beats 10 tutorials.

**Rule 3** — Roofers forget. You remind.
- Your check-ins = SmartSend stays top-of-mind.

**Rule 4** — Make it feel done for them.
- The less they touch, the longer they stay.

**Rule 5** — Fix problems before they complain.
- If usage drops, you act — don't wait.

## Why This System Works

Roofers stay subscribed when they feel:
- SmartSend is making them money
- SmartSend is thinking for them
- SmartSend is doing work they don't have time for
- SmartSend is simple
- SmartSend is consistent

When a roofer starts seeing SmartSend as a "digital office assistant" that books jobs automatically → You've built a recession-proof, churn-proof product.

## Environment Variables

Required:
- `RESEND_API_KEY` — For sending intervention emails
- `CRON_SECRET` — Secret for cron job authentication
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase URL
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key

## Migration

Run the migration:

```bash
supabase migration up 20250130000002_block23610_churn_prevention_engine_v1
```

## Monitoring

View churn signals:
```sql
SELECT * FROM churn_signals WHERE status = 'active';
```

View interventions:
```sql
SELECT * FROM retention_interventions ORDER BY sent_at DESC;
```

View usage metrics:
```sql
SELECT * FROM roofer_usage_metrics ORDER BY period_start DESC;
```

## Support

For questions or issues, refer to the implementation in:
- `/src/lib/churn-prevention/` — Core logic
- `/src/app/api/churn-prevention/` — API endpoints
- `/supabase/migrations/20250130000002_block23610_churn_prevention_engine_v1.sql` — Database schema







































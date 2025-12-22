# Mailbox Health Stats & Warmup System

This document describes the mailbox health tracking and warmup enforcement system implemented in SmartSend AI.

## Overview

The system tracks daily statistics per mailbox (sent, delivered, bounced, replied, unsubscribed, etc.) and enforces warmup ramps to protect domain reputation.

## Database Schema

### Tables

#### `mailbox_daily_stats`
Daily aggregated stats per mailbox:
- `mailbox_id` - Reference to connected_accounts
- `day` - Date (YYYY-MM-DD)
- `sent`, `delivered`, `bounced`, `replied`, `unsubscribed`, `spam_reports`, `opens`, `clicks` - Counters
- Unique on (mailbox_id, day)

#### `warmup_plans`
Predefined ramp schedules:
- `id` - UUID
- `name` - Unique plan name (e.g., "default-30d")
- `created_at` - Timestamp

#### `warmup_steps`
Daily allowances per plan:
- `plan_id` - Reference to warmup_plans
- `day_no` - 1-based day number
- `send_cap` - Maximum sends allowed that day
- Unique on (plan_id, day_no)

### Views

#### `v_mailbox_health`
Convenience view with calculated percentages:
- `deliver_pct` - 100.0 * delivered / sent
- `reply_pct` - 100.0 * replied / sent
- `bounce_pct` - 100.0 * bounced / sent
- `open_rate_pct` - 100.0 * opens / delivered
- `click_rate_pct` - 100.0 * clicks / delivered

### Functions

#### `incr_mailbox_daily_stats(p_id uuid, p_delta jsonb)`
Atomically increment stats fields:
- Takes a stats row ID and delta object
- Updates only non-zero fields
- Security definer, execute grant to service_role

## Stats Tracking

### When Stats Are Incremented

1. **Send Success** (in `send_tick/index.ts`):
   - `sent: 1, delivered: 1`

2. **Send Failure (Bounce)** (in `send_tick/index.ts`):
   - `sent: 1, bounced: 1` (if error matches bounce patterns)

3. **Reply Detected** (in `reply-detect/index.ts`):
   - `replied: 1`

4. **Unsubscribe Detected** (in `reply-detect/index.ts`):
   - `unsubscribed: 1`

5. **Bounce Detected** (in `reply-detect/index.ts`):
   - `bounced: 1`

## Warmup Enforcement

### In Sender Tick

The sender tick enforces three layers of caps:

1. **Bounce Guard**: Pauses mailbox if bounce % ≥ 5.0 with ≥ 10 sends in any of the last 3 days
2. **Warmup Cap**: Respects warmup plan day-by-day ramp (if enabled)
3. **Daily Cap**: Applied from connected_accounts.daily_cap
4. **Plan Remaining**: Respects team/user plan limits

Final batch size = `min(budget, plan_remaining, warmCap, 10)`

### Warmup Day Calculation

```typescript
const dayNo = Math.max(1, Math.floor((today - warmup_started_at) / (24 * 3600 * 1000)) + 1)
```

Falls back to sensible default if no warmup plan steps exist:
```typescript
const rampCap = step?.send_cap ?? Math.min(10 + (dayNo - 1) * 3, daily_cap)
```

## API Endpoints

### `GET /api/mailboxes/[id]/health`
Returns 30-day health series and today's summary:

```json
{
  "summary": {
    "sent_today": 15,
    "deliver_pct_today": 95.0,
    "reply_pct_today": 2.5,
    "bounce_pct_today": 5.0
  },
  "series": [
    {
      "day": "2024-12-01",
      "sent": 10,
      "deliver_pct": 100.0,
      "reply_pct": 0.0,
      "bounce_pct": 0.0
    }
  ],
  "warmup": {
    "enabled": true,
    "started_at": "2024-12-01",
    "day": 5,
    "daily_cap": 40,
    "provider_domain": "gmail.com",
    "plan_id": "uuid"
  }
}
```

### `PATCH /api/mailboxes/[id]/warmup`
Update warmup settings:

```json
{
  "enabled": true,
  "start": true,
  "daily_cap": 50
}
```

## UI Components

### HealthHeader
Displays today's key metrics in 4 cards:
- Sent count
- Delivery %
- Reply %
- Bounce %

### HealthCharts
Two charts:
1. **Bar Chart**: Sends per day (last 30 days)
2. **Line Chart**: Rates (delivery/reply/bounce)

### WarmupControls
Interactive controls:
- Toggle warmup enabled/disabled
- Set daily cap
- Start/restart warmup

## Security

### RLS Policies

- `mailbox_daily_stats`: Users can only view their own mailbox stats
- Write access revoked from authenticated/anon (stats updated server-side only)
- Service role has full access

### Function Permissions

- `incr_mailbox_daily_stats`: Execute grant to service_role only
- No public access

## Default Warmup Plan

The migration seeds a 30-day warmup plan:

| Day | Sends |
|-----|-------|
| 1   | 10    |
| 2   | 12    |
| 3   | 15    |
| ... | ...   |
| 30  | 130   |

## QA Checklist

- [x] Send successes increment sent + delivered
- [x] Bounces increment sent + bounced
- [x] Replies increment replied counter
- [x] Unsubscribes increment unsubscribed counter
- [x] 30-day chart renders with proper data
- [x] Today's metrics show zeros when idle
- [x] Warmup respects plan day caps
- [x] Warmup falls back to sensible default if no plan
- [x] Bounce guard pauses mailbox at threshold
- [x] Pause logs appear in send_logs
- [x] Turning warmup off removes ramp cap
- [x] RLS: users can't view other users' mailbox stats
- [x] API endpoints return correct data
- [x] UI components render properly
- [x] No double counting on retries

## Files Created/Modified

### Migrations
- `supabase/migrations/20241205000000_mailbox_health_stats.sql` - Main schema

### Server Functions
- `supabase/functions/send_tick/index.ts` - Stats tracking + warmup enforcement
- `supabase/functions/reply-detect/index.ts` - Reply/unsubscribe/bounce stats

### Library Code
- `src/lib/stats.ts` - Helper functions for stats tracking

### API Routes
- `src/app/api/mailboxes/[id]/health/route.ts` - Health data endpoint
- `src/app/api/mailboxes/[id]/warmup/route.ts` - Warmup settings endpoint

### UI Components
- `src/components/mailbox/HealthHeader.tsx` - Today's metrics
- `src/components/mailbox/HealthCharts.tsx` - Historical charts
- `src/components/mailbox/WarmupControls.tsx` - Warmup settings

## Usage Example

```typescript
// In a Next.js page or component
import { HealthHeader } from '@/components/mailbox/HealthHeader'
import { HealthCharts } from '@/components/mailbox/HealthCharts'
import { WarmupControls } from '@/components/mailbox/WarmupControls'

export default function MailboxPage({ mailboxId }: { mailboxId: string }) {
  return (
    <div>
      <HealthHeader mailboxId={mailboxId} />
      <HealthCharts mailboxId={mailboxId} />
      <WarmupControls mailboxId={mailboxId} />
    </div>
  )
}
```


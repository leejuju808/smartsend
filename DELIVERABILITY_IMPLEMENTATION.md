# Deliverability System Implementation

This document describes the deliverability system implementation with sender health tracking, risk scoring, and throttling.

## Components

### 1. Database Schema

**Migration:** `supabase/migrations/20250130000002_sender_health_deliverability.sql`

- `sender_health` table: Tracks per-mailbox daily metrics (sends, bounces, complaints, opens, replies, health_score)
- `scheduled_messages` table: Extended with `spam_risk`, `throttle_reason`, `throttled` columns
- `send_queue` table: Extended with `spam_risk`, `throttle_reason`, `throttled` columns  
- `campaigns` table: Extended with throttle controls:
  - `max_daily_sends_per_mailbox` (default: 200)
  - `bounce_halt_threshold` (default: 0.05)
  - `complaint_halt_threshold` (default: 0.002)
  - `risk_block_threshold` (default: 0.75)
  - `risk_warn_threshold` (default: 0.55)

### 2. Risk Scoring

**File:** `lib/deliverability/riskScore.ts`

Heuristic-based content risk scorer that evaluates:
- Excessive capitalization
- Multiple exclamation marks
- Too many links (>3)
- Images
- Spammy words/phrases
- Long subject/body

Returns a score from 0 (safe) to 1 (risky).

### 3. Mailbox Quota & Health Guard

**File:** `lib/deliverability/canSend.ts`

Checks if a mailbox can send based on:
- Daily send quota (max_daily_sends_per_mailbox)
- Bounce rate threshold
- Complaint rate threshold

### 4. Guarded Enqueue

**File:** `lib/deliverability/guardedEnqueue.ts`

Integrated compose hook that:
1. Runs brand preflight check
2. Checks mailbox/domain health (via `canSend`)
3. Computes content risk (via `riskScore`)
4. Blocks if risk exceeds threshold
5. Warns if risk exceeds warn threshold
6. Returns status and risk info for storage

**Usage Example:**

```typescript
import { guardedEnqueue } from "@/lib/deliverability/guardedEnqueue";

const result = await guardedEnqueue({
  accountId: user.id,
  campaignId: campaign.id,
  contactId: contact.id,
  mailboxEmail: campaign.from_email,
  subject: renderedSubject,
  body: renderedBody,
  templateId: templateId,
  variantId: variantId,
  toneUsed: tone,
});

if (result.status === "throttled" || result.status === "blocked") {
  // Store throttled/blocked message with reason
  await supabase.from("send_queue").insert({
    campaign_id: campaignId,
    contact_id: contactId,
    subject,
    body,
    throttled: true,
    throttle_reason: result.reason,
    spam_risk: result.risk,
    status: "throttled",
  });
} else {
  // Store normal message with risk score
  await supabase.from("send_queue").insert({
    campaign_id: campaignId,
    contact_id: contactId,
    subject,
    body,
    spam_risk: result.risk,
    throttled: false,
    status: "queued",
  });
}
```

### 5. Nightly Health Rollup

**SQL Function:** `supabase/migrations/20250130000003_sender_health_rollup_function.sql`
- `rollup_sender_metrics_yesterday()`: Aggregates yesterday's outcomes by mailbox

**Edge Function:** `supabase/functions/sender-health-rollup/index.ts`
- Runs nightly to compute health scores
- Calculates health_score based on bounce/complaint rates and engagement
- Upserts into `sender_health` table

**Schedule:** Set up a cron job to call this function daily (e.g., via Supabase cron or external scheduler).

### 6. Dashboard Components

**Mailbox Health Panel:** `src/components/deliverability/MailboxHealthPanel.tsx`
- Shows last 7 days of health metrics
- Health score sparkline
- Sends, Bounce %, Complaint %, Opens %

**Risk Feed:** `src/components/deliverability/RiskFeed.tsx`
- Lists blocked/throttled items
- Shows reason and risk score
- "Fix Content" link to campaign

**Campaign Controls:** `src/components/deliverability/CampaignDeliverabilityControls.tsx`
- Campaign-level throttle settings
- Daily cap, thresholds, warn/block sliders

**Queue Display:** Updated `src/app/dashboard/queue/columns.tsx`
- Shows risk indicators in send queue
- Displays throttled status and risk percentage

## Integration Steps

### Step 1: Run Migrations

```bash
# Apply database migrations
supabase migration up
```

### Step 2: Set Up Nightly Rollup

Schedule the `sender-health-rollup` edge function to run daily:

```sql
-- Example: Set up via pg_cron (if available)
SELECT cron.schedule(
  'sender-health-rollup',
  '0 2 * * *', -- 2 AM UTC daily
  $$
  SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/sender-health-rollup',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  );
  $$
);
```

Or use Supabase Dashboard → Edge Functions → Schedule.

### Step 3: Integrate into Enqueue Routes

Update your enqueue routes to call `guardedEnqueue` before inserting into `send_queue`. See usage example above.

### Step 4: Update Queue Queries

Ensure queue queries include `spam_risk`, `throttled`, `throttle_reason` fields:

```typescript
const { data: queue } = await supabase
  .from("send_queue")
  .select("*, spam_risk, throttled, throttle_reason")
  .eq("campaign_id", campaignId);
```

### Step 5: Add Dashboard Components

Add deliverability components to your dashboard:

```tsx
import { MailboxHealthPanel } from "@/components/deliverability/MailboxHealthPanel";
import { RiskFeed } from "@/components/deliverability/RiskFeed";
import { CampaignDeliverabilityControls } from "@/components/deliverability/CampaignDeliverabilityControls";

// In your dashboard page
<MailboxHealthPanel accountId={user.id} />
<RiskFeed accountId={user.id} />
<CampaignDeliverabilityControls campaignId={campaignId} />
```

## Testing

### Test Cases

1. **Quota Test:** Set `max_daily_sends_per_mailbox` to 5, attempt 6th send → should be throttled with `quota_reached`
2. **Risk Block Test:** Send email with 6+ links and ALL-CAPS subject → should be blocked with `content_risky`
3. **Bounce Threshold Test:** Simulate 8% bounces today → subsequent sends should be blocked with `domain_hot_bounce`
4. **Normal Send:** Safe email → should enqueue with risk ~0.10-0.20

### Manual Testing

```typescript
// Test risk scoring
import { riskScore } from "@/lib/deliverability/riskScore";

const risky = riskScore("FREE MONEY!!!", "Click here: https://example.com https://example2.com https://example3.com https://example4.com");
console.log(risky); // Should be >= 0.75

const safe = riskScore("Hello", "Hi there, how are you?");
console.log(safe); // Should be < 0.20
```

## Notes

- The system works alongside Day-24 brand preflight checks
- Risk scoring uses lightweight heuristics (can be enhanced with ML later)
- Health scores are computed nightly; real-time checks use current day's metrics
- Throttled messages are stored but not sent
- Risk warnings are logged to `send_preflight_logs` for UI display
















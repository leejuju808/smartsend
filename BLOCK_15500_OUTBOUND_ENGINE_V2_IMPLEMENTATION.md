# Block 15500 — SmartSend Outbound Engine v2 Implementation

## Overview

This block implements a professional-grade outbound email sending engine with 7 major upgrades:

1. **Adaptive Throttling** - Automatically adjusts send speed based on domain health
2. **Priority Queueing** - Ensures HOT follow-ups always go first
3. **Warmup-Aware Sending** - Enforces daily caps during domain warmup
4. **Bounce-Aware Rerouting** - Suppresses problematic contacts instantly
5. **Retry Logic** - Exponential backoff for failed sends
6. **Sequence Chaining** - Prevents Step 2 if Step 1 fails
7. **Deliverability-Aware Pacing** - Protects domain reputation

## Database Changes

### Migration: `20250130000002_block15500_outbound_engine_v2.sql`

#### Enhanced `campaign_send_queue` Table
- `priority` (integer, 1-5): Priority level for queue ordering
- `step_number` (integer): Sequence step number for chaining
- `contact_id` (uuid): Contact reference for suppression
- `retry_count` (integer): Number of retry attempts
- `next_retry_at` (timestamptz): Scheduled retry time
- `suppressed` (boolean): Contact suppression flag
- `suppression_reason` (text): Reason for suppression
- `provider_account_id` (uuid): Account tracking

#### Enhanced `company_settings` Table
- `max_send_rate` (integer): Maximum emails per hour (default: 200)
- `warmup_active` (boolean): Whether domain is warming up
- `warmup_stage` (integer): Warmup day number (0-8)
- `warmup_started_at` (timestamptz): When warmup started
- `domain_health_score` (numeric): Domain health score (0-100)

#### New Tables

**`contact_suppressions`**
- Tracks suppressed contacts (bounce/complaint/temp_block)
- Prevents sending to problematic contacts

**`deliverability_events`**
- Logs all deliverability-related events
- Used for debugging and monitoring

### Database Functions

1. **`lock_send_queue_batch_v2`** - Priority-based queue locking with warmup awareness
2. **`calculate_send_rate`** - Calculates adaptive send rate based on domain health
3. **`suppress_contact`** - Suppresses a contact and marks queue items
4. **`is_contact_suppressed`** - Checks if contact is suppressed
5. **`schedule_retry`** - Schedules retry with exponential backoff
6. **`can_send_sequence_step`** - Checks if sequence step can be sent (chaining)

## Worker Functions

### 1. `/outbound-priorityQueue`
- Processes send queue with priority-based ordering
- Uses `lock_send_queue_batch_v2` function
- Returns jobs ordered by priority (1 = highest)

### 2. `/outbound-retryFailed`
- Processes retry queue
- Resets retry jobs to pending when `next_retry_at` is reached
- Logs retry events

### 3. `/outbound-deliverabilityGuard`
- Monitors domain health
- Calculates adaptive send rates
- Checks warmup limits
- Determines if sending should pause
- Logs deliverability events

## Updated Functions

### `/process-send-queue` (Enhanced)

**New Features:**
1. Uses `lock_send_queue_batch_v2` for priority queueing
2. Sequence chaining check (prevents Step 2 if Step 1 failed)
3. Contact suppression check (bounce-aware rerouting)
4. Retry logic with exponential backoff
5. Automatic contact suppression on bounce/complaint

**Retry Schedule:**
- Retry #1 → after 5 minutes
- Retry #2 → after 15 minutes
- Retry #3 → after 1 hour
- Retry #4 → after 6 hours

**Suppression Triggers:**
- Hard bounce → permanent suppression
- Complaint → permanent suppression
- Temp block → temporary suppression

## API Endpoints

### `/api/campaigns/[id]/send-activity`
Campaign Debug View endpoint showing:
- Queue statistics (queued, sent, failed, retrying, skipped)
- Priority breakdown
- Average send pace
- Warmup status
- Domain health
- Safety events (last 24h)
- Retry jobs
- Suppressed contacts

## Priority Levels

1. **Priority 1** - Follow-Ups (HOT) 🔥
   - Urgent homeowner follow-ups
   - Always processed first

2. **Priority 2** - Replies Requiring Next Step
   - Homeowner asked for price/availability/inspection/insurance info

3. **Priority 3** - New Campaign Sends
   - First steps in campaigns
   - Maximizes first-step deliverability

4. **Priority 4** - Secondary Campaign Steps
   - Steps 2-7 in long sequences

5. **Priority 5** - Low-Quality / COLD Follow-Ups
   - Bottom of the queue

## Adaptive Throttling

Based on domain health score:
- **< 60** → Slow mode: 50 emails/hour
- **60-70** → Reduced mode: 100 emails/hour
- **70-85** → Normal mode: 150 emails/hour
- **≥ 85** → Full mode: max_send_rate (default 200)

## Warmup Limits

If warmup is active:
- Day 1 → 20 emails/day
- Day 2 → 30 emails/day
- Day 3 → 40 emails/day
- Day 4 → 50 emails/day
- Day 5 → 75 emails/day
- Day 6 → 100 emails/day
- Day 7 → 150 emails/day
- Day 8+ → Full plan limit

## Sequence Chaining

- If Step 1 fails → Step 2 does NOT fire
- If Step 1 sends → Step 2 respects delay
- Ensures timeline accuracy
- Prevents sending chaos

## Usage

### Setting Priority When Enqueueing

```typescript
await supabase.from("campaign_send_queue").insert({
  campaign_id: "...",
  contact_id: "...",
  priority: 1, // Follow-up = Priority 1
  step_number: 2,
  // ... other fields
});
```

### Checking Warmup Status

```typescript
const { data: settings } = await supabase
  .from("company_settings")
  .select("warmup_active, warmup_stage, domain_health_score")
  .eq("workspace_id", workspaceId)
  .single();
```

### Suppressing a Contact

```typescript
await supabase.rpc("suppress_contact", {
  p_workspace_id: workspaceId,
  p_contact_id: contactId,
  p_email: email,
  p_reason: "bounce", // or "complaint", "temp_block"
});
```

## Monitoring

### Campaign Debug View
Access via: `/api/campaigns/[id]/send-activity`

Shows:
- Real-time queue statistics
- Priority distribution
- Send pace metrics
- Warmup status
- Safety events
- Retry queue
- Suppressed contacts

### Deliverability Events
All events logged to `deliverability_events` table:
- `throttle_slow` - Adaptive throttling applied
- `throttle_pause` - Sending paused
- `warmup_limit_reached` - Daily warmup limit hit
- `bounce_detected` - Bounce triggered suppression
- `complaint_detected` - Complaint triggered suppression
- `retry_scheduled` - Job scheduled for retry
- `suppression_added` - Contact suppressed

## Benefits

🔥 **1. Emails send reliably** - ZERO "campaign stuck" moments
🔥 **2. HOT follow-ups ALWAYS go first** - Revenue-critical emails prioritized
🔥 **3. Campaigns send smoothly** - No drops, consistent delivery
🔥 **4. Professional reliability** - Builds trust with roofers
🔥 **5. Domain protection** - Prevents domain burns
🔥 **6. Cleaner sending ecosystem** - Less abuse, more uptime

## Next Steps

1. Run migration: `20250130000002_block15500_outbound_engine_v2.sql`
2. Deploy worker functions:
   - `/outbound-priorityQueue`
   - `/outbound-retryFailed`
   - `/outbound-deliverabilityGuard`
3. Update cron jobs to call new functions
4. Integrate Campaign Debug View UI component
5. Monitor deliverability events dashboard






















































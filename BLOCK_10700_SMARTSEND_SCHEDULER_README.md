# Block 10700 — SmartSend Scheduler & Send Queue v1

**The sending backbone of SmartSend** — the system that schedules all campaign messages, respects timing rules, sends emails in small safe batches, prevents deliverability issues, and guarantees campaigns go out exactly when they should.

## Overview

This block implements the core scheduling and sending infrastructure for SmartSend:

1. **Send Queue System** — All emails flow through a centralized queue table
2. **Worker Cron** — Processes the queue every minute, sending emails safely
3. **Sequence Timing Logic** — Behavior-aware sending (Message 1 immediate, Message 2 after 2 days if no reply, Message 3 after 4 days if no reply)
4. **Safety Rules** — Deliverability protection (rate limiting, delays, auto-pause)
5. **Dashboard Notifications** — Activity logs for roofer visibility

## Architecture

### 1. Send Queue Table (`send_queue`)

The conveyor belt of the entire SmartSend system. Every email goes through this table.

**Key Fields:**
- `id` — Unique identifier
- `user_id` — Campaign owner
- `campaign_id` — Which campaign this belongs to
- `contact_id` — Recipient contact
- `message_body` — HTML email content
- `subject` — Email subject line
- `send_at` — Exact timestamp when to send
- `sent` — Boolean flag (false = queued, true = sent)
- `status` — 'queued', 'sending', 'sent', 'failed', 'canceled', 'skipped'
- `sequence_step` — 1, 2, or 3 (position in sequence)
- `step_label` — 'initial', 'followup-1', 'followup-2'
- `attempts` — Retry counter
- `max_attempts` — Default 3
- `error` — Error message if failed

### 2. Queue Worker (`/api/queue/worker`)

Runs every minute via Vercel Cron. Processes all queued emails where:
- `sent = false`
- `send_at <= now()`
- `status = 'queued'`

**Process Flow:**
1. Fetch due queue items (max 50 per run)
2. Group by user_id for rate limiting
3. Check safety rules per user
4. For each item:
   - Check if sequence should continue (no reply received)
   - Mark as 'sending'
   - Apply random delay (6-18 seconds)
   - Send email via provider
   - Mark as 'sent' or retry on failure
   - Log activity event

**Safety Features:**
- Max 60 sends per hour per user
- Random 6-18 second delay between emails
- Auto-cancel follow-ups if contact replied
- Exponential backoff on retries (2min, 4min, 8min)

### 3. Campaign Schedule API (`/api/campaign/schedule`)

Schedules all campaign messages into the queue.

**POST `/api/campaign/schedule`**

Request body:
```json
{
  "campaignId": "uuid",
  "contactIds": ["uuid1", "uuid2", ...],
  "sequence": {
    "step1": { "subject": "...", "body": "..." },
    "step2": { "subject": "...", "body": "..." },
    "step3": { "subject": "...", "body": "..." }
  },
  "startTime": "2025-01-30T10:00:00Z" // optional, defaults to now
}
```

**Response:**
```json
{
  "ok": true,
  "scheduled": 150,
  "contacts": 50,
  "errors": []
}
```

**What it does:**
- Creates 3 queue entries per contact:
  - Message 1: `send_at = startTime` (immediate)
  - Message 2: `send_at = startTime + 2 days`
  - Message 3: `send_at = startTime + 4 days`
- Checks if sequence should continue (no reply, not stopped)
- Logs campaign scheduled event

**GET `/api/campaign/schedule?campaignId=xxx`**

Returns queue statistics for a campaign:
```json
{
  "ok": true,
  "campaignId": "uuid",
  "stats": {
    "total": 150,
    "queued": 50,
    "sent": 80,
    "failed": 5,
    "sending": 15
  }
}
```

## Sequence Timing Logic

SmartSend uses behavior-aware sending:

**Message 1:** Send immediately when campaign starts

**Message 2:** Send after 2 days, **only if:**
- No reply received
- Contact not marked as hot/warm/not_interested
- Sequence not manually stopped

**Message 3:** Send after 4 days, **only if:**
- No reply received
- Contact not marked as hot/warm/not_interested
- Sequence not manually stopped

**Sequence auto-stops if:**
- Hot lead
- Warm lead
- Not interested
- Manual stop
- Reply received in any form

## Safety Rules (Deliverability Protection)

To keep roofers out of spam:

1. **Max 60 sends per hour** — Per user rate limit
2. **Random delay 6-18 seconds** — Between each email
3. **Auto-pause if bounce rate >5%** — (Future: monitor bounce rates)
4. **Auto-pause if complaint rate >0.5%** — (Future: monitor complaint rates)
5. **Auto-warm if domain is new (<14 days old)** — (Future: domain age check)

These rules prevent account death and maintain deliverability.

## Activity Logs

When a message is sent, an activity log entry is created:

```json
{
  "user_id": "uuid",
  "campaign_id": "uuid",
  "contact_id": "uuid",
  "event_type": "message_sent",
  "message": "Message sent to John W.",
  "meta": {
    "sequence_step": 1,
    "step_label": "initial",
    "provider_message_id": "..."
  }
}
```

This builds trust with roofers — they see the system working for them.

## Setup Instructions

### 1. Run Database Migration

```bash
# Apply the migration
supabase migration up

# Or manually run:
psql $DATABASE_URL -f supabase/migrations/20250130000002_send_queue_scheduler.sql
```

### 2. Configure Cron Job

The queue worker is already configured in `vercel.json`:

```json
{
  "path": "/api/queue/worker",
  "schedule": "* * * * *"
}
```

This runs every minute. Vercel will automatically invoke this endpoint.

### 3. Use the API

**Schedule a campaign:**
```typescript
const response = await fetch('/api/campaign/schedule', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    campaignId: 'campaign-uuid',
    contactIds: ['contact-1', 'contact-2'],
    sequence: {
      step1: {
        subject: 'Initial outreach',
        body: '<p>Hi {{first_name}}, ...</p>'
      },
      step2: {
        subject: 'Following up',
        body: '<p>Hi {{first_name}}, just checking in...</p>'
      },
      step3: {
        subject: 'Last attempt',
        body: '<p>Hi {{first_name}}, one more time...</p>'
      }
    }
  })
});
```

**Check queue status:**
```typescript
const response = await fetch('/api/campaign/schedule?campaignId=campaign-uuid');
const { stats } = await response.json();
console.log(`Sent: ${stats.sent}, Queued: ${stats.queued}`);
```

## Helper Functions

Located in `lib/queue/scheduler.ts`:

- `scheduleCampaign()` — Schedule all messages for a campaign
- `addToQueue()` — Add a single message to queue
- `sendEmail()` — Send email via provider
- `logEvent()` — Log activity event
- `checkSafetyRules()` — Check deliverability rules
- `checkRateLimit()` — Check hourly send limit
- `getRandomDelay()` — Get random delay (6-18 seconds)

## Why This Block Helps Roofing Companies

1. **Emails go out automatically** — Roofers don't schedule anything. They just see results.

2. **No missed follow-ups** — The system handles timing perfectly. Roofers aren't organized — SmartSend fixes that.

3. **Protects the roofer's domain** — Deliverability rules stop them from burning their email.

4. **Makes SmartSend reliable** — Roofers hate tech breaking. This block makes the system feel rock-solid.

5. **They see consistent homeowner replies** — Which means more booked estimates, more signed jobs, more money.

## Files Created

- `supabase/migrations/20250130000002_send_queue_scheduler.sql` — Database schema
- `lib/queue/scheduler.ts` — Helper functions
- `app/api/queue/worker/route.ts` — Queue worker endpoint
- `app/api/campaign/schedule/route.ts` — Campaign scheduling endpoint
- `vercel.json` — Updated with cron job

## Testing

**Test queue worker:**
```bash
curl -X POST http://localhost:3000/api/queue/worker
```

**Test campaign schedule:**
```bash
curl -X POST http://localhost:3000/api/campaign/schedule \
  -H "Content-Type: application/json" \
  -d '{
    "campaignId": "your-campaign-id",
    "contactIds": ["contact-id-1"],
    "sequence": {
      "step1": { "subject": "Test", "body": "<p>Test email</p>" },
      "step2": { "subject": "Follow up", "body": "<p>Follow up</p>" },
      "step3": { "subject": "Last", "body": "<p>Last email</p>" }
    }
  }'
```

## Monitoring

Check queue health:
```sql
-- Queue stats
SELECT 
  status,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE sent = true) as sent_count
FROM send_queue
GROUP BY status;

-- Pending items
SELECT COUNT(*) 
FROM send_queue 
WHERE sent = false 
AND send_at <= now();
```

## Future Enhancements

- [ ] Auto-pause on bounce/complaint thresholds
- [ ] Domain warmup detection
- [ ] Per-domain rate limiting
- [ ] Timezone-aware sending windows
- [ ] A/B testing support
- [ ] Advanced retry strategies

---

**This is the heartbeat of SmartSend. Without this block, nothing gets delivered. With this block, the whole machine becomes reliable.**
























































# Sender Health & Safety System

A comprehensive sender reputation management system that protects your domain reputation with real-time health monitoring, automated bounce tracking, and progressive warmup caps.

## Overview

This system prevents deliverability damage by:
- 🛡️ **Bounce Guard**: Auto-pauses sending when hard bounce/complaint rates spike
- 📈 **Progressive Warmup**: Gradually increases daily send limits (25 → 200 over time)
- 📊 **Real-time Health**: Visual badges (🟢 green / 🟡 yellow / 🔴 red) for instant status
- 🎯 **Per-sender policies**: Independent caps and thresholds for each mailbox

## Architecture

### Database Schema
- `send_policies` — Warmup config and safety thresholds per sender
- `sender_stats_daily` — Aggregated metrics (sends, bounces, complaints) per day
- `bounce_events` — Raw event log from provider webhooks
- `send_attempts` — Lightweight send attempt log
- `sender_health_today` — View that computes current health status

### API Routes

#### POST `/api/send-safety/check-and-log`
**Pre-send guard** — Call before every email send.

**Request:**
```json
{
  "sender_email": "you@domain.com",
  "recipient_email": "lead@example.com",
  "campaign_id": "uuid-optional"
}
```

**Response:**
```json
{
  "allowed": true,
  "reason": null,
  "cap": 25,
  "sends_today": 12,
  "health_color": "green"
}
```

**Reasons for blocking:**
- `"paused"` — Sender manually paused
- `"daily_cap_reached"` — Hit warmup limit for today
- `"bounce_guard"` — Health status is RED (unsafe bounce/complaint rates)

#### GET `/api/send-safety/health?sender_email=you@domain.com`
**Health status query** — Get current sender health.

**Response:**
```json
{
  "row": {
    "sender_email": "you@domain.com",
    "paused": false,
    "daily_cap_start": 25,
    "daily_cap_max": 200,
    "daily_cap_step": 25,
    "warmup_start_date": "2025-10-01",
    "sends_today": 12,
    "hard_bounces_today": 0,
    "soft_bounces_today": 1,
    "complaints_today": 0,
    "health_color": "green"
  }
}
```

#### POST `/api/webhooks/email`
**Bounce/complaint webhook** — Receives normalized events from your email provider.

**Request:**
```json
{
  "provider": "sendgrid",
  "events": [
    {
      "type": "bounce_hard",
      "sender_email": "you@domain.com",
      "recipient_email": "bad@example.com",
      "reason": "user unknown",
      "provider_message_id": "abc123",
      "occurred_at": "2025-10-10T12:00:00Z"
    }
  ]
}
```

**Supported event types:**
- `delivered` — Increments delivered count
- `bounce_soft` — Temporary failure (mailbox full, etc)
- `bounce_hard` — Permanent failure (user unknown, domain invalid)
- `complaint` — Spam complaint

### UI Component

```tsx
import SenderHealthBadge from "@/components/send-safety/SenderHealthBadge";

// In your campaign composer or send dashboard:
<SenderHealthBadge senderEmail="you@domain.com" />
```

Shows color-coded badge with tooltip containing:
- Current daily cap
- Sends today
- Bounce/complaint counts

## Usage

### 1. Run SQL Migration

Apply the migration in Supabase SQL Editor:
```bash
# Migration file:
supabase/migrations/20250110000000_sender_health_policies.sql
```

Or via Supabase CLI:
```bash
supabase db push
```

### 2. Environment Variables

Ensure these are set in `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3. Integrate into Send Flow

Before sending each email:

```typescript
// Example: In your campaign send worker/queue
const gate = await fetch("/api/send-safety/check-and-log", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    sender_email: "you@domain.com",
    recipient_email: lead.email,
    campaign_id: campaign.id
  })
});

const result = await gate.json();

if (!result.allowed) {
  console.warn(`Send blocked: ${result.reason}`, result);
  // Options:
  // - Pause campaign
  // - Schedule retry for tomorrow
  // - Switch to different sender/mailbox
  // - Alert user
  return;
}

// Proceed with actual send
await sendEmail({ ... });

// Optionally: report "delivered" event after successful send
await fetch("/api/webhooks/email", {
  method: "POST",
  body: JSON.stringify({
    provider: "your_provider",
    events: [{
      type: "delivered",
      sender_email: "you@domain.com",
      recipient_email: lead.email
    }]
  })
});
```

### 4. Connect Email Provider Webhooks

Map your provider's webhook payloads to the normalized format:

**Example: SendGrid bounce webhook**
```typescript
// In your SendGrid webhook handler
export async function POST(req: Request) {
  const events = await req.json();
  
  const normalized = events.map(ev => ({
    type: ev.event === "bounce" 
      ? (ev.type === "blocked" ? "bounce_hard" : "bounce_soft")
      : ev.event === "spamreport" ? "complaint" : "delivered",
    sender_email: ev.from,
    recipient_email: ev.email,
    reason: ev.reason,
    provider_message_id: ev.sg_message_id,
    occurred_at: new Date(ev.timestamp * 1000).toISOString()
  }));

  // Forward to our normalized webhook
  await fetch("/api/webhooks/email", {
    method: "POST",
    body: JSON.stringify({
      provider: "sendgrid",
      events: normalized
    })
  });
}
```

## Configuration

### Policy Settings

Default warmup schedule (auto-created for new senders):
- **Day 1:** 25 emails/day
- **Day 2:** 50 emails/day
- **Day 3:** 75 emails/day
- **Day 8:** 200 emails/day (max cap)

Customize per sender via SQL:
```sql
UPDATE send_policies
SET 
  daily_cap_start = 50,    -- Start higher for established senders
  daily_cap_max = 500,      -- Higher ceiling for warmed accounts
  daily_cap_step = 50       -- Faster ramp
WHERE sender_email = 'trusted@domain.com';
```

### Safety Thresholds

Default thresholds (trigger RED health status):
- **Hard bounce:** 3% of sends
- **Soft bounce:** 8% of sends
- **Complaints:** 0.1% of sends

**YELLOW** (warning) triggers at 50% of threshold.

Adjust per sender:
```sql
UPDATE send_policies
SET 
  hard_bounce_threshold = 0.02,  -- Stricter 2% limit
  complaint_threshold = 0.0005    -- Stricter 0.05% limit
WHERE sender_email = 'high-value@domain.com';
```

### Manual Pause/Resume

```sql
-- Pause sender
UPDATE send_policies SET paused = true WHERE sender_email = 'sender@domain.com';

-- Resume
UPDATE send_policies SET paused = false WHERE sender_email = 'sender@domain.com';
```

## Testing

### 1. Health Check (should be green by default)
```bash
curl "http://localhost:3000/api/send-safety/health?sender_email=test@domain.com" | jq
```

### 2. Test Cap Enforcement
```bash
# Send 30 requests (cap is 25 by default)
for i in $(seq 1 30); do
  curl -X POST http://localhost:3000/api/send-safety/check-and-log \
    -H "Content-Type: application/json" \
    -d "{\"sender_email\":\"test@domain.com\",\"recipient_email\":\"lead$i@example.com\"}" \
    | jq '.allowed, .sends_today, .cap'
done
# Expected: first 25 return true, next 5 return false with reason "daily_cap_reached"
```

### 3. Simulate Hard Bounce
```bash
curl -X POST http://localhost:3000/api/webhooks/email \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "test",
    "events": [
      {
        "type": "bounce_hard",
        "sender_email": "test@domain.com",
        "recipient_email": "invalid@example.com",
        "reason": "user unknown"
      }
    ]
  }' | jq
```

### 4. Check Health After Bounce
```bash
curl "http://localhost:3000/api/send-safety/health?sender_email=test@domain.com" | jq
# If hard_bounces/sends exceeds 3%, health_color changes to "yellow" or "red"
```

## Monitoring

### Daily Stats Query
```sql
SELECT 
  sender_email,
  day,
  sends,
  delivered,
  hard_bounces,
  soft_bounces,
  complaints,
  CASE 
    WHEN sends > 0 THEN round((hard_bounces::numeric / sends * 100), 2)
    ELSE 0 
  END as hard_bounce_pct
FROM sender_stats_daily
WHERE day >= current_date - 7
ORDER BY day DESC, sender_email;
```

### Health Dashboard Query
```sql
SELECT 
  sender_email,
  health_color,
  sends_today,
  hard_bounces_today,
  soft_bounces_today,
  complaints_today,
  paused
FROM sender_health_today
ORDER BY 
  CASE health_color 
    WHEN 'red' THEN 1 
    WHEN 'yellow' THEN 2 
    ELSE 3 
  END,
  sender_email;
```

### Bounce Events Investigation
```sql
SELECT 
  sender_email,
  recipient_email,
  kind,
  reason,
  provider,
  occurred_at
FROM bounce_events
WHERE sender_email = 'you@domain.com'
  AND day >= current_date - 3
ORDER BY occurred_at DESC
LIMIT 50;
```

## Troubleshooting

### Sender stuck in RED
1. Check bounce rate: `SELECT * FROM sender_health_today WHERE sender_email = 'x@domain.com'`
2. Investigate bounces: See "Bounce Events Investigation" query above
3. Fix underlying issue (bad list, domain reputation, SPF/DKIM)
4. Reset daily stats or wait for next day (stats are per-day)
5. If persistent, manually pause and investigate: `UPDATE send_policies SET paused = true ...`

### Cap not increasing
- Verify `warmup_start_date` is set correctly
- Check calculation in view or API response
- Ensure date math accounts for timezones (uses UTC)

### Webhook events not recording
- Verify service role key is correct
- Check Supabase logs for RLS policy issues
- Confirm payload matches expected schema
- Test with curl directly to `/api/webhooks/email`

## Why This Matters

**Deliverability = Revenue**
- A 5% bounce rate can get your domain blacklisted
- Warming too fast triggers spam filters
- One bad campaign can tank your sending reputation for weeks

**This system:**
- ✅ Prevents catastrophic domain damage
- ✅ Automates safe warmup (no manual tracking)
- ✅ Provides instant visibility into sender health
- ✅ Blocks sends before they hurt your reputation

## Next Steps

1. **Run the migration** in Supabase SQL Editor
2. **Add the badge** to your campaign composer UI
3. **Integrate the guard** into your send loop/worker
4. **Connect webhooks** from your email provider
5. **Monitor health** dashboard daily

Your sending reputation is now protected! 🛡️

# Send Safety Implementation

This document describes the automated send safety system that protects your email reputation through daily caps, bounce rate monitoring, and automatic ramping.

## Overview

The send safety system provides:
- **Auto-ramping**: Gradually increase sending volume day by day
- **Bounce protection**: Automatically pause sending when bounce rates spike
- **Daily caps**: Prevent sending too many emails in a single day
- **Real-time monitoring**: Dashboard to view sender health and alerts

## Files Created

### Database Migrations
- `supabase/migrations/20251018_send_safety.sql` - Creates senders and sender_alerts tables with health view
- `supabase/migrations/20251018_messages_patch.sql` - Adds required columns to messages table

### API Routes
- `src/app/api/safety/check-send/route.ts` - Guard endpoint to check before sending each email
- `src/app/api/safety/alerts/route.ts` - Fetch recent sender alerts
- `src/app/api/safety/senders/route.ts` - Get and update sender configurations

### UI
- `src/app/safety/page.tsx` - Dashboard to monitor sender health and manage settings
- `src/app/api/send/route.ts` - Example send route with safety guard integration

## Database Schema

### `senders` table
Stores per-sender configuration and counters:
- `email` - Sender email address (unique)
- `daily_cap` - Current daily sending limit
- `ramp_step` - How much to increase cap per day
- `max_daily_cap` - Maximum cap ceiling
- `max_bounce_pct` - Pause threshold (e.g., 3%)
- `bounce_window_days` - Rolling window for bounce calc (e.g., 7 days)
- `today_count` - How many sent today
- `today_date` - Date for counter reset
- `status` - 'active', 'paused_bounce', or 'paused_manual'

### `sender_alerts` table
Operator-facing alerts:
- `sender_id` - Reference to sender
- `level` - 'info', 'warning', or 'error'
- `code` - Alert code (e.g., 'BOUNCE_SPIKE', 'DAILY_CAP_REACHED')
- `message` - Human-readable message
- `meta` - Additional JSON metadata

### `v_sender_health` view
Combines sender config with computed metrics:
- All sender fields
- `sends_7d` - Emails sent in last 7 days
- `bounces_7d` - Bounces in last 7 days
- `bounce_rate_7d` - Computed bounce percentage

## How It Works

### 1. Safety Guard Flow

Every send request must call `/api/safety/check-send` first:

```typescript
// Before sending
const guardRes = await fetch('/api/safety/check-send', {
  method: 'POST',
  body: JSON.stringify({ senderEmail: 'sender@example.com' })
});
const guard = await guardRes.json();

if (!guard.allowed) {
  // Blocked - handle appropriately
  console.log(`Send blocked: ${guard.reason}`);
  return;
}

// Proceed with sending
```

### 2. Auto-Ramping

On the first check each day:
1. Resets `today_count` to 0
2. Increases `daily_cap` by `ramp_step` (up to `max_daily_cap`)
3. This allows gradual volume increase to warm up domains

Example:
- Day 1: Send 50 emails
- Day 2: Cap increases to 75
- Day 3: Cap increases to 100
- Continues until reaching `max_daily_cap`

### 3. Bounce Protection

On each check:
1. Computes 7-day bounce rate from `v_sender_health` view
2. If bounce rate ≥ `max_bounce_pct`, sets status to `paused_bounce`
3. Creates an ERROR alert
4. All subsequent sends are blocked until manually resumed

### 4. Daily Cap Enforcement

When `today_count >= daily_cap`:
1. Returns `allowed: false`
2. Creates a WARNING alert
3. Blocks sends until next day

## Setup Instructions

### 1. Apply Migrations

```bash
# Apply the migrations
supabase db push

# Or if using direct connection
psql "$SUPABASE_DB_URL" -f supabase/migrations/20251018_send_safety.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/20251018_messages_patch.sql
```

### 2. Environment Variables

Add to `.env.local`:

```bash
NEXT_PUBLIC_BASE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3. Optional: Seed Test Sender

```sql
INSERT INTO public.senders (email, daily_cap, ramp_step, max_daily_cap, max_bounce_pct)
VALUES ('outbound@example.com', 25, 25, 200, 3)
ON CONFLICT (email) DO NOTHING;
```

## Testing

### Test 1: Basic Guard Check

```bash
curl -X POST http://localhost:3000/api/safety/check-send \
  -H "Content-Type: application/json" \
  -d '{"senderEmail":"outbound@example.com"}' | jq

# Expected: { "allowed": true, "remainingToday": 24, "dailyCap": 25 }
```

### Test 2: Daily Cap Reached

```bash
# Send 25 emails to reach cap
for i in {1..25}; do
  curl -s -X POST http://localhost:3000/api/send \
    -H "Content-Type: application/json" \
    -d '{"senderEmail":"outbound@example.com","to":"test@ex.com","subject":"Test","text":"hi"}' > /dev/null
done

# Try one more - should be blocked
curl -X POST http://localhost:3000/api/send \
  -H "Content-Type: application/json" \
  -d '{"senderEmail":"outbound@example.com","to":"test@ex.com","subject":"Test","text":"hi"}' | jq

# Expected: { "success": false, "error": "Send blocked: daily_cap_reached" }
```

### Test 3: Bounce Rate Spike

```sql
-- Mark 10 recent messages as bounced
UPDATE public.messages
SET bounce = true
WHERE id IN (
  SELECT id FROM public.messages
  WHERE email_from = 'outbound@example.com'
  ORDER BY created_at DESC
  LIMIT 10
);
```

```bash
# Next check should auto-pause
curl -X POST http://localhost:3000/api/safety/check-send \
  -H "Content-Type: application/json" \
  -d '{"senderEmail":"outbound@example.com"}' | jq

# Expected: { "allowed": false, "reason": "sender is paused_bounce" }
```

### Test 4: View Dashboard

Navigate to: `http://localhost:3000/safety`

You should see:
- Sender table with status, caps, and bounce rates
- Pause/Resume and Cap adjustment buttons
- Recent alerts table showing all safety events

## Integration

### Integrate into Existing Send Flow

Update your existing send logic to call the guard:

```typescript
// In your existing send function
export async function sendEmail(from: string, to: string, subject: string, body: string) {
  // 1. Check safety first
  const guardRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/safety/check-send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ senderEmail: from }),
  });
  
  const guard = await guardRes.json();
  if (!guard.allowed) {
    throw new Error(`Send blocked: ${guard.reason}`);
  }

  // 2. Proceed with actual sending
  const result = await yourMailTransport.send({ from, to, subject, body });

  // 3. Log to messages table
  await supabase.from('messages').insert({
    email_from: from,
    email_to: to,
    subject,
    body_text: body,
    direction: 'outbound',
    bounce: false,
    created_at: new Date().toISOString()
  });

  return result;
}
```

## Acceptance Criteria

✅ **Daily Cap Enforcement**
- Guard blocks sends when `today_count >= daily_cap`
- Creates `DAILY_CAP_REACHED` alert

✅ **Bounce Protection**
- Auto-pauses when 7-day bounce rate ≥ threshold
- Creates `BOUNCE_SPIKE` alert

✅ **Auto-Ramping**
- Resets counter on new day
- Increases cap by `ramp_step` up to `max_daily_cap`

✅ **Monitoring Dashboard**
- Shows live sender status and metrics
- Displays 7-day bounce rate calculation
- Lists recent alerts
- Allows manual pause/resume and cap adjustments

## Next Steps

1. **Bounce Webhook**: Integrate with your email provider's bounce webhook to mark `messages.bounce = true`
2. **Multi-tenant**: Add workspace/org filtering to RLS policies
3. **Notifications**: Alert operators via Slack/email when senders are auto-paused
4. **Advanced Ramping**: Implement more sophisticated warm-up schedules
5. **Historical Analytics**: Track sender health trends over time

## Troubleshooting

### Sender not found
The system auto-provisions senders on first check. If you see "Failed to load sender health", check that:
- Migrations have been applied
- `v_sender_health` view exists
- `messages` table has required columns

### Bounce rate not updating
Ensure:
- `messages` table has `email_from`, `direction`, `bounce`, and `created_at` columns
- Bounces are being marked via webhook handler
- `v_sender_health` view is querying correct columns

### Guard always allows
Check that:
- `today_date` matches current date format (YYYY-MM-DD)
- `today_count` is incrementing properly
- Time zones are consistent

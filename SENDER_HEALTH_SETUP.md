# Sender Health & Deliverability System

This system implements warmup throttling, bounce tracking, and health scores to protect SmartSend deliverability.

## 🗄️ Database Changes

### Migration: `20250202000000_sender_health_deliverability.sql`

**Enhanced `sender_profiles` table:**
- `team_id` - Links sender to team (optional)
- `warmup_stage` - Current warmup stage (1-10)
- `bounce_rate` - Calculated bounce rate (0-1)
- `complaints` - Number of complaints
- `health_score` - Health score (10-100)
- `daily_limit` - Dynamic daily sending limit (starts at 25 for new senders)

**New `bounce_logs` table:**
- Tracks all bounces per sender
- Links to campaigns and leads
- Supports soft/hard bounce types

**Enhanced `send_queue` table:**
- `sender_id` - Links queue item to sender profile for throttling

### Migration: `20250202000001_sender_throttled_queue.sql`

**Updated `claim_due_queue()` function:**
- Now respects sender daily limits
- Throttles per sender automatically
- Falls back to legacy items without sender_id

## 🔧 Edge Functions

### `bounce-hook` (`supabase/functions/bounce-hook/index.ts`)
Webhook endpoint to receive bounce notifications.

**Usage:**
```bash
POST /functions/v1/bounce-hook
Headers: x-ss-secret: <BOUNCE_SECRET>
Body: {
  "senderEmail": "sender@example.com",
  "leadId": "uuid",
  "campaignId": "uuid",
  "reason": "Mailbox full",
  "type": "soft" | "hard"
}
```

**Deploy:**
```bash
supabase functions deploy bounce-hook --no-verify-jwt
supabase secrets set BOUNCE_SECRET=your_secret_here
```

### `warmup-daily` (`supabase/functions/warmup-daily/index.ts`)
Cron function to increment warmup daily limits.

**Schedule:** Run daily (e.g., via Supabase Cron)

**Usage:**
```bash
POST /functions/v1/warmup-daily
Headers: x-ss-secret: <WARMUP_SECRET>
```

**Deploy:**
```bash
supabase functions deploy warmup-daily --no-verify-jwt
supabase secrets set WARMUP_SECRET=your_secret_here
```

### `auto-suspend-bad` (`supabase/functions/auto-suspend-bad/index.ts`)
Cron function to throttle bad senders (health < 40).

**Schedule:** Run daily

**Usage:**
```bash
POST /functions/v1/auto-suspend-bad
Headers: x-ss-secret: <SUSPEND_SECRET>
```

**Deploy:**
```bash
supabase functions deploy auto-suspend-bad --no-verify-jwt
supabase secrets set SUSPEND_SECRET=your_secret_here
```

## 📊 Health Score Calculation

Health score is calculated based on bounce rate over last 7 days:

```
health_score = max(10, round(100 - (bounce_rate * 400)))
```

- **100:** No bounces
- **80-99:** Good (1-5% bounce rate)
- **50-79:** Warning (5-15% bounce rate)
- **10-49:** Critical (15%+ bounce rate)

## 🚀 Warmup Process

1. **New senders:** Start at 25 emails/day, stage 1
2. **Daily increment:** If health ≥ 70, increase by 25/day up to 200
3. **Auto-suspend:** If health < 40, reduce limit by 25 (min 10)

## 🎨 UI

**Sender Health Page:** `/app/settings/senders/page.tsx`

Shows:
- Email address
- Bounce rate percentage
- Daily limit
- Health score (color-coded)
- Warmup stage
- Warnings for low health or high bounce rate

## 🔗 Integration Points

### Campaign Launch
Updated `src/app/(dashboard)/campaigns/[id]/launch/actions.ts` to populate `sender_id` from `campaign.sender_profile_id`.

### Send Queue Processing
The `claim_due_queue()` RPC function automatically throttles based on sender daily limits.

## 📝 Setup Instructions

1. **Run migrations:**
   ```bash
   supabase migration up
   ```

2. **Deploy edge functions:**
   ```bash
   supabase functions deploy bounce-hook --no-verify-jwt
   supabase functions deploy warmup-daily --no-verify-jwt
   supabase functions deploy auto-suspend-bad --no-verify-jwt
   ```

3. **Set secrets:**
   ```bash
   supabase secrets set \
     BOUNCE_SECRET=... \
     WARMUP_SECRET=... \
     SUSPEND_SECRET=...
   ```

4. **Configure cron jobs** (in Supabase Dashboard):
   - Daily warmup: `0 0 * * *` → `warmup-daily`
   - Daily auto-suspend: `0 1 * * *` → `auto-suspend-bad`

## 🧪 Testing

1. Connect new Gmail → should create sender_profile with daily_limit=25
2. Launch small campaign → verify only 25 emails sent (if single sender)
3. Manually trigger bounce-hook → verify bounce logged and health drops
4. Check Sender Health page → verify score updates
5. Next day → verify daily limit increases if health > 70

## ⚠️ Notes

- New senders automatically start at 25/day (warmup)
- Health < 40 triggers automatic throttling
- Bounce rate calculated over last 7 days
- Complaints field added for future spam tracking
- Team_id added for team-level sender management







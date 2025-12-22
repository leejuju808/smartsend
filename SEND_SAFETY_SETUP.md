# Send Safety System - Setup Guide

This implementation provides a comprehensive email sending safety system with warmup, bounce tracking, suppression lists, and rate limiting.

## 🗄️ Database Setup

### 1. Run the Migration

```bash
# Using Supabase CLI
supabase db push

# Or apply the migration file directly in Supabase SQL Editor:
# Open: /supabase/migrations/20251008_send_safety.sql
```

This creates:
- `senders` - Email sender configurations with warmup settings
- `sender_stats` - Daily statistics (sent/bounced counts)
- `bounces` - Bounce record tracking
- `suppressions` - Suppression list for blocked emails
- `messages` - Queued/sent message log
- RLS policies for all tables
- Helper function: `get_warmed_daily_cap(sender_id)`

### 2. Seed Test Data

Replace `YOUR_PROFILE_ID` with your actual profile UUID from the `profiles` table.

```sql
-- Create a sender (in Supabase SQL Editor)
insert into public.senders (profile_id, from_email, provider, status, base_daily_limit, target_daily_limit, hourly_limit, warmup_increment)
values ('YOUR_PROFILE_ID', 'you@yourdomain.com', 'smtp', 'warming', 20, 200, 30, 10);

-- Add test suppression
insert into public.suppressions (profile_id, email, reason)
values ('YOUR_PROFILE_ID', 'blocked@example.com', 'test_suppress');

-- Add test bounce
insert into public.bounces (profile_id, email, reason)
values ('YOUR_PROFILE_ID', 'bounced@example.com', 'hard_bounce');
```

## 🔑 Environment Variables

Ensure these are set in `.env.local` or Vercel:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## 🚀 API Endpoints

### POST `/api/send/guard`

Pre-validates recipients before sending. Checks suppressions, bounces, and quota limits.

**Request:**
```json
{
  "profile_id": "uuid",
  "sender_id": "uuid",
  "recipients": [
    { "email": "user1@example.com" },
    { "email": "user2@example.com" }
  ]
}
```

**Response:**
```json
{
  "allowed": [{ "email": "user1@example.com" }],
  "blocked": [{ "email": "user2@example.com" }],
  "limits": {
    "hourly_limit": 30,
    "warmed_daily_cap": 50,
    "hour_used": 10,
    "day_used": 25
  }
}
```

### POST `/api/send/enqueue`

Queues approved messages for sending.

**Request:**
```json
{
  "profile_id": "uuid",
  "sender_id": "uuid",
  "messages": [
    {
      "to_email": "user@example.com",
      "subject": "Hello",
      "body": "Message content..."
    }
  ]
}
```

**Response:**
```json
{
  "queued": 1
}
```

### POST `/api/webhooks/bounce`

Records bounces (connect to your email provider's webhook).

**Request:**
```json
{
  "profile_id": "uuid",
  "sender_id": "uuid",
  "to_email": "bounced@example.com",
  "reason": "hard_bounce",
  "message_id": "optional-uuid"
}
```

### GET `/api/safety/snapshot?profile_id=uuid`

Fetches current safety metrics for the dashboard.

**Response:**
```json
{
  "sender": {
    "id": "uuid",
    "from_email": "you@example.com",
    "status": "warming",
    "hourly_limit": 30,
    "base_daily_limit": 20,
    "target_daily_limit": 200,
    "warmup_increment": 10,
    "created_at": "2025-10-08T..."
  },
  "snapshot": {
    "hourly_limit": 30,
    "warmed_daily_cap": 50,
    "hour_used": 5,
    "day_used": 25,
    "bounce_rate": 0.02
  }
}
```

## 🖥️ Dashboard Pages

### Send Safety Dashboard
**URL:** `/send-safety`

Displays:
- Current sender status (active/warming/paused)
- Hourly quota remaining
- Daily quota remaining (with warmup progression)
- Bounce rate risk level

### Send Demo Page
**URL:** `/send-demo`

Interactive demo that:
1. Calls `/api/send/guard` to validate recipients
2. Shows allowed vs blocked emails
3. Calls `/api/send/enqueue` to queue approved messages
4. Displays real-time log output

## 🧪 Testing the Flow

### 1. Start Development Server

```bash
pnpm dev
```

### 2. Update Demo Page IDs

Edit `/src/app/(dashboard)/send-demo/page.tsx`:

```typescript
const profile_id = 'YOUR_ACTUAL_PROFILE_ID'
const sender_id = 'YOUR_ACTUAL_SENDER_ID'
```

### 3. Test Send Flow

1. Visit: `http://localhost:3000/send-demo`
2. Click "Run Send Flow"
3. Observe:
   - Suppressed/bounced emails blocked
   - Quota limits enforced
   - Messages queued successfully

### 4. Test Bounce Webhook

```bash
curl -X POST http://localhost:3000/api/webhooks/bounce \
  -H "Content-Type: application/json" \
  -d '{
    "profile_id":"YOUR_PROFILE_ID",
    "sender_id":"YOUR_SENDER_ID",
    "to_email":"test@example.com",
    "reason":"hard_bounce"
  }'
```

### 5. View Safety Dashboard

Visit: `http://localhost:3000/send-safety`

Update the `profileId` in the page to match your profile UUID.

## 📊 How Warmup Works

The system implements email warmup to protect sender reputation:

1. **Day 0:** Sender created with `base_daily_limit = 20`
2. **Each Day:** Daily cap increases by `warmup_increment = 10`
3. **Target:** Stops increasing at `target_daily_limit = 200`

Example progression:
- Day 0: 20 emails/day
- Day 1: 30 emails/day
- Day 2: 40 emails/day
- ...
- Day 18: 200 emails/day (target reached)

The `get_warmed_daily_cap()` function calculates this automatically.

## 🛡️ Safety Features

### 1. **Suppression List**
- Blocks emails in `suppressions` table
- Respects user opt-outs
- Prevents compliance issues

### 2. **Bounce Tracking**
- Records hard/soft bounces
- Auto-blocks previously bounced emails
- Tracks bounce rate (last 200 messages)

### 3. **Rate Limiting**
- **Hourly:** Rolling 60-minute window
- **Daily:** Warmed cap (increases daily)
- Enforced before queuing

### 4. **Risk Alerts**
Bounce rate thresholds:
- **Healthy:** < 5%
- **Elevated:** 5-8%
- **High:** > 8%

Dashboard shows recommendations when risk is elevated.

## 🔄 Integration with Existing Send Flow

To integrate with your existing email sending:

1. **Before sending**, call `/api/send/guard`:
```typescript
const guardRes = await fetch('/api/send/guard', {
  method: 'POST',
  body: JSON.stringify({ profile_id, sender_id, recipients })
})
const { allowed, blocked } = await guardRes.json()
```

2. **Queue approved messages**:
```typescript
await fetch('/api/send/enqueue', {
  method: 'POST',
  body: JSON.stringify({
    profile_id,
    sender_id,
    messages: allowed.map(r => ({
      to_email: r.email,
      subject: '...',
      body: '...'
    }))
  })
})
```

3. **Process queue** (separate worker/cron):
   - Fetch messages with `status='queued'`
   - Send via your provider (SMTP/Resend/SES)
   - Update `status='sent'` or `'failed'`

4. **Connect bounce webhook**:
   - Configure your provider to call `/api/webhooks/bounce`
   - Provides `profile_id`, `sender_id`, `to_email`, `reason`

## 📈 Acceptance Criteria

- ✅ Guard blocks recipients in suppressions or bounces
- ✅ Guard enforces hourly and warmed daily caps
- ✅ Enqueue inserts messages with `status='queued'`
- ✅ Enqueue increments `sender_stats.sent_count` for today
- ✅ Dashboard shows sender status, quotas, bounce rate
- ✅ Webhook adds to bounces and updates message status

## 🎯 What This Unlocks

- **Fewer bounces** → Better deliverability
- **Warmup protection** → Preserved domain health
- **Visible limits** → Stay inside safe quotas
- **More replies** → More meetings booked

---

**Next Steps:**
1. Apply the migration
2. Create a sender for your profile
3. Update the demo page with your IDs
4. Test the flow end-to-end
5. Integrate with your existing send pipeline

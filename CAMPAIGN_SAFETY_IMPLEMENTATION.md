# Campaign Safety & Webhook Implementation

## 📦 Implementation Summary

This implementation provides a complete email safety system with:

1. **Webhook signature verification** for SendGrid, Mailgun, and SES
2. **Automatic suppression** on bounces and complaints
3. **Per-campaign caps, health monitoring, and auto-pause**
4. **Sender + Campaign dual-guard system**
5. **Real-time alerts and UI dashboards**

---

## 🆕 New Files Created

### API Routes

1. **`/src/app/api/webhooks/bounce/route.ts`**
   - Unified bounce & complaint webhook handler
   - Signature verification for SendGrid (Ed25519), Mailgun (HMAC-SHA256), SES (SNS header check)
   - Auto-suppresses recipients
   - Marks messages as bounced/complained
   - Fanout alerts to sender and campaign

2. **`/src/app/api/safety/check-campaign/route.ts`**
   - Per-campaign send guard
   - Daily cap enforcement with auto-reset
   - Automatic ramping (increments daily_cap by ramp_step)
   - Bounce/complaint rate monitoring (auto-pauses on threshold breach)
   - Reserves send slot (increments today_count)

3. **`/src/app/api/safety/campaigns/route.ts`**
   - GET: List all campaigns with health metrics
   - PATCH: Update campaign settings (status, caps, thresholds)

4. **`/src/app/api/safety/campaign-alerts/route.ts`**
   - GET: Retrieve recent campaign alerts

### Database Migration

5. **`/supabase/migrations/20251018_campaign_safety.sql`**
   - `campaigns` table with safety settings
   - `campaign_alerts` table
   - `v_campaign_health` view (7-day bounce/complaint rates)
   - Adds `campaign_id`, `complaint`, `complained_at` to `messages` table
   - RLS policies

### UI

6. **`/src/app/campaign-safety/page.tsx`**
   - Campaign safety dashboard
   - View all campaigns with health metrics
   - Pause/resume campaigns
   - Adjust daily caps
   - View recent alerts

### Updated Files

7. **`/src/app/api/send/route.ts`** (updated)
   - Now checks both sender guard AND campaign guard (if campaignId provided)
   - Logs campaign_id and complaint fields

---

## 🔐 Environment Variables

Add these to your `.env.local`:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Base URL for internal API calls
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# Webhook Signature Verification (optional)
SENDGRID_PUBLIC_KEY=                    # Base64 SPKI public key (Ed25519)
MAILGUN_SIGNING_KEY=                    # key-XXXXXXXXXXXXXXXXXXXXX
AWS_SNS_VERIFY=false                    # Set true to enforce SNS header check
```

**Note:** If signature keys are not set, verification is bypassed for that provider.

---

## 🚀 Setup & Run

### 1. Apply Database Migration

```bash
# Using Supabase CLI
supabase db push

# Or apply manually via psql
psql "$SUPABASE_DB_URL" -f supabase/migrations/20251018_campaign_safety.sql
```

### 2. Seed Test Data (Optional)

```bash
psql "$SUPABASE_DB_URL" -c "
insert into public.campaigns (id,name,status,daily_cap,ramp_step,max_daily_cap,max_bounce_pct,max_complaint_pct)
values ('11111111-1111-1111-1111-111111111111','Warm SMB Trial Outreach','running',100,50,500,3,0.2)
on conflict do nothing;

insert into public.senders (email, daily_cap, ramp_step, max_daily_cap, max_bounce_pct)
values ('outbound@example.com', 25, 25, 200, 3)
on conflict (email) do nothing;
"
```

### 3. Start Development Server

```bash
npm run dev
```

---

## 🧪 Testing & Verification

### A) Test Send Flow (Dual Guards)

```bash
# Send emails with both sender and campaign guards
for i in {1..5}; do
  curl -s -X POST http://localhost:3000/api/send \
    -H "Content-Type: application/json" \
    -d '{
      "senderEmail": "outbound@example.com",
      "campaignId": "11111111-1111-1111-1111-111111111111",
      "to": "test@example.com",
      "subject": "Test Email",
      "text": "Hello world"
    }' | jq
done
```

**Expected:** Each send returns `{ "success": true, "guard": { "sender": {...}, "campaign": {...} } }`

---

### B) Test Webhook Handlers

#### SendGrid Bounce

```bash
curl -s -X POST http://localhost:3000/api/webhooks/bounce \
  -H "Content-Type: application/json" \
  -H "User-Agent: SendGrid" \
  -d '[
    {
      "email": "bounced@example.com",
      "event": "bounce",
      "reason": "550 5.1.1 user unknown",
      "sg_message_id": "stub-1234"
    }
  ]' | jq
```

**Expected:** `{ "success": true, "processed": 1 }`

#### Mailgun Complaint

```bash
curl -s -X POST http://localhost:3000/api/webhooks/bounce \
  -H "Content-Type: application/json" \
  -d '{
    "signature": {
      "timestamp": "123",
      "token": "abc",
      "signature": "bogus"
    },
    "event-data": {
      "event": "complained",
      "recipient": "complaint@example.com",
      "message": {
        "headers": {
          "message-id": "<mg-123@domain>"
        }
      }
    }
  }' | jq
```

**Note:** If `MAILGUN_SIGNING_KEY` is set, you'll need a valid signature.

#### SES Bounce

```bash
curl -s -X POST http://localhost:3000/api/webhooks/bounce \
  -H "Content-Type: application/json" \
  -H "X-Amz-Sns-Message-Type: Notification" \
  -d '{
    "notificationType": "Bounce",
    "mail": {
      "messageId": "ses-123"
    },
    "bounce": {
      "bounceType": "Permanent",
      "bounceSubType": "General",
      "bouncedRecipients": [
        {
          "emailAddress": "sesbounce@example.com"
        }
      ]
    }
  }' | jq
```

---

### C) Verify Database Side Effects

```bash
# Check suppressions were created
curl -s http://localhost:3000/api/suppressions/list | jq

# Check sender alerts
psql "$SUPABASE_DB_URL" -c "select * from sender_alerts order by created_at desc limit 5;"

# Check campaign alerts
psql "$SUPABASE_DB_URL" -c "select * from campaign_alerts order by created_at desc limit 5;"

# Check messages marked as bounced/complained
psql "$SUPABASE_DB_URL" -c "select id, email_to, bounce, complaint from messages where bounce or complaint;"
```

---

### D) Test Campaign Auto-Pause

1. Seed enough messages to exceed bounce threshold:

```bash
# Create 100 sends
for i in {1..100}; do
  psql "$SUPABASE_DB_URL" -c "
    insert into messages (email_from, email_to, direction, campaign_id, created_at)
    values ('outbound@example.com', 'test$i@example.com', 'outbound', '11111111-1111-1111-1111-111111111111', now());
  "
done

# Mark 4% as bounced (exceeds 3% threshold)
psql "$SUPABASE_DB_URL" -c "
  update messages set bounce = true, bounced_at = now()
  where campaign_id = '11111111-1111-1111-1111-111111111111'
  limit 4;
"

# Try to send - should be blocked
curl -s -X POST http://localhost:3000/api/safety/check-campaign \
  -H "Content-Type: application/json" \
  -d '{"campaignId":"11111111-1111-1111-1111-111111111111"}' | jq
```

**Expected:** `{ "allowed": false, "reason": "campaign_paused_bounce" }`

---

### E) UI Verification

Open these pages in your browser:

1. **Campaign Safety Dashboard**  
   http://localhost:3000/campaign-safety
   
   - View all campaigns with health metrics
   - Pause/resume campaigns
   - Adjust daily caps
   - View recent alerts

2. **Sender Safety Dashboard** (existing)  
   http://localhost:3000/safety

3. **Suppressions List** (existing)  
   http://localhost:3000/suppressions

---

## ✅ Acceptance Criteria

### Webhook Processing

- ✅ Bounces and complaints create `suppressions` entries
- ✅ Messages are marked with `bounce=true` or `complaint=true` + timestamps
- ✅ Alerts appear in `sender_alerts` and `campaign_alerts` tables
- ✅ `webhook_events` table logs raw payloads for debugging

### Signature Verification

- ✅ SendGrid: Rejects if `SENDGRID_PUBLIC_KEY` set and signature invalid (401)
- ✅ Mailgun: Rejects if `MAILGUN_SIGNING_KEY` set and HMAC invalid (401)
- ✅ SES: Rejects if `AWS_SNS_VERIFY=true` and header missing (401)

### Campaign Guards

- ✅ `/api/send` checks both sender + campaign guards
- ✅ Daily cap enforced (resets at midnight, ramps by `ramp_step`)
- ✅ Auto-pauses campaign if bounce rate ≥ `max_bounce_pct`
- ✅ Auto-pauses campaign if complaint rate ≥ `max_complaint_pct`
- ✅ Alerts created for `DAILY_CAP_REACHED`, `BOUNCE_SPIKE`, `COMPLAINT_SPIKE`

### UI

- ✅ Campaign dashboard shows real-time health metrics (7d bounce/complaint rates)
- ✅ Operators can pause/resume campaigns
- ✅ Operators can adjust daily caps
- ✅ Alert feed shows recent events with codes and messages

---

## 🔄 Daily Operations

### Typical Workflow

1. **Morning**: Check campaign-safety dashboard for overnight alerts
2. **If auto-paused**: Review bounce/complaint rates, fix sender reputation, resume manually
3. **Ramp new campaigns**: Start with low `daily_cap` (e.g., 50), let system auto-ramp over days
4. **Monitor alerts**: Set up notifications for `error` level alerts

### Alert Codes Reference

| Code | Level | Meaning |
|------|-------|---------|
| `BOUNCE_EVENT` | warning | Single bounce received |
| `COMPLAINT_EVENT` | warning | Single complaint received |
| `DAILY_CAP_REACHED` | warning | Campaign hit daily send limit |
| `BOUNCE_SPIKE` | error | 7d bounce rate ≥ threshold (auto-pause) |
| `COMPLAINT_SPIKE` | error | 7d complaint rate ≥ threshold (auto-pause) |

---

## 🛠️ Customization

### Adjust Thresholds

Edit campaign settings via UI or API:

```bash
curl -X PATCH http://localhost:3000/api/safety/campaigns \
  -H "Content-Type: application/json" \
  -d '{
    "campaignId": "11111111-1111-1111-1111-111111111111",
    "patch": {
      "max_bounce_pct": 5,
      "max_complaint_pct": 0.5,
      "max_daily_cap": 2000
    }
  }'
```

### Add Custom Alert Logic

Extend `/src/app/api/webhooks/bounce/route.ts`:

```typescript
// After processing events, add custom logic:
if (bounceRate > 10) {
  // Send Slack notification
  await notifySlack(`Critical: ${campaign.name} has 10%+ bounce rate!`);
}
```

---

## 📊 Schema Reference

### campaigns

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `name` | text | Campaign name |
| `status` | text | draft \| running \| paused \| completed |
| `daily_cap` | int | Current daily send limit |
| `ramp_step` | int | Daily cap increment per day |
| `max_daily_cap` | int | Maximum daily cap |
| `max_bounce_pct` | numeric | Auto-pause if bounce rate ≥ this |
| `max_complaint_pct` | numeric | Auto-pause if complaint rate ≥ this |
| `today_count` | int | Sends today (resets daily) |
| `today_date` | date | Last reset date |

### campaign_alerts

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `campaign_id` | uuid | FK to campaigns |
| `level` | text | info \| warning \| error |
| `code` | text | Alert code (e.g., BOUNCE_SPIKE) |
| `message` | text | Human-readable message |
| `meta` | jsonb | Additional context |
| `created_at` | timestamptz | When alert fired |
| `acknowledged_at` | timestamptz | When operator acknowledged |

### v_campaign_health (view)

Aggregates 7-day stats per campaign:

- `sends_7d`, `bounces_7d`, `complaints_7d`
- `bounce_rate_7d`, `complaint_rate_7d`

---

## 🐛 Troubleshooting

### Signatures Failing?

- **SendGrid**: Ensure `SENDGRID_PUBLIC_KEY` is base64-encoded SPKI format
- **Mailgun**: Verify `MAILGUN_SIGNING_KEY` matches your domain's signing key
- **SES**: Set `AWS_SNS_VERIFY=false` unless you implement full X509 verification

### Campaign Not Auto-Pausing?

- Check `v_campaign_health` view for actual rates
- Verify `window_days=7` and sufficient message history exists
- Ensure messages have `direction='outbound'` and `campaign_id` set

### Daily Cap Not Resetting?

- Check `today_date` in campaigns table
- Verify server timezone matches expected date rollover
- Call `/api/safety/check-campaign` to trigger reset logic

---

## 📚 Related Files

- **Existing sender safety**: `/src/app/api/safety/check-send/route.ts`
- **Suppressions**: `/src/app/api/suppression/route.ts`
- **Sender alerts**: `/src/app/safety/page.tsx`
- **Messages schema**: `supabase/migrations/*_messages.sql`

---

## 🎯 Next Steps

1. **Production Webhooks**: Configure SendGrid/Mailgun/SES to POST to your public endpoint
2. **Monitoring**: Set up alerts for `error` level campaign_alerts (Slack, PagerDuty, etc.)
3. **Analytics**: Build trends dashboard showing bounce/complaint rates over time
4. **Automation**: Create cron job to auto-resume campaigns after N days if rates recover

---

**Implementation complete!** All files created, guards integrated, and ready for testing. 🚀

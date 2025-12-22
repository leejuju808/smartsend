# Block 23690 — SmartSend Roofing Payment Recovery + Failed Billing Engine v1

## Implementation Summary

Complete billing recovery system that protects SmartSend's MRR and prevents accidental churn from failed payments. This system treats failed payments as mission-critical events and uses a 3-phase recovery approach optimized for roofers.

## What Was Implemented

### 1. Database Schema (`supabase/migrations/20250130000001_block23690_billing_recovery_system.sql`)

**Tables Created:**
- `billing_recovery_states` - Tracks recovery state for each subscription/workspace
- `billing_recovery_events` - Logs all recovery actions (emails, SMS, calls)
- `billing_update_links` - Secure, time-limited links for updating payment methods
- `pre_bill_reminders` - Tracks pre-bill reminders sent before renewal

**Key Features:**
- Recovery phase tracking (`none`, `prevent`, `recover`, `win_back`)
- Recovery stage tracking (0-5 for recover, 1-3 for win-back)
- Send queue locking when billing fails
- Churn prediction score tracking
- Engagement score tracking

**Database Functions:**
- `create_or_update_recovery_state()` - Creates or updates recovery state
- `log_recovery_event()` - Logs recovery actions
- `create_billing_update_link()` - Creates secure update links
- `get_recovery_stats()` - Calculates engagement/churn scores

### 2. Recovery Service (`src/lib/billing/recovery-service.ts`)

**Phase 1 — PREVENT:**
- `sendPreBillReminder()` - Sends email 3 days before renewal

**Phase 2 — RECOVER:**
- `sendRecoverySMSStage1()` - Immediate SMS within 5 minutes
- `sendRecoveryEmailStage2()` - Email #1 (1 hour after fail)
- `sendRecoveryEmailStage3()` - Email #2 (24 hours later, urgent)
- `scheduleRecoveryPhoneCall()` - Phone call/voice note (Day 2-3)
- `sendRecoveryEmailStage5()` - Final email (Day 5)

**Phase 3 — WIN-BACK:**
- `sendWinBackEmail1()` - Win-back email #1 (Day 7)
- `sendWinBackEmail2()` - Win-back email #2 (Day 10)
- `sendWinBackSMS()` - Win-back SMS (Day 12)

**Queue Management:**
- `lockSendQueue()` - Locks send queue when billing fails
- `unlockSendQueue()` - Unlocks send queue when payment succeeds

### 3. Cron Job (`src/app/api/cron/billing-recovery/route.ts`)

Runs every hour to process:
- Pre-bill reminders (3 days before renewal)
- Scheduled recovery actions (stages 1-5)
- Win-back actions (stages 1-3)
- Churn prediction score updates

**Configuration:**
- Added to `vercel.json` with schedule: `0 * * * *` (every hour)
- Protected with `CRON_SECRET` authentication

### 4. Stripe Webhook Integration (`src/app/api/stripe/webhook/route.ts`)

**Payment Failed Handler:**
- Creates recovery state
- Locks send queue
- Triggers immediate SMS (Stage 1)
- Logs recovery event

**Payment Succeeded Handler:**
- Unlocks send queue
- Clears recovery state
- Reactivates campaigns

### 5. Billing Update Link API (`src/app/api/billing/update-link/route.ts`)

**GET `/api/billing/update-link?token=xxx`:**
- Validates secure token
- Creates Stripe Customer Portal session
- Redirects to Stripe for payment method update

**POST `/api/billing/update-link`:**
- Creates new billing update link
- Returns secure token link

### 6. Billing Update Page (`app/billing/update/page.tsx`)

Client-side redirect page that handles billing update link redirects.

## Recovery Flow Timeline

### Phase 1 — PREVENT (Before Billing Fails)
- **3 days before renewal:** Pre-bill reminder email
- **48 hours before renewal:** In-app banner (to be implemented in UI)

### Phase 2 — RECOVER (When Billing Fails)
- **Within 5 minutes:** Immediate SMS
- **1 hour later:** Email #1 (friendly tone)
- **24 hours later:** Email #2 (urgent, fear of losing leads)
- **Day 2-3:** Phone call or voice note
- **Day 5:** Final email (yes/no question)

### Phase 3 — WIN-BACK (If Payment Never Comes Through)
- **Day 7:** Win-back email #1 (offer value first)
- **Day 10:** Win-back email #2 (simple re-commitment)
- **Day 12:** Win-back SMS (final attempt)

## Key Features

### 1. Send Queue Locking
When billing fails:
- All active campaigns are paused
- Dashboard and inbox remain visible (never fully lock users out)
- Campaigns resume automatically when payment succeeds

### 2. Churn Prediction
Tracks:
- Engagement score (based on campaign activity)
- Campaign activity count
- Days since last activity
- Calculated churn score (0-100)

### 3. Secure Update Links
- Time-limited tokens (7 days default)
- One-time use links
- Stripe Customer Portal integration
- Automatic expiration handling

### 4. Recovery Event Logging
Every recovery action is logged with:
- Event type and channel
- Message content
- Delivery status
- User response tracking

## Environment Variables Required

```bash
STRIPE_SECRET_KEY=sk_live_or_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_SITE_URL=https://app.smartsend.ai
CRON_SECRET=your-secret-key
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token
TWILIO_PHONE_NUMBER=+1234567890
RESEND_API_KEY=your-resend-key
FROM_EMAIL=notifications@smartsend.ai
```

## Database Migration

Run the migration:
```bash
supabase db push
```

Or manually apply: `supabase/migrations/20250130000001_block23690_billing_recovery_system.sql`

## Testing

### Test Payment Failure Flow:
1. Create a test subscription with Stripe
2. Trigger `invoice.payment_failed` webhook event
3. Verify recovery state is created
4. Verify send queue is locked
5. Verify SMS is sent (Stage 1)
6. Wait for cron job to process subsequent stages

### Test Payment Success Flow:
1. Update payment method in Stripe
2. Trigger `invoice.payment_succeeded` webhook event
3. Verify send queue is unlocked
4. Verify recovery state is cleared
5. Verify campaigns are reactivated

### Test Pre-Bill Reminders:
1. Create subscription with renewal date 3 days from now
2. Wait for cron job to run
3. Verify pre-bill reminder email is sent

## Monitoring

### Key Metrics to Track:
- Recovery success rate (payment recovered / total failures)
- Time to recovery (average days to payment success)
- Win-back success rate
- Churn score distribution
- Recovery stage distribution

### Database Queries:

**Active Recovery States:**
```sql
SELECT * FROM billing_recovery_states 
WHERE recovery_phase IN ('recover', 'win_back')
  AND recovery_completed_at IS NULL;
```

**Recovery Success Rate:**
```sql
SELECT 
  COUNT(*) FILTER (WHERE recovery_completed_at IS NOT NULL) as recovered,
  COUNT(*) as total,
  ROUND(100.0 * COUNT(*) FILTER (WHERE recovery_completed_at IS NOT NULL) / COUNT(*), 2) as success_rate
FROM billing_recovery_states
WHERE recovery_phase = 'recover';
```

**Average Time to Recovery:**
```sql
SELECT 
  AVG(EXTRACT(EPOCH FROM (recovery_completed_at - first_failure_at)) / 86400) as avg_days_to_recovery
FROM billing_recovery_states
WHERE recovery_completed_at IS NOT NULL;
```

## Next Steps (Future Enhancements)

1. **In-App Banner:** Add 48-hour pre-renewal banner in UI
2. **Phone Call Automation:** Integrate Twilio Voice API for automated calls
3. **A/B Testing:** Test different recovery message variations
4. **Seasonal Adjustments:** Adjust recovery timing based on roofing season
5. **Personalization:** Use AI to personalize recovery messages based on user behavior
6. **Dashboard:** Create admin dashboard for monitoring recovery metrics

## Files Created/Modified

### Created:
- `supabase/migrations/20250130000001_block23690_billing_recovery_system.sql`
- `src/lib/billing/recovery-service.ts`
- `src/app/api/cron/billing-recovery/route.ts`
- `src/app/api/billing/update-link/route.ts`
- `app/billing/update/page.tsx`
- `BLOCK_23690_BILLING_RECOVERY_IMPLEMENTATION.md`

### Modified:
- `src/app/api/stripe/webhook/route.ts` - Added recovery triggers
- `vercel.json` - Added billing recovery cron job

## Support

For issues or questions about the billing recovery system, refer to:
- Database schema: `billing_recovery_states`, `billing_recovery_events`
- Recovery service: `src/lib/billing/recovery-service.ts`
- Cron job: `src/app/api/cron/billing-recovery/route.ts`







































# Block 17300 — SmartSend Billing Guard v2 Implementation

## Overview

Complete billing enforcement system that protects SmartSend revenue, enforces plan limits, handles trial expiration, grace periods, and provides smart upsell triggers.

## ✅ Implementation Complete

### 1. Database Migration
**File:** `supabase/migrations/20250130000003_block17300_billing_guard_v2.sql`

- ✅ Enhanced `subscriptions` table with trial fields (`trial_started_at`, `trial_ends_at`, `trial_expired_at`, `is_trial_active`, `locked_at`, `locked_reason`)
- ✅ `billing_usage` table for monthly tracking (emails, campaigns, AI requests, appointments, seats)
- ✅ `billing_locks` table for feature locks (trial expired, payment failed, over limit)
- ✅ `billing_events` table for audit trail
- ✅ `billing_grace_period` table for 7-day grace period tracking
- ✅ Updated `plan_limits` with exact specs:
  - **Starter ($99)**: 1 campaign, 500 emails/month, 1 seat
  - **Growth ($199)**: 3 campaigns, 2,000 emails/month, 2 seats
  - **Domination ($399)**: Unlimited campaigns, 10,000 emails/month, 5 seats
- ✅ Database functions:
  - `check_trial_expiration()` - Check if trial expired (locks at midnight Day 7)
  - `lock_features_on_trial_expired()` - Lock features when trial expires
  - `get_billing_status_with_grace_period_v2()` - Get billing status with 7-day grace period logic
  - `start_grace_period()` - Start 7-day grace period on payment failure
  - `resolve_grace_period()` - Resolve grace period on payment success
  - `check_plan_limits_v2()` - Check plan limits with upgrade suggestions

### 2. Core Billing Guard Library (v2)
**File:** `src/lib/billing/guard-v2.ts`

- ✅ `getBillingStatus()` - Get billing status with grace period and trial logic
- ✅ `checkBillingGuard()` - Main enforcement function for all actions
- ✅ `getUsageStats()` - Get current usage statistics
- ✅ `incrementEmailUsage()` - Track email usage
- ✅ `checkTrialExpiration()` - Check if trial expired
- ✅ `lockFeaturesOnTrialExpired()` - Lock features on trial expiration
- ✅ `startGracePeriod()` - Start grace period on payment failure
- ✅ `resolveGracePeriod()` - Resolve grace period on payment success
- ✅ `getUpsellTriggers()` - Get smart upsell trigger suggestions

### 3. Stripe Sync Functions (v2)
**File:** `src/lib/billing/stripe-sync-v2.ts`

- ✅ `syncSubscriptionFromStripe()` - Sync subscription from Stripe
- ✅ `syncOnLogin()` - Sync on user login (rate limited: 1 hour)
- ✅ `syncBeforeSend()` - Lightweight sync before sending (rate limited: 6 hours)
- ✅ `handleStripeWebhook()` - Handle Stripe webhook events
- ✅ Automatic payment failure detection and grace period initiation
- ✅ Payment success restoration

### 4. API Routes

#### ✅ `/api/billing/upgrade` (POST)
- Handles plan upgrades
- Creates/updates Stripe subscriptions
- Supports proration

#### ✅ `/api/billing/usage` (GET)
- Returns current usage stats
- Returns billing status
- Returns upsell triggers

#### ✅ `/api/billing/stripeWebhook` (POST)
- Handles Stripe webhook events
- Syncs subscription status
- Handles payment failures/successes

### 5. Supabase Edge Functions

#### ✅ `/billing/enforceLimits`
- Nightly worker to enforce plan limits
- Checks trial expiration
- Updates billing status

#### ✅ `/billing/syncStripe`
- Nightly worker to sync all subscriptions from Stripe
- Ensures database stays in sync

#### ✅ `/billing/handleTrialExpired`
- Worker to handle trial expiration
- Locks features when trial expires

### 6. UI Components

#### ✅ `BillingGuardV2` Component
- Shows trial expired banner
- Shows trial expiring banner
- Shows upsell triggers
- Upgrade CTAs

#### ✅ Billing Settings Page
- Current plan display
- Usage statistics with progress bars
- Upgrade options
- Plan comparison

## Key Features

### 1. Trial Enforcement (7-Day)
- ✅ Trial locks at midnight of Day 7
- ✅ Stops all outbound (campaigns, follow-ups, AI sequences)
- ✅ Allows inbox replies and appointment booking
- ✅ Shows upgrade banner
- ✅ Soft-saves campaigns for after upgrade

### 2. Plan Limit Enforcement
- ✅ Campaign limits (Starter: 1, Growth: 3, Domination: unlimited)
- ✅ Email send limits (Starter: 500, Growth: 2,000, Domination: 10,000)
- ✅ Seat limits (Starter: 1, Growth: 2, Domination: 5)
- ✅ Feature access (advanced AI, revenue dashboard, automation)

### 3. Grace Period System (7-Day)
- ✅ Day 0: Payment fails → Show warning
- ✅ Day 1: Retry → Limit sending to 50%
- ✅ Day 3: Retry → Lock campaigns, keep inbox + scheduler active
- ✅ Day 7: Full lock

### 4. Smart Upsell Triggers
- ✅ "You're 82% of your send limit. Upgrade now to continue reaching homeowners."
- ✅ "Campaign limit reached. Upgrade to run more campaigns."
- ✅ "Trial expires in X days. Upgrade now to keep SmartSend running."
- ✅ Contextual upgrade suggestions based on usage

### 5. Stripe Integration
- ✅ Real-time subscription sync
- ✅ Payment failure detection
- ✅ Payment success restoration
- ✅ Webhook handling
- ✅ Proration support

## Usage

### Check Billing Guard
```typescript
import { checkBillingGuard } from '@/lib/billing/guard-v2';

const result = await checkBillingGuard(supabase, userId, 'send_email', {
  emailsToSend: 10
});

if (!result.allowed) {
  // Show upgrade modal or block action
  console.log(result.reason);
  console.log(result.upgradePlan); // 'growth' | 'domination'
}
```

### Get Usage Stats
```typescript
import { getUsageStats } from '@/lib/billing/guard-v2';

const stats = await getUsageStats(supabase, userId);
console.log(stats.emailsSentThisMonth);
console.log(stats.campaignsCreated);
console.log(stats.limits);
```

### Sync from Stripe
```typescript
import { syncOnLogin } from '@/lib/billing/stripe-sync-v2';

// Call on login
await syncOnLogin(supabase, userId);
```

## Integration Points

The billing guard should be integrated at:

1. **Campaign Creation** - Check campaign limit before creation
2. **Email Sending** - Check email limit before sending
3. **Team Member Addition** - Check seat limit before adding
4. **Feature Access** - Check plan features before accessing
5. **Trial Expiration** - Check trial status on every action

## Environment Variables

Add these to your `.env.local`:

```bash
STRIPE_SECRET_KEY=sk_live_or_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_or_test_...
NEXT_PUBLIC_STRIPE_PRICE_STARTER_ID=price_...
NEXT_PUBLIC_STRIPE_PRICE_GROWTH_ID=price_...
NEXT_PUBLIC_STRIPE_PRICE_DOMINATION_ID=price_...
```

## Next Steps

1. **Set up Stripe Products** - Create products and prices in Stripe dashboard
2. **Configure Webhook** - Set up webhook endpoint in Stripe dashboard
3. **Schedule Workers** - Set up cron jobs for nightly enforcement
4. **Test Trial Flow** - Test trial expiration and locking
5. **Test Grace Period** - Test payment failure → grace period flow
6. **Test Upgrades** - Test plan upgrades and proration

## Files Created/Modified

### Created
- `supabase/migrations/20250130000003_block17300_billing_guard_v2.sql`
- `src/lib/billing/guard-v2.ts`
- `src/lib/billing/stripe-sync-v2.ts`
- `src/app/api/billing/upgrade/route.ts`
- `src/app/api/billing/usage/route.ts`
- `src/app/api/billing/stripeWebhook/route.ts`
- `supabase/functions/billing/enforceLimits/index.ts`
- `supabase/functions/billing/syncStripe/index.ts`
- `supabase/functions/billing/handleTrialExpired/index.ts`
- `src/components/billing/BillingGuardV2.tsx`
- `src/app/settings/billing/page.tsx`

### Modified
- `src/lib/billing/plan-limits.ts` - Updated plan limits (if needed)

## Testing Checklist

- [ ] Test trial expiration (7-day trial locks at midnight)
- [ ] Test campaign limit enforcement
- [ ] Test email sending limit enforcement
- [ ] Test seat limit enforcement
- [ ] Test grace period flow (7-day escalation)
- [ ] Test payment failure → grace period
- [ ] Test payment success → restoration
- [ ] Test upgrade flow
- [ ] Test upsell triggers
- [ ] Test Stripe webhook events
- [ ] Test nightly workers

## Notes

- The billing guard system is designed to be fail-safe: if checks fail, actions are blocked
- Grace period logic is enforced at the database level via functions
- Stripe sync is rate-limited to avoid API rate limits
- All billing events are logged for audit trail
- The system supports both user-based and workspace-based billing (via `owner_id`)
- Trial expiration locks at midnight of Day 7 (not end of day)
- Grace period is 7 days (not 14 days) for faster recovery






















































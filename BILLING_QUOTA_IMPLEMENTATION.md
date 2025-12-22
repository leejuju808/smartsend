# User-Based Billing with Monthly Send Quotas - Implementation Complete

## Overview
A complete user-based billing and quota system has been implemented with Stripe integration, monthly send usage tracking, and atomic quota consumption.

## Files Created/Modified

### 1. Database Migration
**File:** `supabase/migrations/20251201_user_billing_quota.sql`

**Tables:**
- `profiles` - Extended with billing fields (plan, plan_status, plan_period_end, seats, stripe_customer_id)
- `send_usage` - Monthly metered usage tracking (user_id, period_key, sends)
- `plan_limits` - Configuration table for plan limits (free: 100, pro: 5000, team: 25000)

**Function:**
- `consume_send_quota(p_user, p_count, p_now)` - Atomically checks and increments send quota
  - Returns: `{ok, remaining, limit, period_key}`
  - Enforces plan-based limits
  - Requires active/trialing status for paid plans

**Policies:**
- RLS enabled on all tables
- Users can read own profiles/usage
- Service role can update profiles (for webhooks)

### 2. API Routes

#### Checkout
**File:** `app/api/billing/create-checkout/route.ts`
- Creates Stripe checkout sessions
- Auto-creates Stripe customers if missing
- Links users via metadata

#### Portal
**File:** `app/api/billing/create-portal/route.ts`
- Opens Stripe Customer Portal
- Allows subscription management

#### Webhook
**File:** `app/api/stripe/webhook/route.ts`
- Handles `checkout.session.completed`
- Handles `customer.subscription.updated/created/deleted`
- Updates profiles table with plan, status, period_end

### 3. Quota Enforcement
**File:** `src/app/api/campaigns/[id]/enqueue/route.ts` (Modified)
- Added `checkAndConsume()` helper
- Checks quota BEFORE enqueuing messages
- Returns 402 (Payment Required) when limit reached
- Error message includes remaining quota

### 4. Billing UI
**File:** `app/billing/page.tsx`
- Client-side billing page
- Three plan cards (Free, Pro, Team)
- Checkout buttons for upgrades
- "Open Portal" button for subscription management
- Auto-fetches userId from Supabase auth

### 5. Profile Helper
**File:** `src/lib/profile-helper.ts`
- `ensureProfile(userId, email)` function
- Creates profile row if missing
- Idempotent (safe to call multiple times)

**File:** `src/app/auth/callback/route.ts` (Modified)
- Calls `ensureProfile()` on sign-in
- Creates profile for new and existing users

## Environment Variables Required

Add to `.env.local`:

```bash
# Stripe
STRIPE_SECRET_KEY=sk_live_or_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PRICE_PRO=price_...
NEXT_PUBLIC_STRIPE_PRICE_TEAM=price_...

# App
NEXT_PUBLIC_APP_URL=https://yourapp.com
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## Setup Instructions

### 1. Apply Database Migration
```bash
# Run in Supabase SQL Editor
cat supabase/migrations/20251201_user_billing_quota.sql
```

### 2. Configure Stripe
1. Create Products/Prices in Stripe Dashboard:
   - Pro: $29/month → get `price_xxxxx`
   - Team: $99/month → get `price_xxxxx`
2. Update `.env.local` with price IDs
3. Configure webhook endpoint:
   - URL: `https://yourapp.com/api/stripe/webhook`
   - Signing secret: copy to `STRIPE_WEBHOOK_SECRET`

### 3. Deploy Code
```bash
# Build and deploy
npm run build
# Deploy to your hosting platform
```

### 4. Test the Flow
1. Sign in to your app
2. Visit `/billing`
3. Click "Upgrade" for Pro/Team
4. Complete Stripe checkout
5. Webhook updates your profile
6. Try to enqueue more than your limit
7. Should see 402 error with remaining quota

## How It Works

### Send Quota Flow
```
User initiates send
    ↓
API route calls checkAndConsume(userId, count)
    ↓
consume_send_quota() RPC function:
  - Reads user's plan + status
  - Resolves monthly limit from plan_limits
  - Gets current usage for period (YYYY-MM)
  - Returns false if over limit
  - Increments usage atomically if under limit
    ↓
If ok: Enqueue messages ✓
If !ok: Return 402 with error message ✗
```

### Billing Flow
```
User clicks "Upgrade"
    ↓
/app/api/billing/create-checkout
  - Creates/retrieves Stripe customer
  - Creates checkout session
    ↓
User completes payment on Stripe
    ↓
Stripe webhook → /api/stripe/webhook
  - Updates profiles table
  - Sets plan, plan_status, plan_period_end
    ↓
User can now send up to plan limit
```

## Plan Limits
- **Free:** 100 sends/month, inactive status
- **Pro:** 5,000 sends/month, requires active/trialing
- **Team:** 25,000 sends/month, requires active/trialing

## Security
- RLS policies enforce data isolation
- Service role used for webhook updates only
- Users cannot modify their own plan/status
- Quota checking is atomic (no race conditions)

## Next Steps

### Optional Enhancements
1. Show current usage on billing page
2. Add upgrade modal for 402 errors
3. Send quota warning emails at 80%
4. Add annual billing options
5. Implement team seat management

### Monitoring
- Track quota rejection rates
- Monitor webhook failures
- Alert on Stripe sync issues
- Dashboard for send usage trends

## Troubleshooting

### "No Stripe customer" error
- Ensure `ensureProfile()` is called on sign-in
- Check webhook is updating profiles correctly

### Quota not enforced
- Verify migration was applied
- Check `consume_send_quota` function exists
- Ensure RPC grants are correct

### Webhook not working
- Verify signing secret matches
- Check webhook URL is accessible
- Monitor Supabase logs for errors

## Support
- See migration file for RPC implementation details
- Check webhook logs in Stripe Dashboard → Webhooks
- Review Supabase logs for database errors


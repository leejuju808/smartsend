# Block 15: Launch Mode (Stripe + Paywall/Gating) Implementation

## Overview

Successfully implemented a complete paywall and gating system using Stripe for subscription management, with daily send limits and billing integration.

## ✅ What's Been Implemented

### 1. Database Schema
- **Migration**: `supabase/migrations/20250201_block15_paywall_system.sql`
  - Created `usage_sends` table for daily send tracking
  - Added RLS policies for usage tracking
  - Created `v_billing_effective` view for subscription status
  - Added `daily_send_limit` column to profiles

### 2. Subscription Helpers (`src/lib/subscription.ts`)
- ✅ `getEffectiveSubscription()` - Get user's subscription status
- ✅ `isActive()` - Check if subscription is active
- ✅ `getEffectiveBilling()` - Get billing information for feature gating
- ✅ `requireProOrRedirect()` - Gate access to paid features

### 3. Stripe Integration (`src/lib/stripe.ts`)
- ✅ `createCheckoutSession()` - Create Stripe checkout session
- ✅ `createPortalSession()` - Open billing portal
- ✅ Already had `stripe` client instance
- ✅ Price ID mappings for Solo/Team/Pro plans

### 4. Limit Enforcement (`src/lib/limits.ts`)
- ✅ `canSendToday()` - Check if user can send emails today
- ✅ `incrementSend()` - Increment daily send counter

### 5. Server Actions (`src/lib/billing-actions.ts`)
- ✅ `createCheckoutAction()` - Server action for checkout
- ✅ `createPortalAction()` - Server action for billing portal

### 6. Webhook Handler (`src/app/api/stripe/webhook/route.ts`)
- ✅ Handles `checkout.session.completed`
- ✅ Handles `customer.subscription.updated`
- ✅ Handles `customer.subscription.deleted`
- ✅ Updates profiles table with subscription info

### 7. Billing API Routes
- ✅ `src/app/api/billing/checkout/route.ts` - Checkout endpoint
- ✅ `src/app/api/billing/portal/route.ts` - Billing portal endpoint
- ✅ Both updated to use profiles table

### 8. UI Pages
- ✅ `src/app/upgrade/page.tsx` - Pricing/upgrade page
- ✅ `src/app/settings/billing/page.tsx` - Billing management

### 9. Environment Variables
- ✅ Updated `env.template` with Stripe price IDs:
  - `NEXT_PUBLIC_PRICE_BASIC_ID`
  - `NEXT_PUBLIC_PRICE_PRO_ID`
  - `NEXT_PUBLIC_PRICE_PRO_ANNUAL_ID`

## 🚀 Setup Instructions

### 1. Apply Database Migration

```bash
# Run the migration in Supabase SQL Editor
# Or use Supabase CLI:
supabase migration up
```

### 2. Configure Environment Variables

Add to your `.env.local`:

```bash
# Stripe Configuration (should already exist)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# Block 15: Launch Mode Price IDs
NEXT_PUBLIC_PRICE_BASIC_ID=price_1234567890
NEXT_PUBLIC_PRICE_PRO_ID=price_9876543210
NEXT_PUBLIC_PRICE_PRO_ANNUAL_ID=price_annual_123456

# App URLs
NEXT_PUBLIC_APP_URL=https://yourdomain.com
NEXT_PUBLIC_SITE_URL=https://yourdomain.com
BILLING_RETURN_URL=https://yourdomain.com/settings/billing
```

### 3. Set Up Stripe Webhook

1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://yourdomain.com/api/stripe/webhook`
3. Select events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy the webhook secret to `STRIPE_WEBHOOK_SECRET`

### 4. Seed Plans in Stripe

Create your plans in Stripe Dashboard:
- Basic Plan: $29/month
- Pro Plan: $49/month
- Pro Annual: $490/year (optional)

Copy the Price IDs to your `.env.local`

### 5. Test the Flow

1. **Start local webhook testing**:
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   # Copy the webhook secret to .env.local
   ```

2. **Test as a free user**:
   - Visit `/upgrade`
   - Click "Start Free Trial"
   - Complete checkout
   - Verify webhook updates profile

3. **Test billing portal**:
   - Visit `/settings/billing`
   - Click "Manage in Billing Portal"
   - Verify portal opens

## 📋 Usage Examples

### Check Subscription Status

```typescript
import { getEffectiveSubscription, isActive } from '@/lib/subscription';

// In a server component or route handler
const sub = await getEffectiveSubscription(userId);
console.log(sub.status); // 'active', 'trialing', 'free', etc.
console.log(sub.is_active); // boolean
```

### Gate a Page or Feature

```typescript
import { requireProOrRedirect } from '@/lib/subscription';

// In a server component or layout
const result = await requireProOrRedirect();
if (!result.ok) {
  redirect(result.redirect!);
}
```

### Check Send Limits

```typescript
import { canSendToday, incrementSend } from '@/lib/limits';

// Check before sending
const { allowed, remaining, dailyLimit } = await canSendToday(userId);
if (!allowed) {
  throw new Error('Daily send limit reached');
}

// Increment after successful send
await incrementSend(userId, 1);
```

### Create Checkout Session

```typescript
import { createCheckoutSession } from '@/lib/stripe';

const session = await createCheckoutSession(userId, priceId, email);
redirect(session.url!);
```

## 🔒 RLS Policies

The migration automatically sets up:
- Users can read their own usage data
- Service role can manage all usage (for incrementing)
- Users can read their own billing info via `v_billing_effective`

## 🎯 Next Steps

To complete the launch mode setup:

1. **Apply the migration** in Supabase
2. **Configure Stripe** with your price IDs
3. **Test the webhook** locally with `stripe listen`
4. **Seed plan limits** in your database (if using org-based billing)
5. **Deploy** and configure production webhook endpoint

## 📝 Notes

- The system uses `profiles` table as the source of truth for subscriptions
- `v_billing_effective` view computes `is_paid` and `monthly_send_cap` from subscription status
- Daily limits are enforced via `usage_sends` table
- Free users get 200 monthly sends (not enforced in daily limits currently)
- Pro users get effectively unlimited sends

## 🐛 Troubleshooting

**Webhook not working?**
- Check `STRIPE_WEBHOOK_SECRET` is set correctly
- Verify webhook endpoint in Stripe matches your deployment URL
- Test with `stripe listen` locally first

**Checkout not redirecting?**
- Verify `NEXT_PUBLIC_APP_URL` is set correctly
- Check that price IDs are valid in Stripe
- Ensure user has a valid email in their profile

**Portal not opening?**
- User must have `stripe_customer_id` in their profile
- Check that customer exists in Stripe Dashboard
- Verify `STRIPE_SECRET_KEY` is correct

## ✅ Implementation Checklist

- [x] Database migration for usage tracking
- [x] Subscription helpers library
- [x] Stripe checkout/portal integration
- [x] Send limit enforcement
- [x] Webhook handler
- [x] Billing API routes
- [x] Upgrade page
- [x] Billing settings page
- [x] Environment variables documented
- [ ] Test webhook locally
- [ ] Seed Stripe price IDs
- [ ] Deploy to production
- [ ] Configure production webhook

## 📚 Related Files

- `src/lib/subscription.ts` - Subscription logic
- `src/lib/stripe.ts` - Stripe integration
- `src/lib/limits.ts` - Send limit enforcement
- `src/lib/billing-actions.ts` - Server actions
- `src/app/api/stripe/webhook/route.ts` - Webhook handler
- `src/app/api/billing/checkout/route.ts` - Checkout API
- `src/app/api/billing/portal/route.ts` - Portal API
- `src/app/upgrade/page.tsx` - Upgrade page
- `src/app/settings/billing/page.tsx` - Billing page
- `supabase/migrations/20250201_block15_paywall_system.sql` - Database schema
- `env.template` - Environment variables


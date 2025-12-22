# Billing System Implementation Summary

This document summarizes the complete Stripe billing system implementation.

## ✅ Completed Components

### 1. Database Schema (Migration)
**File:** `supabase/migrations/20250216000002_billing_system.sql`

- ✅ `billing_customers` table - Maps users to Stripe customers
- ✅ `user_subscriptions` table - Tracks subscription plans and status
- ✅ `plan_limits` table - Defines daily/monthly send limits per plan
- ✅ RLS policies for owner-only access
- ✅ `get_campaign_owner()` function - Gets owner user_id for campaigns
- ✅ `get_user_usage()` function - Computes daily/monthly usage and plan status
- ✅ Performance indexes on all key columns

### 2. API Routes

#### ✅ `/api/billing/checkout` (POST)
- Creates/finds Stripe customer
- Initiates Stripe Checkout session
- Returns checkout URL

#### ✅ `/api/billing/portal` (POST)
- Opens Stripe Customer Portal for subscription management
- Returns portal URL

#### ✅ `/api/stripe/webhook` (POST)
- Handles Stripe webhook events:
  - `checkout.session.completed` - Creates subscription record
  - `customer.subscription.updated` - Updates subscription
  - `customer.subscription.deleted` - Handles cancellations
- Syncs subscription status with database

#### ✅ `/api/settings/billing/summary` (GET)
- Returns current subscription and usage data
- Includes plan limits for display

### 3. Usage Enforcement

#### ✅ Send Worker (`supabase/functions/sendWorker/index.ts`)
- Enforces plan limits before sending each email
- Checks subscription status (must be 'active' or 'trialing')
- Enforces daily and monthly caps
- Automatically pauses campaigns if subscription inactive
- Delays queue items when caps are hit

#### ✅ Campaign Start Guard (`src/app/api/campaigns/start/route.ts`)
- Prevents starting campaigns without active subscription
- Returns 402 Payment Required if subscription inactive

### 4. Billing Settings UI

**File:** `src/app/settings/billing/page.tsx`

- Displays current plan and status
- Shows daily/monthly usage vs limits
- Upgrade buttons for Starter and Pro plans
- Manage subscription button (Stripe Portal)

## 📋 Environment Variables

Add these to `.env.local` and Supabase Function secrets:

```bash
STRIPE_SECRET_KEY=sk_live_or_test_...
STRIPE_WEBHOOK_SECRET=whsec_...   # from Stripe CLI/dashboard
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_or_test_...
BILLING_RETURN_URL=http://localhost:3000/settings/billing
```

## 🔧 Configuration Required

### 1. Stripe Price IDs
Update the price IDs in `src/app/settings/billing/page.tsx`:
- Replace `"price_starter_XXXX"` with your actual Starter plan price ID
- Replace `"price_pro_XXXX"` with your actual Pro plan price ID

### 2. Stripe Webhook Setup
1. In Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://yourdomain.com/api/stripe/webhook`
3. Select events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy webhook signing secret to `STRIPE_WEBHOOK_SECRET`

### 3. Run Database Migration
```bash
# Apply the migration
supabase migration up
# Or via Supabase Dashboard → SQL Editor
```

## 📊 Plan Limits

The system enforces these limits:

| Plan | Daily Sends | Monthly Sends | Active Campaigns |
|------|------------|---------------|------------------|
| Free | 25 | 500 | 1 |
| Starter | 200 | 4,000 | 3 |
| Pro | 1,000 | 20,000 | 10 |

## 🚀 Usage Flow

1. **User upgrades:** Clicks upgrade button → Stripe Checkout → Payment
2. **Webhook processes:** Creates/updates subscription record
3. **Worker enforces:** Checks limits before each send
4. **UI displays:** Shows usage and plan status on billing page

## 🔒 Security

- RLS policies ensure users only see their own billing data
- Webhook signature verification prevents unauthorized requests
- Service role key used only server-side
- User authentication required for all billing operations

## 📝 Next Steps

1. ✅ Replace placeholder price IDs with real Stripe price IDs
2. ✅ Configure Stripe webhook endpoint
3. ✅ Set environment variables
4. ✅ Test checkout flow with Stripe test mode
5. ✅ Verify webhook events are processed correctly
6. ✅ Test usage enforcement in worker

## 🎯 What This Delivers

- ✅ Users can upgrade via Stripe Checkout
- ✅ Users can manage subscriptions via Stripe Portal
- ✅ Webhook keeps subscriptions in sync
- ✅ Hard caps enforced in sender + campaign start guard
- ✅ Usage display (today/month) makes limits clear
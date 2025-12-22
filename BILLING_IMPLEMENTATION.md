# Billing System Implementation

This document describes the complete Stripe billing system implementation with plan limits and usage tracking.

## Environment Variables

Add these to your `.env.local` and your Supabase Function secrets:

```bash
STRIPE_SECRET_KEY=sk_live_or_test_...
STRIPE_WEBHOOK_SECRET=whsec_...   # from Stripe CLI/dashboard
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_or_test_...
BILLING_RETURN_URL=http://localhost:3000/settings/billing
```

## Database Migration

Run the migration to create the billing tables and functions:

```bash
supabase db push
```

Or manually apply: `supabase/migrations/20250216000002_billing_system.sql`

This creates:
- `billing_customers` - Links users to Stripe customers
- `user_subscriptions` - Tracks subscription status and plan
- `plan_limits` - Defines limits for each plan (free, starter, pro)
- `get_campaign_owner()` - Function to get workspace owner from campaign
- `get_user_usage()` - Function to calculate daily/monthly usage

## Plan Limits

The system enforces three plans:

- **Free**: 25 daily sends, 500 monthly sends, 1 active campaign
- **Starter**: 200 daily sends, 4000 monthly sends, 3 active campaigns
- **Pro**: 1000 daily sends, 20000 monthly sends, 10 active campaigns

## API Routes

### `/api/billing/checkout` (POST)
Creates a Stripe Checkout session. Expects `{ priceId }` in the body.
- Automatically creates Stripe customer if needed
- Returns checkout URL

### `/api/billing/portal` (POST)
Creates a Stripe Billing Portal session for managing subscriptions.
- Returns portal URL

### `/api/stripe/webhook` (POST)
Handles Stripe webhook events:
- `checkout.session.completed` - Creates subscription record
- `customer.subscription.updated` - Updates subscription status
- `customer.subscription.deleted` - Updates subscription status to canceled

### `/api/settings/billing/summary` (GET)
Returns current subscription and usage information for the authenticated user.

## Enforcement Points

### 1. Send Worker Guard
The `sendWorker` edge function enforces plan limits before sending each email:
- Checks subscription status (must be 'active' or 'trialing')
- Enforces daily/monthly send limits
- Pauses campaigns or delays sends if limits are exceeded

### 2. Campaign Start Guard
The `/api/campaigns/start` route checks subscription status before allowing campaigns to start.

## Usage Calculation

The `get_user_usage()` function calculates:
- Daily sends: Count of `campaign_leads` with `sent_at` today
- Monthly sends: Count of `campaign_leads` with `sent_at` this month
- Plan: Current subscription plan (defaults to 'free')
- Status: Current subscription status (defaults to 'active')

## Billing UI

The billing page (`/settings/billing`) displays:
- Current plan and status
- Daily and monthly usage vs limits
- Buttons to upgrade to Starter or Pro
- Button to open Stripe Customer Portal

**Note**: You need to replace `"price_starter_XXXX"` and `"price_pro_XXXX"` in the billing page with your actual Stripe price IDs.

## Stripe Setup

1. Create products and prices in Stripe Dashboard for Starter and Pro plans
2. Set up webhook endpoint pointing to `/api/stripe/webhook`
3. Enable Customer Portal in Stripe Dashboard
4. Copy webhook secret to `STRIPE_WEBHOOK_SECRET`
5. Update price IDs in the billing UI component

## Testing

1. Start your dev server
2. Visit `/settings/billing`
3. Test checkout flow with Stripe test cards
4. Verify webhook updates subscription in database
5. Test usage limits by sending emails

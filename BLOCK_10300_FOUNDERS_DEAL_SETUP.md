# Block 10300 — SmartSend Founders Deal Engine v1

## Overview

This system converts beta roofers into paying monthly subscribers without pressure and without a "sales call." It activates automatically when users see results (homeowner replies, warm leads, or job value shown) after 72 hours.

## How It Works

### 1. Eligibility Detection

A workspace becomes eligible for the founders deal when:
- **72 hours have passed** since workspace creation
- **AND** at least one of the following:
  - Homeowner reply received
  - Warm lead generated
  - Job value shown in dashboard (> $0)

The eligibility is checked automatically via the `check_founders_deal_eligibility()` database function.

### 2. Founders Deal Offer

When eligible, users see a banner on their dashboard with the message:
> "Since you're part of the first 10 roofing companies testing SmartSend, you unlock a lifetime rate. Price will never increase for you."

### 3. Pricing Plans

- **Starter**: $99/month
- **Growth**: $199/month (target: 70% choose this)
- **Domination**: $399/month

### 4. Conversion Flow

1. User sees results → Eligibility detected
2. Founders deal banner appears on dashboard
3. User clicks "Claim Founders Rate"
4. Redirected to `/pricing/founders?founder=true`
5. User selects plan and subscribes via Stripe
6. Webhook sets `is_founder = true` flag
7. User sees confirmation screen

## Setup Instructions

### 1. Database Migration

Run the migration:
```bash
supabase migration up 20250130000002_block10300_founders_deal_engine
```

This creates:
- `is_founder` column on `workspace_subscriptions`
- `founders_deal_eligibility` table
- `check_founders_deal_eligibility()` function

### 2. Stripe Products Setup

Create 3 subscription products in Stripe Dashboard:

#### Starter Plan
- **Product Name**: `SmartSend Starter (Founders)`
- **Price**: $99/month (recurring)
- **Metadata**: 
  ```json
  {
    "plan_type": "starter",
    "founder": "true"
  }
  ```
- **Price ID**: Copy this and set as `STRIPE_FOUNDERS_STARTER_PRICE_ID` in `.env`

#### Growth Plan
- **Product Name**: `SmartSend Growth (Founders)`
- **Price**: $199/month (recurring)
- **Metadata**: 
  ```json
  {
    "plan_type": "growth",
    "founder": "true"
  }
  ```
- **Price ID**: Copy this and set as `STRIPE_FOUNDERS_GROWTH_PRICE_ID` in `.env`

#### Domination Plan
- **Product Name**: `SmartSend Domination (Founders)`
- **Price**: $399/month (recurring)
- **Metadata**: 
  ```json
  {
    "plan_type": "domination",
    "founder": "true"
  }
  ```
- **Price ID**: Copy this and set as `STRIPE_FOUNDERS_DOMINATION_PRICE_ID` in `.env`

### 3. Environment Variables

Add to your `.env` file:
```bash
STRIPE_FOUNDERS_STARTER_PRICE_ID=price_xxxxx
STRIPE_FOUNDERS_GROWTH_PRICE_ID=price_xxxxx
STRIPE_FOUNDERS_DOMINATION_PRICE_ID=price_xxxxx
```

### 4. Stripe Webhook Configuration

Ensure your Stripe webhook endpoint (`/api/stripe/webhook`) is configured to handle:
- `customer.subscription.created`
- `customer.subscription.updated`

The webhook automatically sets `is_founder = true` when it detects founder metadata.

### 5. Testing Eligibility

You can manually check eligibility via API:
```bash
GET /api/founders/check-eligibility
```

Response:
```json
{
  "eligible": true,
  "is_founder": false,
  "already_converted": false,
  "eligibility_details": {
    "first_homeowner_reply_at": "2025-01-30T12:00:00Z",
    "first_warm_lead_at": null,
    "first_job_value_shown_at": "2025-01-30T12:05:00Z"
  }
}
```

## Files Created

1. **Database Migration**: `supabase/migrations/20250130000002_block10300_founders_deal_engine.sql`
2. **Pricing Page**: `src/app/pricing/founders/page.tsx`
3. **Checkout API**: `src/app/api/founders/checkout/route.ts`
4. **Eligibility API**: `src/app/api/founders/check-eligibility/route.ts`
5. **Send Offer API**: `src/app/api/founders/send-offer/route.ts`
6. **Success Page**: `src/app/founders/success/page.tsx`
7. **Banner Component**: `src/components/founders/FoundersDealBanner.tsx`
8. **Webhook Handler**: Updated `src/app/api/stripe/webhook/route.ts`

## Integration Points

### Dashboard Integration

The `FoundersDealBanner` component is automatically shown on the dashboard (`app/dashboard/page.tsx`) when:
- User is eligible
- Not already a founder
- Not already converted
- Banner not dismissed

### Automatic Eligibility Checking

Eligibility is checked:
1. When the dashboard loads (via `FoundersDealBanner` component)
2. Via the database function `check_founders_deal_eligibility()`
3. Can be triggered manually via API

### Webhook Processing

When a subscription is created:
1. Webhook receives `customer.subscription.created` event
2. Checks metadata for `founder: "true"`
3. Updates `workspace_subscriptions` with `is_founder = true`
4. Updates `founders_deal_eligibility` with conversion details

## Customization

### Adjust Eligibility Criteria

Edit the `check_founders_deal_eligibility()` function in the migration file to change:
- Time threshold (currently 72 hours)
- Required results (currently: reply OR warm lead OR job value)

### Change Pricing

Update prices in:
1. `src/app/pricing/founders/page.tsx` (display prices)
2. `src/app/api/founders/checkout/route.ts` (FOUNDERS_PLANS object)
3. Stripe Dashboard (actual prices)

### Modify Banner Message

Edit `src/components/founders/FoundersDealBanner.tsx` to change the offer message.

## Troubleshooting

### Banner Not Showing

1. Check eligibility: `GET /api/founders/check-eligibility`
2. Verify workspace is > 72 hours old
3. Verify user has received replies/leads/job value
4. Check browser console for errors

### Subscription Not Marked as Founder

1. Verify Stripe metadata includes `founder: "true"`
2. Check webhook logs for processing errors
3. Verify `workspace_subscriptions` table has `is_founder` column
4. Manually update if needed: `UPDATE workspace_subscriptions SET is_founder = true WHERE workspace_id = 'xxx'`

### Eligibility Function Not Working

1. Check database function exists: `SELECT * FROM pg_proc WHERE proname = 'check_founders_deal_eligibility'`
2. Verify table structures match migration
3. Check RLS policies allow function execution

## Next Steps

1. Create Stripe products with founder metadata
2. Set environment variables
3. Test eligibility detection
4. Test checkout flow
5. Monitor conversions via `founders_deal_eligibility` table

## Revenue Tracking

Query founders conversions:
```sql
SELECT 
  plan_id,
  COUNT(*) as conversions,
  SUM(CASE WHEN plan_id = 'starter' THEN 99 
           WHEN plan_id = 'growth' THEN 199 
           WHEN plan_id = 'domination' THEN 399 
           ELSE 0 END) as mrr
FROM founders_deal_eligibility
WHERE converted_at IS NOT NULL
GROUP BY plan_id;
```
























































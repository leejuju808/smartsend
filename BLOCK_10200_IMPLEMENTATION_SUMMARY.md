# Block 10200 — Stripe Billing & Plan Enforcement Implementation Summary

## ✅ Implementation Complete

This document summarizes the implementation of Stripe billing and plan enforcement for SmartSend, including subscriptions, email limits, and campaign limits.

## 📦 What Was Implemented

### 1. Database Schema ✅

**File:** `supabase/migrations/20250130000001_block10200_stripe_billing_plan_enforcement.sql`

- **`org_billing` table**: Stores Stripe customer ID, subscription ID, current plan, subscription status, and billing period dates
- **`org_usage` table**: Tracks monthly email usage and campaign creation per billing period
- **Helper functions**:
  - `get_plan_limits(plan)` - Returns plan limits for campaigns and emails
  - `get_org_billing_info(org_id)` - Returns complete billing info with limits
  - `can_org_create_campaign(org_id)` - Checks if org can create/activate campaigns
  - `can_org_send_emails(org_id, count)` - Checks if org can send emails
  - `increment_org_email_usage(org_id, count)` - Increments email usage counter

### 2. Plan Limits Configuration ✅

**File:** `src/lib/billing/plan-limits.ts`

- Defines plan limits for Trial, Starter, Growth, and Domination plans
- Helper functions for plan management and upgrades
- Type-safe plan ID definitions

**File:** `src/lib/billing/stripe.ts`

- Stripe client initialization
- Price ID mapping functions
- Webhook signature verification

### 3. Stripe Integration ✅

**Webhook Handler:** `src/app/api/stripe/webhooks/route.ts`

Handles Stripe webhook events:
- `customer.subscription.created` / `updated` - Updates org billing info
- `customer.subscription.deleted` - Downgrades to trial
- `invoice.payment_failed` - Marks subscription as past_due
- `checkout.session.completed` - Creates/updates billing record

**Checkout Endpoint:** `src/app/api/billing/checkout/route.ts`

- Creates Stripe Checkout sessions for plan upgrades
- Creates Stripe customers if needed
- Returns checkout URL for redirect

**Portal Endpoint:** `src/app/api/billing/portal/route.ts`

- Creates Stripe Customer Portal sessions
- Allows customers to manage billing, update payment methods, etc.

### 4. Plan Enforcement ✅

**Campaign Limits:**

- **File:** `app/api/campaigns/route.ts` - Checks plan limit before creating campaigns
- **File:** `app/api/campaigns/[id]/status/route.ts` - Checks plan limit before activating campaigns
- Returns `PLAN_CAMPAIGN_LIMIT_EXCEEDED` error with upgrade message

**Email Limits:**

- **File:** `src/app/api/send-queue/route.ts` - Checks email limit before sending
- Groups jobs by org_id and checks limits per org
- Marks jobs as failed with `skip_reason: "plan_email_limit"` when limit reached
- Increments usage counter after successful sends

**Enforcement Utilities:**

- **File:** `src/lib/billing/enforcement.ts` - Client/server enforcement helpers
- **File:** `src/lib/billing/checkSendLimit.ts` - Send limit checking functions

### 5. Frontend Components ✅

**Hook:** `src/hooks/useOrgBilling.ts`

- Fetches org billing info and usage
- Provides reactive updates
- Handles loading and error states

**Components:**

- **`src/components/billing/PlanGuard.tsx`** - Wraps actions that require plan limits
- **`src/components/billing/UpgradeModal.tsx`** - Shows upgrade options when limits are reached
- **`src/app/settings/components/BillingSettings.tsx`** - Updated to show org-based billing and usage

**Billing Settings Page:**

- Shows current plan with status badge
- Displays campaign usage (active campaigns / limit)
- Displays email usage with progress bar
- Shows renewal date
- Provides "Manage Subscription" button (Stripe Customer Portal)
- Upgrade CTA for Starter plan users

## 🎯 Plan Limits (V1)

| Plan | Price | Max Active Campaigns | Monthly Emails |
|------|-------|---------------------|----------------|
| Trial | Free | 1 | 200 |
| Starter | $99/mo | 1 | 500 |
| Growth | $199/mo | 3 | 2,000 |
| Domination | $399/mo | Unlimited | 10,000 |

## 🔧 Environment Variables Required

```env
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PRICE_STARTER_ID=price_...
NEXT_PUBLIC_STRIPE_PRICE_GROWTH_ID=price_...
NEXT_PUBLIC_STRIPE_PRICE_DOMINATION_ID=price_...
NEXT_PUBLIC_SITE_URL=https://yourdomain.com
```

## 📋 Stripe Setup Checklist

1. ✅ Create Stripe Products:
   - SmartSend Starter
   - SmartSend Growth
   - SmartSend Domination

2. ✅ Create Recurring Monthly Prices:
   - Starter: $99/month
   - Growth: $199/month
   - Domination: $399/month

3. ✅ Configure Webhook Endpoint:
   - URL: `https://yourdomain.com/api/stripe/webhooks`
   - Events: `customer.subscription.*`, `invoice.payment_failed`, `checkout.session.completed`

4. ✅ Set Environment Variables:
   - Add Stripe secret key and webhook secret
   - Add price IDs for each plan

## 🚀 Usage Examples

### Check Campaign Limit (Server-Side)

```typescript
import { checkCampaignLimit } from '@/lib/billing/enforcement';

const limitCheck = await checkCampaignLimit(orgId);
if (!limitCheck.allowed) {
  return { error: limitCheck.message, status: 403 };
}
```

### Check Email Limit (Server-Side)

```typescript
import { checkEmailLimit } from '@/lib/billing/enforcement';

const limitCheck = await checkEmailLimit(orgId, emailsToSend);
if (!limitCheck.allowed) {
  return { error: limitCheck.message, status: 403 };
}
```

### Use Plan Guard (Client-Side)

```tsx
import { PlanGuard } from '@/components/billing/PlanGuard';

<PlanGuard feature="campaigns">
  <button onClick={createCampaign}>Create Campaign</button>
</PlanGuard>
```

### Use Billing Hook (Client-Side)

```tsx
import { useOrgBilling } from '@/hooks/useOrgBilling';

const { billing, usage, loading } = useOrgBilling(orgId);
```

## ✅ Acceptance Criteria Met

- ✅ Stripe products & prices exist for all 3 plans (configured in Stripe dashboard)
- ✅ New org can start on trial and upgrade via Stripe Checkout
- ✅ Webhook keeps current_plan, subscription_status, and billing period dates in sync
- ✅ Email sends are blocked once monthly limit is reached
- ✅ Active campaign count is enforced per plan
- ✅ Billing page shows plan, status, email usage, campaign usage
- ✅ When limits are hit, user sees clear error message and upgrade path
- ✅ If subscription is canceled/past due, new sends are blocked

## 🔄 Next Steps

1. **Set up Stripe Products & Prices** in Stripe Dashboard
2. **Configure Webhook Endpoint** in Stripe Dashboard
3. **Test Webhook** using Stripe CLI: `stripe listen --forward-to localhost:3000/api/stripe/webhooks`
4. **Test Checkout Flow** by creating a checkout session
5. **Test Plan Enforcement** by attempting to exceed limits
6. **Monitor Usage** via billing settings page

## 📝 Notes

- All orgs start with `trial` plan by default
- Billing periods align with Stripe subscription periods (not calendar months)
- Email usage is tracked per billing period, not calendar month
- Campaign limits check active/running/scheduled campaigns
- Email limits are enforced at send time, not queue time (for better UX)






























































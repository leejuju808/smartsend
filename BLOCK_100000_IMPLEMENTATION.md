# BLOCK 100000 — Subscription System + Billing Enforcement + Usage Limits v1

## ✅ Implementation Complete

This block implements a full billing and subscription system that ensures roofing companies pay, stay subscribed, and get cut off when they exceed their plan limits.

## 🗄️ Database Schema

### Tables Created

1. **`subscriptions`** - User subscription information synced from Stripe
   - `user_id` (references auth.users)
   - `stripe_customer_id`
   - `stripe_subscription_id`
   - `plan_key` (starter, growth, domination)
   - `status` (active, past_due, canceled, trialing, incomplete)
   - `current_period_end`

2. **`plan_limits`** - Plan limits configuration
   - `plan_key` (starter, growth, domination)
   - `max_emails` (500, 2000, 999999)
   - `max_campaigns` (1, 3, 999)
   - `priority_support` (boolean)

3. **`email_usage`** - Monthly email usage tracking
   - `user_id` (references auth.users)
   - `count` (emails sent this month)
   - `period_start` / `period_end` (month boundaries)

### Database Functions

- `get_or_create_current_usage(user_id)` - Gets or creates current month usage record
- `increment_email_usage(user_id)` - Increments email count after send
- `check_email_limit(user_id)` - Returns whether user can send and remaining count

## 🔌 API Routes

### 1. Checkout Session (`/app/api/billing/checkout/route.ts`)
- Creates Stripe checkout session for subscription
- Accepts: `{ plan_key: "starter" | "growth" | "domination", user_id?: string }`
- Returns: `{ url: string }` (Stripe checkout URL)

### 2. Webhook Handler (`/app/api/billing/webhook/route.ts`)
- Handles Stripe webhook events:
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `invoice.paid`
  - `customer.subscription.deleted`
- Syncs subscription status to database
- Uses `subscription.metadata.user_id` to identify user

### 3. Billing Portal (`/app/api/billing/portal/route.ts`)
- Creates Stripe billing portal session
- Allows users to manage subscription, payment methods, invoices
- Returns: `{ url: string }` (portal URL)

### 4. Usage Warning (`/app/api/billing/usage-warning/route.ts`)
- Returns current usage warning status for UI banners
- Returns: `{ warning: { type, message, remaining } | null }`

## 🛡️ Enforcement Logic

### Email Sending Enforcement (`/src/app/api/send/route.ts`)
- **Before sending**: Checks email limit using `checkEmailLimit()`
- **Blocks if over limit**: Returns 403 with error message
- **After successful send**: Increments usage with `incrementEmailUsage()`

### Helper Library (`/src/lib/billing/block100000-enforcement.ts`)
- `getUserSubscriptionAndLimits(userId)` - Gets subscription and plan limits
- `getCurrentEmailUsage(userId)` - Gets current month usage
- `checkEmailLimit(userId)` - Enforcement check (returns canSend, reason, remaining)
- `incrementEmailUsage(userId)` - Increments usage after send
- `getUsageWarning(userId)` - Returns warning for UI banners

## 🎨 UI Components

### Usage Warning Banner (`/src/components/billing/UsageWarningBanner.tsx`)
- Shows warnings when approaching/hitting limits
- Types: `error` (limit reached), `warning` (80%+ usage), `info` (50%+ usage)
- Includes upgrade CTAs

### Upgrade Prompt Banner
- Upsell messages for plan features
- Shows plan benefits and upgrade button

## 📋 Setup Instructions

### 1. Environment Variables

Add to your `.env` file:

```bash
# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Stripe Price IDs (create these in Stripe Dashboard)
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_GROWTH=price_...
STRIPE_PRICE_DOMINATION=price_...

# App URL
APP_URL=https://yourdomain.com
# or
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

### 2. Stripe Setup

1. **Create Products & Prices** in Stripe Dashboard:
   - Starter Plan (500 emails/mo, 1 campaign)
   - Growth Plan (2000 emails/mo, 3 campaigns)
   - Domination Plan (unlimited)

2. **Set Price Lookup Keys** (important for webhook):
   - Set `lookup_key` to: `starter`, `growth`, `domination`
   - Or update webhook to use price ID mapping

3. **Configure Webhook**:
   - Endpoint: `https://yourdomain.com/api/billing/webhook`
   - Events to listen for:
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.paid`

### 3. Run Migration

```bash
# Apply the migration
supabase migration up
# or
npx supabase db push
```

### 4. Add UI Banners (Optional)

Add to your dashboard layout:

```tsx
import { UsageWarningBanner } from "@/components/billing/UsageWarningBanner";

// In your layout component
<UsageWarningBanner />
```

## 🔄 How It Works

1. **User subscribes** → Stripe checkout → Webhook creates `subscriptions` record
2. **User sends email** → System checks limit → Blocks if over → Increments usage
3. **Usage resets** → Automatically at start of each month (new period created on first send)
4. **Warnings shown** → UI banners when approaching limits

## 📊 Plan Limits

| Plan | Emails/Month | Campaigns | Priority Support |
|------|-------------|-----------|------------------|
| Starter | 500 | 1 | ❌ |
| Growth | 2,000 | 3 | ✅ |
| Domination | 999,999 | 999 | ✅ |

## 🚨 Hard Enforcement

- **Email sending is BLOCKED** when limit is reached (403 error)
- **No soft limits** - users must upgrade to continue
- **Usage tracked per month** - resets automatically

## 🎯 Next Steps

1. ✅ Database schema created
2. ✅ API routes implemented
3. ✅ Enforcement logic added
4. ✅ UI components created
5. ⏳ Set up Stripe products/prices
6. ⏳ Configure webhook endpoint
7. ⏳ Test checkout flow
8. ⏳ Test webhook events
9. ⏳ Add banners to dashboard

## 🔍 Testing

### Test Checkout:
```bash
curl -X POST http://localhost:3000/api/billing/checkout \
  -H "Content-Type: application/json" \
  -d '{"plan_key": "starter"}'
```

### Test Webhook (using Stripe CLI):
```bash
stripe listen --forward-to localhost:3000/api/billing/webhook
stripe trigger customer.subscription.created
```

### Test Enforcement:
- Send emails up to limit
- Verify blocking at limit
- Check usage increments

## 📝 Notes

- Usage records are created automatically on first send of each month
- Monthly reset happens automatically (no cron needed for basic functionality)
- Webhook uses `subscription.metadata.user_id` - ensure this is set in checkout
- All enforcement uses service role for reliability

---

**BLOCK 100000 COMPLETE** ✅

This turns SmartSend into a cash-flow machine. Roofers pay, stay subscribed, and get cut off when they exceed limits. Real SaaS. Real money.



























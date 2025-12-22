# Block 12000 — SmartSend Billing & Subscription Enforcement v1

**The System That Ensures Roofers Pay + No One Gets Free Unlimited Usage**

This block implements comprehensive billing and subscription enforcement for SmartSend, ensuring that roofers pay for their plans and preventing free unlimited usage.

## Overview

Block 12000 provides:
- ✅ Automatic subscription management via Stripe
- ✅ Plan limit enforcement (campaigns, emails)
- ✅ Feature locking for inactive subscriptions
- ✅ Usage tracking and billing transparency
- ✅ Billing page UI for contractors

## Plan Tiers

### Starter — $99/mo
- **Limits:**
  - 1 active campaign
  - 500 emails/month
  - Basic AI (no advanced follow-up logic)
  - No revenue dashboard

### Growth — $199/mo
- **Limits:**
  - 3 active campaigns
  - 2,000 emails/month
  - Advanced AI follow-ups
  - Priority support

### Domination — $399/mo
- **Limits:**
  - Unlimited campaigns
  - Unlimited smart automation
  - Full revenue dashboard
  - VIP onboarding
  - Highest sending limit (based on domain health)

## Database Schema

### Tables Created

1. **`subscriptions`** — User subscription records
   - `user_id` — Links to auth.users
   - `plan` — starter | growth | domination
   - `stripe_customer_id` — Stripe customer ID
   - `stripe_subscription_id` — Stripe subscription ID
   - `status` — active | past_due | canceled | incomplete | trialing
   - `current_period_end` — Subscription renewal date

2. **`plan_limits`** — Plan limit configuration
   - Defines max campaigns, emails, and feature flags per plan

3. **`email_usage`** — Monthly email usage tracking
   - Tracks emails sent per user per month

### Database Functions

- `get_user_subscription_status(user_id)` — Get subscription status
- `can_user_create_campaign(user_id)` — Check campaign limit
- `can_user_send_email(user_id)` — Check email limit
- `increment_email_usage(user_id)` — Increment usage counter

## Stripe Webhook Integration

The webhook handler (`src/app/api/stripe/webhook/route.ts`) handles:

- `customer.subscription.created` — Create subscription record
- `customer.subscription.updated` — Update subscription status
- `customer.subscription.deleted` — Mark subscription as canceled
- `invoice.payment_succeeded` — Reactivate subscription
- `invoice.payment_failed` — Mark as past_due and stop sending

### Webhook Setup

1. In Stripe Dashboard, create a webhook endpoint:
   - URL: `https://your-domain.com/api/stripe/webhook`
   - Events: `customer.subscription.*`, `invoice.payment_*`

2. Set environment variable:
   ```bash
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

## Subscription Enforcement

### Middleware Functions

Located in `src/lib/billing/subscription-middleware.ts`:

- `requireActiveSubscription(userId)` — Check if subscription is active
- `requireCampaignLimit(userId)` — Check campaign limit
- `requireEmailLimit(userId)` — Check email limit
- `requireSubscriptionAndCampaignLimit(userId)` — Combined check
- `requireSubscriptionAndEmailLimit(userId)` — Combined check

### Usage in API Routes

```typescript
import { requireSubscriptionAndCampaignLimit } from "@/lib/billing/subscription-middleware";

export async function POST(req: NextRequest) {
  const { user } = await getAuthenticatedUser();
  
  // Check subscription and limits
  const limitCheck = await requireSubscriptionAndCampaignLimit(user.id);
  if (limitCheck) {
    return limitCheck; // Returns 403 with error message
  }
  
  // Proceed with campaign creation...
}
```

### Enforcement Logic

**If subscription = inactive:**
- ✅ Stop send_queue worker (campaigns paused)
- ✅ Disable campaign builder
- ✅ Disable follow-ups
- ✅ Show "Subscription inactive" message

**If email limit reached:**
- ✅ Stop new sends
- ✅ Continue follow-ups (optional)
- ✅ Show "Email limit reached" banner

**If campaign limit reached:**
- ✅ Block creation of new campaigns
- ✅ Show upgrade modal

## Billing Page

Located at `/billing`, the billing page shows:

- 🔹 Current Plan (Starter/Growth/Domination)
- 🔹 Renewal Date
- 🔹 Status (Active/Past Due/Canceled)
- 🔹 Usage Stats
  - Emails this month: X / Y
  - Active Campaigns: X / Y
- 🔹 Action Buttons
  - Upgrade
  - Manage Subscription (Stripe Portal)
  - View Invoices

## API Routes

### Checkout
- **POST** `/api/billing/checkout`
  - Body: `{ plan: "starter" | "growth" | "domination" }`
  - Creates Stripe checkout session

### Portal Session
- **POST** `/api/stripe/create-portal-session-block12000`
  - Creates Stripe billing portal session for managing subscription

### Example Routes
- `/api/campaigns/create-block12000` — Example campaign creation with enforcement
- `/api/send/block12000` — Example email sending with enforcement

## Environment Variables

Required environment variables:

```bash
# Stripe
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Stripe Price IDs (create these in Stripe Dashboard)
STRIPE_PRICE_STARTER_ID=price_...
STRIPE_PRICE_GROWTH_ID=price_...
STRIPE_PRICE_DOMINATION_ID=price_...
```

## Migration

Run the migration to create tables and functions:

```bash
supabase migration up
```

Or apply manually:
```bash
psql -f supabase/migrations/20250130000001_block12000_billing_subscription_enforcement.sql
```

## Usage Examples

### Check Subscription Status

```typescript
import { getUserSubscription } from "@/lib/billing/subscription-enforcement";

const subscription = await getUserSubscription(userId);
if (!subscription?.is_active) {
  // Show upgrade prompt
}
```

### Check Campaign Limit

```typescript
import { canCreateCampaign } from "@/lib/billing/subscription-enforcement";

const check = await canCreateCampaign(userId);
if (!check.can_create) {
  // Show upgrade modal with check.reason
}
```

### Increment Email Usage

```typescript
import { incrementEmailUsage } from "@/lib/billing/subscription-enforcement";

// After successfully sending an email
await incrementEmailUsage(userId);
```

## Integration Points

### Campaign Creation
Add subscription check before creating campaigns:
```typescript
const limitCheck = await requireSubscriptionAndCampaignLimit(userId);
if (limitCheck) return limitCheck;
```

### Email Sending
Add subscription and email limit check before sending:
```typescript
const limitCheck = await requireSubscriptionAndEmailLimit(userId);
if (limitCheck) return limitCheck;
await incrementEmailUsage(userId);
```

### Send Queue Worker
Check subscription status before processing queue items:
```typescript
const subscription = await getUserSubscription(userId);
if (!subscription?.is_active) {
  // Skip sending, mark as paused
}
```

## Testing

1. **Create Test Subscription:**
   - Use Stripe test mode
   - Create checkout session with test card: `4242 4242 4242 4242`

2. **Test Limits:**
   - Create campaigns up to limit
   - Try to create one more (should fail)
   - Send emails up to monthly limit
   - Try to send one more (should fail)

3. **Test Webhooks:**
   - Use Stripe CLI: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
   - Trigger events: `stripe trigger customer.subscription.created`

## Troubleshooting

### Subscription Not Updating
- Check webhook endpoint is configured correctly
- Verify `STRIPE_WEBHOOK_SECRET` matches Stripe dashboard
- Check webhook logs in Stripe dashboard

### Limits Not Enforcing
- Verify migration ran successfully
- Check `plan_limits` table has correct values
- Verify RPC functions exist: `can_user_create_campaign`, `can_user_send_email`

### Billing Page Not Loading
- Check user is authenticated
- Verify `subscriptions` table has RLS policies
- Check browser console for errors

## Next Steps

1. **Set Stripe Price IDs** in environment variables
2. **Configure Webhook** in Stripe Dashboard
3. **Run Migration** to create tables
4. **Integrate Middleware** into existing API routes
5. **Test** subscription flow end-to-end

## Files Created

- `supabase/migrations/20250130000001_block12000_billing_subscription_enforcement.sql`
- `src/lib/billing/subscription-enforcement.ts`
- `src/lib/billing/subscription-middleware.ts`
- `app/billing/page.tsx`
- `app/api/billing/checkout/route.ts`
- `app/api/stripe/create-portal-session-block12000/route.ts`
- `app/api/campaigns/create-block12000/route.ts` (example)
- `app/api/send/block12000/route.ts` (example)

## Support

For issues or questions, check:
- Stripe webhook logs
- Database function logs
- API route error logs






















































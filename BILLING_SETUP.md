# Billing Implementation Setup Guide

This guide walks you through setting up the complete billing system with Stripe integration.

## Files Created

### Database Migration
- `supabase/migrations/20251009_billing.sql` - Adds billing fields to profiles table and creates helper views

### Core Infrastructure
- `lib/stripe.ts` - Stripe client initialization
- `lib/supabaseAdmin.ts` - Supabase admin client for server-side operations

### API Routes
- `src/app/api/billing/checkout/route.ts` - Creates Stripe Checkout sessions
- `src/app/api/billing/portal/route.ts` - Creates Stripe Billing Portal sessions
- `src/app/api/webhooks/stripe/route.ts` - Handles Stripe webhook events

### Feature Guards
- `src/app/api/send/guard/route.ts` - Pre-send validation with subscription check
- `src/app/api/send/enqueue/route.ts` - Message enqueuing with subscription check
- `src/app/api/contacts/import/route.ts` - Contact import with subscription check (updated)

### UI Components
- `src/app/(dashboard)/billing/page.tsx` - Billing management UI
- `src/app/(dashboard)/layout.tsx` - Dashboard layout with optional paywall redirect

## Environment Variables

Add these to your `.env.local`:

```bash
# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Supabase (already configured)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Stripe
STRIPE_SECRET_KEY=sk_test_... # or sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PRICE_ID=price_... # Recurring subscription price ID
```

## Setup Steps

### 1. Apply Database Migration

```bash
supabase db push
```

This will:
- Add `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`, and `current_period_end` to the `profiles` table
- Create a `v_profile_access` view for easy subscription status checks
- Create an optional `plan_catalog` table for price metadata

### 2. Configure Stripe

#### Create a Product & Price
1. Go to [Stripe Dashboard](https://dashboard.stripe.com/products)
2. Create a new product (e.g., "SmartSend Pro")
3. Add a recurring price (e.g., $29/month)
4. Copy the **Price ID** (starts with `price_`) to `NEXT_PUBLIC_STRIPE_PRICE_ID`

#### Set Up Webhook
1. Go to [Stripe Webhooks](https://dashboard.stripe.com/webhooks)
2. Click "Add endpoint"
3. Set URL to: `https://YOUR_DOMAIN/api/webhooks/stripe` (or use ngrok for local testing)
4. Select these events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. Copy the **Webhook Secret** (starts with `whsec_`) to `STRIPE_WEBHOOK_SECRET`

### 3. Install Dependencies (if needed)

```bash
pnpm add stripe
pnpm add csv-parser
pnpm add -D @types/csv-parser
```

### 4. Update Session Handling

Replace `'USER_PROFILE_ID'` in these files with actual user session data:

**src/app/(dashboard)/billing/page.tsx:**
```typescript
// Get from your auth context/session
const profileId = session?.user?.id || ''
```

**src/app/(dashboard)/layout.tsx:**
```typescript
// Get from Supabase auth
const { data: { user } } = await supabase.auth.getUser()
const profileId = user?.id
```

## Testing

### Test Subscription Flow

1. Start dev server:
   ```bash
   pnpm dev
   ```

2. Visit `/billing`

3. Click "Subscribe" → should redirect to Stripe Checkout

4. Use test card: `4242 4242 4242 4242` (any future expiry, any CVC)

5. Complete checkout → redirects to `/billing?state=success`

6. Check your database:
   ```sql
   SELECT 
     id,
     stripe_customer_id,
     stripe_subscription_id,
     subscription_status,
     current_period_end
   FROM profiles;
   ```

   Should see:
   - `subscription_status` = 'active' or 'trialing'
   - `current_period_end` set to future date

### Test Feature Gating

**Without Subscription:**
```bash
curl -X POST http://localhost:3000/api/send/guard \
  -H "Content-Type: application/json" \
  -d '{
    "profile_id": "USER_ID",
    "sender_id": "SENDER_ID",
    "recipients": [{"email": "test@example.com"}]
  }'
```

Expected response:
```json
{
  "error": "Subscription required. Visit /billing to subscribe."
}
```

**With Active Subscription:**
Same request should return:
```json
{
  "allowed": [...],
  "blocked": [...],
  "limits": {...}
}
```

### Test Portal Access

1. Visit `/billing`
2. Click "Manage Billing" → should redirect to Stripe Portal
3. Can cancel/update subscription there
4. Changes sync back via webhook

## How It Works

### Subscription Flow

1. **User subscribes:**
   - `/api/billing/checkout` creates Stripe Customer (if needed)
   - Creates Checkout Session
   - Redirects to Stripe

2. **User completes payment:**
   - Stripe sends `checkout.session.completed` webhook
   - `/api/webhooks/stripe` receives event
   - Updates profile with subscription data

3. **Subscription updates:**
   - Stripe sends `customer.subscription.updated` webhook
   - Profile `subscription_status` syncs automatically

### Feature Gating

All paid features check `subscription_status` before processing:

```typescript
async function assertActive(profile_id: string) {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('subscription_status')
    .eq('id', profile_id)
    .maybeSingle()
  
  const ok = data?.subscription_status === 'active' || 
             data?.subscription_status === 'trialing'
  
  if (!ok) throw new Error('Subscription required...')
}
```

Protected endpoints:
- `/api/send/guard` - Pre-send validation
- `/api/send/enqueue` - Message queuing
- `/api/contacts/import` - CSV import

### Dashboard Protection (Optional)

The `(dashboard)/layout.tsx` can optionally redirect all dashboard access to `/billing` for non-paying users.

## Subscription Statuses

The system recognizes these Stripe subscription statuses:

- ✅ **active** - Paid, full access
- ✅ **trialing** - Trial period, full access
- ❌ **past_due** - Payment failed, blocked
- ❌ **canceled** - Subscription ended, blocked
- ❌ **incomplete** - Payment incomplete, blocked
- ❌ **incomplete_expired** - Payment expired, blocked
- ❌ **unpaid** - Unpaid, blocked

## Next Steps

1. **Wire up auth session** - Replace `'USER_PROFILE_ID'` placeholders
2. **Test webhook locally** - Use Stripe CLI or ngrok
3. **Deploy to production** - Set production Stripe keys
4. **Add usage tracking** - Monitor MB/100 metric
5. **Create upgrade prompts** - Show paywall in UI at strategic points

## Why This Implementation

- ✅ **Turns on revenue** - Stripe Checkout + Webhook = paid conversions
- ✅ **Protects delivery** - Paywall ensures serious usage, healthier sender pools
- ✅ **Keeps wedge tight** - Only gates features that impact meetings booked
- ✅ **Supports North Star** - Direct path to MB/100 → $1M ARR

## Troubleshooting

### Webhook not firing locally
Use Stripe CLI to forward webhooks:
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

### Subscription not updating
Check webhook logs in Stripe Dashboard → Developers → Webhooks

### 402 errors on API calls
Verify `subscription_status` in database:
```sql
SELECT subscription_status FROM profiles WHERE id = 'USER_ID';
```

### Portal link not working
Ensure `stripe_customer_id` is set on profile:
```sql
SELECT stripe_customer_id FROM profiles WHERE id = 'USER_ID';
```

## Support

For issues or questions, check:
- [Stripe Documentation](https://stripe.com/docs)
- [Supabase Documentation](https://supabase.com/docs)
- Project documentation in `/docs`

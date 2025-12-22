# 🚀 Billing System - Quick Start

Your complete Stripe billing system has been implemented! Here's what you need to do to get it running.

## ✅ What's Been Created

### Database
- `supabase/migrations/20250110000000_add_billing_to_profiles.sql` - Adds billing fields to profiles

### API Routes
- `src/app/api/stripe/create-checkout-session/route.ts` - Create subscription checkouts
- `src/app/api/stripe/create-portal-session/route.ts` - Customer portal access
- `src/app/api/stripe/webhook/route.ts` - Webhook handler for subscription events

### Libraries
- `src/lib/stripe.ts` - Stripe client configuration
- `src/lib/subscription.ts` - Helper functions to check billing status

### UI Components
- `src/app/dashboard/billing/page.tsx` - Full billing dashboard
- `src/components/billing/UpgradeGate.tsx` - Upgrade prompt components

## 🏃 Quick Setup (5 minutes)

### 1. Install Stripe Package
```bash
pnpm add stripe
```

### 2. Run Database Migration
```bash
# Option A: Via Supabase CLI
supabase db push

# Option B: In Supabase SQL Editor
# Copy and paste contents of: supabase/migrations/20250110000000_add_billing_to_profiles.sql
```

### 3. Get Stripe Keys

1. **Sign up/login** at https://dashboard.stripe.com
2. Go to **Developers > API keys**
3. Copy both keys (use Test mode for now)

### 4. Create Your Product

1. Go to **Products** in Stripe Dashboard
2. Click **Add product**
3. Enter:
   - Name: `Pro Monthly`
   - Price: `$XX.XX` recurring monthly
4. Save and copy the **Price ID** (starts with `price_`)

### 5. Set Environment Variables

Add to your `.env.local`:

```bash
# Stripe Keys (from step 3)
STRIPE_SECRET_KEY=sk_test_xxxxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx

# Price ID (from step 4)
NEXT_PUBLIC_STRIPE_PRICE_ID=price_xxxxx

# Webhook Secret (get in next step)
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
```

### 6. Setup Webhooks (Local Testing)

Install Stripe CLI:
```bash
brew install stripe/stripe-cli/stripe
stripe login
```

In a separate terminal, run:
```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Copy the webhook secret (starts with `whsec_`) to your `.env.local`

### 7. Start Dev Server
```bash
pnpm dev
```

## ✨ Test It Out

1. Visit `http://localhost:3000/dashboard/billing`
2. Click "Upgrade to Pro"
3. Use test card: `4242 4242 4242 4242`
4. Complete checkout
5. Check your database - `subscription_status` should be `active` or `trialing`!

## 🎯 Using It In Your App

### Check if user is paid:
```typescript
import { getEffectiveBilling } from "@/lib/subscription";

const { is_paid, monthly_send_cap } = await getEffectiveBilling(user_id);

if (!is_paid) {
  // Show upgrade prompt
}
```

### Show upgrade gate:
```tsx
import { UpgradeGate } from "@/components/billing/UpgradeGate";

<UpgradeGate reason="cap" />
```

## 🐛 Troubleshooting

**Webhook not working?**
- Make sure `stripe listen` is running
- Check the webhook secret matches in `.env.local`

**Checkout fails?**
- Verify all environment variables are set
- Check Stripe Dashboard > Logs for errors

**Database not updating?**
- Verify migration ran successfully
- Check Supabase logs

## 📚 Full Documentation

See `STRIPE_BILLING_SETUP.md` for complete documentation, production deployment guide, and advanced usage.

---

**Need help?** Check the troubleshooting section in STRIPE_BILLING_SETUP.md

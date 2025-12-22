# SmartSend Live Cutover Pack — LIVE Payments (No Test Mode)

This guide will take SmartSend LIVE with real payments. It standardizes on the App Router, wires Stripe LIVE Checkout + Webhooks, updates Supabase, and preps Vercel deploy.

## 🚀 What's Been Implemented

✅ **Enhanced Stripe Helper** (`src/lib/stripe.ts`)
- Environment validation
- Checkout session creation
- Customer portal session creation
- Proper error handling

✅ **Supabase Admin Helper** (`src/lib/supabaseAdmin.ts`)
- Server-side operations only
- User subscription updates
- Profile management
- Secure admin client

✅ **LIVE Checkout Route** (`src/app/api/billing/checkout/route.ts`)
- Authentication required
- Plan selection (monthly/annual)
- Stripe checkout session creation
- User profile creation

✅ **LIVE Webhook Route** (`src/app/api/webhook/route.ts`)
- Stripe signature verification
- Handles all subscription events
- Updates Supabase profiles
- Error handling and logging

✅ **Billing Portal Route** (`src/app/api/billing/portal/route.ts`)
- Customer portal access
- Subscription management
- Secure authentication

✅ **Environment Template** (`env.template`)
- All required variables
- LIVE configuration ready

## 📋 Prerequisites (Do Once)

### 1. Stripe Dashboard Setup
- Go to [Stripe Dashboard](https://dashboard.stripe.com)
- Create LIVE Product + LIVE Price(s)
- Copy the `price_...` ID(s)
- Note: Use LIVE keys, NOT test keys

### 2. Domain Selection
- Choose your live domain (e.g., `https://smartsendai.com`)
- Ensure Vercel project is connected and ready

### 3. Dependencies
All required packages are already installed:
- `stripe` (^18.4.0)
- `@supabase/supabase-js` (^2.53.0)
- `@supabase/auth-helpers-nextjs` (^0.10.0)

## 🔧 Environment Setup

### Local Development
1. Copy `env.template` to `.env.local`
2. Fill in your LIVE values:

```bash
# Site Configuration
NEXT_PUBLIC_SITE_URL=https://smartsendai.com
NEXT_PUBLIC_APP_URL=https://smartsendai.com

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Stripe LIVE Configuration
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
NEXT_PUBLIC_STRIPE_PRICE_ID=price_live_...
STRIPE_ANNUAL_PRICE_ID=price_live_...

# Stripe Webhook Secret
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Vercel Production
1. Go to Vercel → Your Project → Settings → Environment Variables
2. Add ALL the same keys from `.env.local`
3. **Never expose `SUPABASE_SERVICE_ROLE_KEY` on the client**

## 🗄️ Database Schema Requirements

Ensure your `profiles` table has these columns:

```sql
-- Add if missing
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'free';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_tier TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT FALSE;
```

## 🔗 Stripe Dashboard Webhook Setup

### 1. Create Webhook Endpoint
- Go to [Stripe Dashboard → Developers → Webhooks](https://dashboard.stripe.com/webhooks)
- Click "Add endpoint"
- Endpoint URL: `https://YOUR_LIVE_DOMAIN/api/webhook`

### 2. Listen to Events
Select these events:
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

### 3. Get Webhook Secret
- After creating, copy the "Signing secret"
- Set as `STRIPE_WEBHOOK_SECRET` in Vercel + `.env.local`

## 🧪 Testing the Implementation

### Local Testing
```bash
npm run dev
```

1. Visit `/dashboard/billing`
2. Click "Upgrade" → should redirect to Stripe Checkout
3. Use Stripe test card: `4242 4242 4242 4242`

### Production Testing
1. Deploy to Vercel
2. Test webhook endpoint: `GET https://YOUR_DOMAIN/api/health`
3. Test checkout flow with real card
4. Verify webhook events in Stripe Dashboard
5. Check Supabase profiles table for updates

## 🚀 Deploy to Vercel

### 1. Push Code
```bash
git add .
git commit -m "feat: implement live stripe integration"
git push origin main
```

### 2. Vercel Auto-Deploy
- Vercel will automatically deploy on push
- Ensure all environment variables are set in Vercel

### 3. Post-Deploy Verification
- ✅ Health check: `https://YOUR_DOMAIN/api/health`
- ✅ Billing page loads: `/dashboard/billing`
- ✅ Checkout redirects to Stripe
- ✅ Webhook receives events
- ✅ Supabase profiles update

## 🔒 Security Checklist

- [ ] `SUPABASE_SERVICE_ROLE_KEY` is server-only
- [ ] Stripe webhook signature verification enabled
- [ ] All routes require authentication
- [ ] Environment variables not exposed to client
- [ ] HTTPS enforced in production

## 🎯 Next Steps (After LIVE Works)

### Immediate (Next 60-120 minutes)
1. **Replace placeholder values** with real auth data
2. **Add account page** showing plan + cancel link
3. **Implement annual pricing** with 2-3 months free
4. **Capture company info** in checkout (if relevant)

### Future Enhancements
1. **Dunning emails** for failed payments
2. **Automatic tax** in Stripe for global customers
3. **Receipt branding** in Stripe dashboard
4. **Usage tracking** and metered billing
5. **Team seat management**

## 🚨 Troubleshooting

### Common Issues

**Webhook 400 Error**
- Check `STRIPE_WEBHOOK_SECRET` is correct
- Verify webhook endpoint URL is accessible
- Ensure webhook is listening to correct events

**Checkout Fails**
- Verify `STRIPE_SECRET_KEY` is LIVE (not test)
- Check `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is LIVE
- Ensure price IDs exist in Stripe

**Database Updates Fail**
- Verify `SUPABASE_SERVICE_ROLE_KEY` has write permissions
- Check profiles table schema matches requirements
- Ensure user profiles exist before subscription updates

### Debug Commands
```bash
# Check environment variables
npm run build

# Test webhook locally (if needed)
stripe listen --forward-to localhost:3000/api/webhook

# Verify Stripe connection
curl -H "Authorization: Bearer $STRIPE_SECRET_KEY" \
  https://api.stripe.com/v1/account
```

## 🎉 Success Criteria

You're LIVE when:
- ✅ Real payments can be collected
- ✅ Webhooks update Supabase automatically
- ✅ Users can upgrade/downgrade/cancel
- ✅ Billing portal works for existing customers
- ✅ No test mode dependencies remain

## 🆘 Support

If you encounter issues:
1. Check Stripe Dashboard → Events for webhook failures
2. Verify environment variables in Vercel
3. Check Supabase logs for database errors
4. Review browser console for client-side errors

---

**🚀 Ready to ship? Deploy and start collecting real money TODAY!** 
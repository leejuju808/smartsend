# 🚀 SmartSend Live Deployment Checklist

## Pre-Deploy (Local)
- [ ] Copy `env.template` to `.env.local`
- [ ] Fill in LIVE Stripe keys (not test keys)
- [ ] Set LIVE domain URLs
- [ ] Add Supabase service role key
- [ ] Test locally: `npm run dev`
- [ ] Verify billing page loads
- [ ] Test checkout flow (use test card)

## Stripe Dashboard Setup
- [ ] Create LIVE Product + Prices
- [ ] Copy price IDs to environment
- [ ] Create webhook endpoint: `https://YOUR_DOMAIN/api/webhook`
- [ ] Listen to required events
- [ ] Copy webhook signing secret
- [ ] Set `STRIPE_WEBHOOK_SECRET` in env

## Vercel Environment Variables
- [ ] `NEXT_PUBLIC_SITE_URL`
- [ ] `NEXT_PUBLIC_APP_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `STRIPE_SECRET_KEY`
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- [ ] `NEXT_PUBLIC_STRIPE_PRICE_ID`
- [ ] `STRIPE_ANNUAL_PRICE_ID`
- [ ] `STRIPE_WEBHOOK_SECRET`

## Database Schema
- [ ] `profiles.stripe_customer_id` (TEXT)
- [ ] `profiles.stripe_subscription_id` (TEXT)
- [ ] `profiles.subscription_status` (TEXT, default 'free')
- [ ] `profiles.subscription_tier` (TEXT)
- [ ] `profiles.current_period_end` (TIMESTAMPTZ)
- [ ] `profiles.cancel_at_period_end` (BOOLEAN, default FALSE)

## Deploy
- [ ] Commit all changes
- [ ] Push to main branch
- [ ] Vercel auto-deploys
- [ ] Verify environment variables loaded

## Post-Deploy Testing
- [ ] Health check: `GET /api/health`
- [ ] Billing page loads: `/dashboard/billing`
- [ ] Checkout redirects to Stripe
- [ ] Webhook receives events (check Stripe Dashboard)
- [ ] Supabase profiles update correctly
- [ ] Customer portal works

## Live Verification
- [ ] Test with real card (small amount)
- [ ] Verify payment appears in Stripe
- [ ] Check webhook events processed
- [ ] Confirm user subscription status updated
- [ ] Test billing portal access

## Security Final Check
- [ ] No test keys in production
- [ ] `SUPABASE_SERVICE_ROLE_KEY` server-only
- [ ] HTTPS enforced
- [ ] Webhook signature verification working
- [ ] Authentication required on all routes

---

**🎉 If all checks pass: YOU'RE LIVE AND COLLECTING REAL MONEY!** 
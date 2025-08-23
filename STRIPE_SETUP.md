# Stripe Integration Setup

## Environment Variables

Add these to your `.env.local` file and GitHub Secrets:

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_live_... # Your Stripe secret key
NEXT_PUBLIC_STRIPE_PRICE_ID=price_12345 # Your Stripe price ID for Pro plan
NEXT_PUBLIC_SITE_URL=https://yourdomain.com # Your production site URL

# Stripe Webhook
STRIPE_WEBHOOK_SECRET=whsec_... # Your Stripe webhook secret

# Supabase (if not already configured)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Existing Stripe configuration (for workspace-based billing)
STRIPE_BASE_PRICE_ID=price_...
STRIPE_SEAT_PRICE_ID=price_...
NEXT_PUBLIC_STRIPE_PRICE_STARTER=price_...
NEXT_PUBLIC_STRIPE_PRICE_TEAM=price_...
NEXT_PUBLIC_STRIPE_PRICE_PRO=price_...
```

## Stripe Dashboard Setup

1. **Create a Price**: In your Stripe dashboard, create a recurring price for your Pro plan
2. **Set up Webhook**: Create a webhook endpoint pointing to `/api/stripe/webhook` with these events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
3. **Copy the webhook secret** to your environment variables

## Testing

1. Start your dev server: `npm run dev`
2. Log in as a free user
3. Visit `/dashboard/billing`
4. Click "Upgrade to Pro" → redirects to Stripe Checkout
5. Pay with test card: `4242 4242 4242 4242`
6. After success → redirect back to `/dashboard?upgrade=success`
7. Check Supabase → `profiles.subscription_status` should be `'pro'`
8. Try `/dashboard/campaigns` → should work (unlocked)

## Test Cards

- **Success**: `4242 4242 4242 4242`
- **Declined**: `4000 0000 0000 0002`
- **Requires Authentication**: `4000 0025 0000 3155` 
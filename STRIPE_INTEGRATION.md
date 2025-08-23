# Stripe Integration for SmartSend AI

This document outlines the complete Stripe integration implementation for SmartSend AI, including database changes, webhook handling, and user experience improvements.

## 🗄️ Database Changes

### Profiles Table Updates

The `profiles` table has been enhanced with Stripe-related columns:

```sql
-- Migration: supabase/migrations/20250116_add_stripe_to_profiles.sql
alter table public.profiles
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status text default 'free',
  add column if not exists subscription_current_period_end timestamptz;

-- Index for performance
create index if not exists idx_profiles_stripe_customer on public.profiles (stripe_customer_id);
```

### Column Descriptions

- `stripe_customer_id`: Links user to Stripe customer
- `stripe_subscription_id`: Current active subscription ID
- `subscription_status`: User's subscription level ('free' | 'pro')
- `subscription_current_period_end`: When current billing period ends

## 🔌 API Endpoints

### 1. Stripe Webhook (`/api/webhooks/stripe`)

Handles all Stripe webhook events:

- **checkout.session.completed**: Links Stripe customer to user
- **customer.subscription.created/updated**: Sets user to pro status
- **customer.subscription.deleted**: Reverts user to free status

### 2. Billing Portal (`/api/billing/portal`)

Redirects users to Stripe's self-service billing portal.

### 3. Checkout (`/api/billing/checkout`)

Creates Stripe checkout sessions for upgrades.

## 🎯 User Experience Flow

### Upgrade Process

1. User visits `/dashboard/billing`
2. Clicks "Upgrade to Pro" button
3. Redirected to Stripe Checkout
4. Completes payment
5. Redirected back to `/dashboard?upgrade=success`
6. Success toast appears
7. User now has access to pro features

### Billing Management

- Pro users see "Manage billing" button
- Clicking opens Stripe Customer Portal
- Users can update payment methods, cancel, etc.

## 🛠️ Implementation Details

### Webhook Security

- Uses `STRIPE_WEBHOOK_SECRET` for signature verification
- Raw body parsing for secure event validation
- Comprehensive error handling

### Database Updates

- Uses `supabaseAdmin` client for webhook operations
- Updates both by user ID and customer ID
- Handles edge cases (missing data, errors)

### Status Mapping

Stripe subscription statuses are mapped to app statuses:

```typescript
const appStatus =
  status === "active" || status === "trialing" ? "pro" :
  status === "past_due" ? "pro" : // keep pro but might restrict later
  "free";
```

## 🔧 Environment Variables

Required environment variables:

```bash
# Stripe API
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# App URLs
NEXT_PUBLIC_SITE_URL=https://yourapp.com
NEXT_PUBLIC_STRIPE_PRICE_ID=price_...
```

## 🧪 Testing

### 1. Run Database Migration

```bash
supabase db push
```

### 2. Start Webhook Listener

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Copy the webhook secret to your `.env.local` file.

### 3. Test Upgrade Flow

1. Visit `/dashboard/billing` as a free user
2. Click "Upgrade to Pro"
3. Complete checkout with test card (4242 4242 4242 4242)
4. Verify webhook processing in server logs
5. Check database for updated profile

### 4. Run Test Script

```bash
npm run tsx scripts/test-stripe-integration.ts
```

## 📱 UI Components

### UpgradeToast

Shows success message when users upgrade:

```tsx
<UpgradeToast />
```

### Billing Page Updates

- Dynamic content based on subscription status
- "Manage billing" button for pro users
- Conditional upgrade sections

## 🔒 Security Considerations

- Webhook signature verification
- Server-side only Stripe operations
- No sensitive data exposed to client
- Proper error handling and logging

## 🚀 Deployment

1. Ensure all environment variables are set
2. Run database migrations
3. Configure Stripe webhook endpoint
4. Test upgrade flow in staging
5. Monitor webhook delivery in Stripe dashboard

## 📊 Monitoring

- Webhook delivery status in Stripe dashboard
- Server logs for webhook processing
- Database monitoring for subscription updates
- User feedback on upgrade experience

## 🔄 Future Enhancements

- Subscription tier management
- Usage-based billing
- Promotional codes and discounts
- Dunning management for failed payments
- Subscription analytics and reporting

## 🆘 Troubleshooting

### Common Issues

1. **Webhook not receiving events**: Check endpoint URL and secret
2. **Database updates failing**: Verify `supabaseAdmin` permissions
3. **Checkout redirects failing**: Check success/cancel URLs
4. **Portal access denied**: Verify customer ID exists in profiles

### Debug Commands

```bash
# Check webhook delivery
stripe webhooks list

# Test webhook endpoint
curl -X POST http://localhost:3000/api/webhooks/stripe \
  -H "Content-Type: application/json" \
  -d '{"test": true}'

# Verify database structure
supabase db diff
```

## 📚 Resources

- [Stripe Webhooks Documentation](https://stripe.com/docs/webhooks)
- [Stripe Checkout API](https://stripe.com/docs/payments/checkout)
- [Stripe Customer Portal](https://stripe.com/docs/billing/subscriptions/customer-portal)
- [Supabase Database Management](https://supabase.com/docs/guides/database) 
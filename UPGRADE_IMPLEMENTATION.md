# Upgrade Flow Implementation for Logged-Out Users

## Overview
This implementation allows unauthenticated users to upgrade to Pro by entering their email address, which creates a user account, sends a magic link, and redirects to Stripe checkout.

## What Was Implemented

### 1. Updated Upgrade Page (`src/app/upgrade/page.tsx`)
- Added authentication state detection using `/api/subscription/status`
- Shows email input field for unauthenticated users
- Dynamically routes to appropriate checkout endpoint
- Handles both authenticated and unauthenticated flows

### 2. New Public Checkout API (`src/app/api/billing/public-checkout/route.ts`)
- Accepts email from unauthenticated users
- Finds existing user or creates new one using Supabase admin
- Sends magic link email for post-checkout login
- Creates Stripe checkout session with proper user association

### 3. Enhanced Stripe Webhook (`src/app/api/webhooks/stripe/route.ts`)
- Added fallback logic to resolve users by email if `client_reference_id` is missing
- Ensures robust user-customer association even in edge cases

## Required Environment Variables

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PRICE_ID=price_...

# Site Configuration
NEXT_PUBLIC_SITE_URL=https://yourdomain.com
NEXT_PUBLIC_APP_URL=https://yourdomain.com  # fallback

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...  # Required for admin operations

# Email Configuration (for magic links)
RESEND_API_KEY=...
RESEND_FROM=SmartSendAI <hello@yourdomain.com>

# Stripe Webhook
STRIPE_WEBHOOK_SECRET=whsec_...
```

## How It Works

### For Logged-Out Users:
1. User visits `/upgrade`
2. Enters email address
3. System creates/finds user account
4. Sends magic link email
5. Redirects to Stripe checkout
6. After payment, webhook updates user status
7. User can click magic link to access dashboard

### For Authenticated Users:
1. User visits `/upgrade`
2. System detects existing authentication
3. Redirects directly to Stripe checkout
4. Standard authenticated flow continues

## Testing the Flow

1. **Log out** of your application
2. **Visit** `/upgrade`
3. **Enter email** → Click "Start Free Trial"
4. **Stripe Checkout** opens
5. **Pay** with test card (4242...)
6. **Webhook runs** → profile set to pro
7. **Magic link email** arrives
8. **Click link** → you're in dashboard as Pro user

## Security Considerations

- Uses Supabase admin client for user creation (server-side only)
- Magic links are time-limited and secure
- Stripe handles all payment processing
- Webhook signature verification ensures authenticity
- User accounts are created with confirmed email status

## Error Handling

- Invalid email format validation
- Duplicate user handling (finds existing account)
- Stripe checkout failure fallback
- Webhook fallback for missing user references
- Graceful degradation for missing environment variables

## Files Modified

- `src/app/upgrade/page.tsx` - Enhanced upgrade page
- `src/app/api/billing/public-checkout/route.ts` - New public checkout API
- `src/app/api/webhooks/stripe/route.ts` - Enhanced webhook handler

## Next Steps

1. **Set environment variables** in your deployment
2. **Test the flow** with a test Stripe account
3. **Verify webhook delivery** in Stripe dashboard
4. **Test magic link delivery** and login flow
5. **Monitor webhook logs** for any issues 
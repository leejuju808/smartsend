# User-Based Billing Implementation Summary

This document summarizes the Stripe billing implementation based on the provided guide.

## What Was Implemented

### 1. SQL Migration (`supabase/migrations/20251026_user_billing.sql`)
- Added `stripe_customer_id` and `plan` columns to `profiles` table
- Created `billing_subscriptions` table for user-based subscriptions
- Added helper functions `plan_from_price()` and `sync_profile_plan()`
- Set up RLS policies for the billing subscriptions table

### 2. Server Config (`lib/stripe/server.ts`)
- Updated to export `stripe` instance directly matching the guide pattern

### 3. API Routes

#### Checkout Route (`app/api/billing/checkout/route.ts`)
- Creates or retrieves Stripe customer
- Generates checkout session for user subscriptions
- Links to user via metadata

#### Portal Route (`app/api/billing/portal/route.ts`)
- Opens Stripe Customer Portal for subscription management
- Allows users to update payment methods, view invoices, etc.

#### Webhook Route (`app/api/stripe/webhook/route.ts`)
- Handles subscription lifecycle events (created, updated, deleted)
- Syncs subscription data to `billing_subscriptions` table
- Updates user's `plan` field via `sync_profile_plan()` RPC

### 4. UI Components

#### Billing Page (`app/(dashboard)/billing/page.tsx`)
- Server component that renders the billing page

#### Billing Client (`app/(dashboard)/billing/ui/BillingClient.tsx`)
- Client component with Basic and Pro plan selection
- Checkout buttons
- "Open Customer Portal" button for existing subscriptions

### 5. Environment Variables
Updated `env.template` with:
```
NEXT_PUBLIC_STRIPE_PRICE_BASIC=price_123basic
NEXT_PUBLIC_STRIPE_PRICE_PRO=price_456pro
```

## Next Steps Required

### 1. Set Stripe Price IDs
Run this SQL in Supabase SQL Editor or via migration:
```sql
-- Set your actual price IDs from Stripe Dashboard
SELECT set_config('app.stripe_price_basic', 'price_123basic', true);
SELECT set_config('app.stripe_price_pro', 'price_456pro', true);
```

### 2. Configure Stripe Dashboard
1. Create Products & Prices in Stripe Dashboard (test mode first)
2. Create a webhook endpoint pointing to: `https://YOUR_APP/api/stripe/webhook`
3. Select events: `checkout.session.completed`, `customer.subscription.*`
4. Copy the webhook signing secret to `.env` as `STRIPE_WEBHOOK_SECRET`

### 3. Set Environment Variables
Update your `.env` file:
```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_APP_URL=https://app.smartsend.ai

# Price IDs from your Stripe dashboard
NEXT_PUBLIC_STRIPE_PRICE_BASIC=price_123basic
NEXT_PUBLIC_STRIPE_PRICE_PRO=price_456pro
```

### 4. Run Migration
Apply the migration to your database:
```bash
npm run db:migrate
# or manually in Supabase SQL Editor
```

### 5. Test Checklist
- [ ] Create Products & Prices in Stripe → copy price IDs to .env
- [ ] Expose endpoint `/api/stripe/webhook` and add to Stripe Dashboard
- [ ] Create a test user, open `/billing`, choose a plan
- [ ] Complete checkout → webhook fires → `billing_subscriptions` row appears and `profiles.plan` updates
- [ ] Open Manage Subscription → portal loads
- [ ] Try cancel/upgrade → webhook syncs status & plan

## Usage Example

### Gate Features by Plan
```typescript
// In any server component
const supabase = createClient(/*...*/);
const { data: profile } = await supabase
  .from("profiles")
  .select("plan")
  .eq("id", userId)
  .maybeSingle();

const isPro = profile?.plan === "pro";
```

## Database Schema

### `profiles` table (updated)
- `stripe_customer_id` (text)
- `plan` (text, default: 'free')

### `billing_subscriptions` table (new)
- `id` (text, primary key - Stripe subscription ID)
- `user_id` (uuid, foreign key to auth.users)
- `customer_id` (text)
- `price_id` (text)
- `status` (text)
- `current_period_start` (timestamptz)
- `current_period_end` (timestamptz)
- `cancel_at_period_end` (boolean)
- `canceled_at` (timestamptz)

## Notes

- This implementation is **user-based** (not workspace-based like the existing billing system)
- The existing workspace-based billing at `src/app/api/billing/checkout/route.ts` remains unchanged
- This new user-based billing is available at `app/api/billing/checkout/route.ts`
- Both systems can coexist if needed

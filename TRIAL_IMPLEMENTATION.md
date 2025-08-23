# Trial System Implementation

This document outlines the implementation of a trial system for SmartSendAI, including webhook updates, API endpoints, and UI components.

## Database Changes

### 1. Add trial_end column to profiles table

Run this SQL in your Supabase dashboard:

```sql
-- Add trial_end column to profiles table
alter table public.profiles add column if not exists trial_end timestamptz;
```

## Implementation Details

### 2. Stripe Webhook Updates

The webhook at `src/app/api/stripe/webhook/route.ts` has been updated to:

- **customer.subscription.created**: Store `trial_end` when subscription is created
- **customer.subscription.updated**: Update `trial_end` when subscription changes

Key changes:
```typescript
const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;

await setProfileByCustomerId(customerId, {
  subscription_status: appStatus,
  stripe_subscription_id: sub.id,
  subscription_current_period_end: periodEnd,
  trial_end: trialEnd  // ← New field
});
```

### 3. Subscription Status API

The API at `src/app/api/subscription/status/route.ts` now returns both subscription status and trial end date:

```typescript
export async function GET(req: Request) {
  const { userId, status } = await getSubscriptionStatus();
  if (!userId) return NextResponse.json({ status: "free" });

  // fetch trial_end from profiles
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("trial_end")
    .eq("id", userId)
    .maybeSingle();

  return NextResponse.json({ status, trial_end: data?.trial_end });
}
```

### 4. TrialBadge Component

New component at `src/components/TrialBadge.tsx` that:

- Fetches subscription status and trial end date
- Calculates days remaining in trial
- Shows yellow badge with "Trial: X days left → Upgrade now"
- Automatically hides when trial expires
- Links to billing page for upgrade

### 5. Dashboard Integration

The `TrialBadge` has been added to the dashboard layout at `src/app/dashboard/layout.tsx` in the header area, positioned to the right of the workspace switcher.

## Usage Flow

1. **Sign up** → User creates account
2. **Upgrade** → User goes through Stripe Checkout (with trial days configured on price)
3. **Webhook** → Stripe sends `customer.subscription.created` with `trial_end`
4. **Database** → `profiles.trial_end` gets populated
5. **Dashboard** → Yellow trial badge shows "Trial: 7 days left → Upgrade now"
6. **Time passes** → Badge decrements daily
7. **Trial ends** → Badge disappears, subscription becomes active or canceled

## Testing

### Stripe Test Clock

Use Stripe's test clock feature to advance time and test trial expiration:

1. Go to Stripe Dashboard → Developers → Test Clocks
2. Create a new test clock
3. Attach it to test customers
4. Advance the clock to test trial expiration

### Manual Testing

1. Create a test subscription with trial period
2. Verify `trial_end` is stored in database
3. Check trial badge appears on dashboard
4. Verify badge updates as time passes
5. Confirm badge disappears after trial ends

## Configuration

### Stripe Price Setup

Ensure your Stripe prices have trial periods configured:

```typescript
// When creating prices, include trial_period_days
const price = await stripe.prices.create({
  unit_amount: 2000, // $20.00
  currency: 'usd',
  recurring: { interval: 'month' },
  trial_period_days: 7, // 7-day trial
  product: 'prod_xxx'
});
```

## Files Modified

- `src/app/api/stripe/webhook/route.ts` - Added trial_end handling
- `src/app/api/subscription/status/route.ts` - Extended to return trial_end
- `src/components/TrialBadge.tsx` - New component
- `src/app/dashboard/layout.tsx` - Added TrialBadge to header
- `supabase/migrations/20250101_add_trial_end_to_profiles.sql` - Database migration

## Next Steps

1. Run the SQL migration in Supabase dashboard
2. Test the webhook with a trial subscription
3. Verify the trial badge appears correctly
4. Test trial expiration flow
5. Monitor webhook logs for any errors 
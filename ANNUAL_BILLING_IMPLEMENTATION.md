# Annual Billing Implementation

This document outlines the implementation of annual billing for the Pro plan, allowing users to choose between monthly and annual subscription cycles.

## What Was Implemented

### 1. Stripe Configuration
- **Annual Price ID**: You need to create an annual price in Stripe with `interval: year` and amount ≈ 10× monthly
- **Environment Variable**: `NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL="price_annual_..."`

### 2. API Updates

#### Unified Checkout API (`/api/billing/checkout`)
- Accepts `plan=monthly|annual` in request body
- Dynamically selects appropriate Stripe price ID
- Records `checkout_initiated` event with plan information
- Success URL includes plan parameter for tracking

#### Public Checkout API (`/api/billing/public-checkout`)
- Same plan support for logged-out users
- Records checkout events with plan information
- Maintains existing user creation flow

### 3. Billing Page Updates (`/dashboard/billing`)
- **Monthly ↔ Annual Toggle**: Visual toggle between subscription cycles
- **Savings Messaging**: "2 months free" badge and ~17% savings copy
- **Dynamic Button Text**: Changes based on selected plan
- **Plan Management**: Added "Manage / Switch plan" button for existing Pro users

### 4. Annual Nudge Component
- **Targeted Display**: Shows only during last 3 days of trial
- **Prominent Messaging**: "Lock in 2 months free with annual before your trial ends"
- **Direct Action**: One-click upgrade to annual plan
- **Dashboard Integration**: Placed in dashboard layout below UpgradeBanner

### 5. Upgrade Page Updates (`/upgrade`)
- **URL Parameter Support**: `?plan=annual` automatically selects annual
- **Plan Toggle**: Same monthly/annual selection UI
- **Consistent Messaging**: Matches billing page copy and styling

### 6. Webhook Enhancements
- **Plan Capture**: Records `month` vs `year` interval in subscription events
- **Event Tracking**: Enhanced `subscribed_pro` events include plan information
- **Analytics Ready**: Plan data available for reporting and analysis

## User Experience Flow

### New Users
1. Visit `/upgrade` or `/dashboard/billing`
2. See monthly/annual toggle with savings messaging
3. Select preferred plan
4. Complete checkout with appropriate pricing
5. Success page shows plan confirmation

### Trial Users (Last 3 Days)
1. See prominent annual nudge banner
2. Click "Switch to Annual" for immediate upgrade
3. Redirected to annual checkout
4. Maintains trial benefits while locking in annual pricing

### Existing Monthly Users
1. Access billing portal via "Manage / Switch plan"
2. Change subscription frequency in Stripe portal
3. Automatic proration handled by Stripe
4. Plan change reflected in next billing cycle

## Analytics & Tracking

### Events Recorded
- `checkout_initiated`: Includes `plan` (monthly/annual)
- `subscribed_pro`: Includes `plan` (month/year interval)

### Success URL Parameters
- `?upgrade=success&plan=annual` for annual upgrades
- `?upgrade=success&plan=monthly` for monthly upgrades

## Environment Variables Required

```bash
# Existing
NEXT_PUBLIC_STRIPE_PRICE_ID="price_monthly_..."

# New
NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL="price_annual_..."
```

## Testing Checklist

- [ ] Annual price created in Stripe
- [ ] Environment variables set
- [ ] Monthly checkout works (existing flow)
- [ ] Annual checkout works (new flow)
- [ ] Plan toggle UI functions correctly
- [ ] Annual nudge shows during trial end
- [ ] Webhook captures plan information
- [ ] Events table records plan data
- [ ] Success URLs include plan parameter
- [ ] Billing portal accessible for plan changes

## Future Enhancements

### Optional Analytics
- Weekly summary split by plan (monthly vs annual)
- Conversion rate tracking (monthly → annual)
- Revenue impact analysis

### Advanced Features
- Custom annual pricing tiers
- Early annual upgrade incentives
- Plan change confirmation flows

## Files Modified

1. `src/app/api/billing/checkout/route.ts` - Added plan support
2. `src/app/api/billing/public-checkout/route.ts` - Added plan support
3. `src/app/dashboard/billing/page.tsx` - Added monthly/annual toggle
4. `src/components/AnnualNudge.tsx` - New component for trial upsell
5. `src/app/dashboard/layout.tsx` - Integrated annual nudge
6. `src/app/upgrade/page.tsx` - Added plan support and toggle
7. `src/app/api/webhooks/stripe/route.ts` - Enhanced plan tracking

## Notes

- Annual pricing should be approximately 10× monthly for 2 months free
- Stripe handles proration automatically for plan changes
- All existing functionality preserved while adding annual option
- Analytics events include plan information for better insights
- UI maintains consistent design language across all pages 
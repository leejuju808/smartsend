# Time-Boxed Promotion System Implementation

This document outlines the complete implementation of a time-boxed promotion system for SmartSend AI that creates limited-time offers with countdown timers.

## 🎯 Overview

The system creates time-boxed promotions (default: 30 minutes) that automatically apply discounts to Stripe checkout sessions. Users see a countdown timer and can upgrade with the discount applied.

## 🏗️ Architecture

### 1. Database Schema
- **Table**: `user_promos`
- **Purpose**: Track per-user promotion codes and their redemption status
- **Key Fields**: 
  - `promotion_code_id`: Stripe promotion code ID
  - `coupon_id`: Stripe coupon ID reference
  - `expires_at`: When the offer expires
  - `redeemed`: Whether the promo was used

### 2. API Endpoints
- **`/api/promo/create`**: Creates/fetches time-boxed promotion codes
- **`/api/billing/checkout`**: Enhanced to accept promotion codes
- **`/api/billing/public-checkout`**: Enhanced to accept promotion codes

### 3. Components
- **`UpgradeWall`**: Modal overlay with countdown timer (shown when hitting trial limits)
- **`TimedOffer`**: Inline component for billing page with countdown timer

### 4. Webhook Integration
- **Stripe webhook**: Automatically marks promos as redeemed on successful checkout

## 🚀 Setup Instructions

### Step 1: Create Stripe Coupon
1. Go to Stripe Dashboard → Products → Coupons
2. Create a new coupon (e.g., 20% off, duration: once or repeating)
3. Copy the coupon ID and add to environment variables:
   ```bash
   STRIPE_COUPON_ID_20=cu_...
   ```

### Step 2: Run Database Migration
```bash
# Apply the migration in Supabase
supabase db push
```

### Step 3: Environment Variables
Ensure these are set in your `.env.local`:
```bash
STRIPE_SECRET_KEY=sk_...
STRIPE_COUPON_ID_20=cu_...
```

## 📊 Analytics Events

The system automatically tracks these events:
- **`promo_offered`**: When a promotion is created for a user
- **`promo_clicked`**: When user clicks upgrade with promotion code
- **`promo_converted`**: When promotion is successfully redeemed

## 🔄 User Flow

1. **Trial Limit Hit**: User hits trial limits → `UpgradeWall` appears
2. **Promo Creation**: System creates 30-minute Stripe promotion code
3. **Countdown Display**: User sees countdown timer with discount percentage
4. **Checkout**: User clicks upgrade → Stripe checkout opens with discount applied
5. **Redemption**: On successful payment, webhook marks promo as redeemed

## 🎨 Customization

### Change Offer Duration
Edit `WINDOW_MINUTES` in `/api/promo/create/route.ts`:
```typescript
const WINDOW_MINUTES = 30; // Change to desired duration
```

### Multiple Coupon Variants
Create multiple environment variables and modify the promo creation logic:
```typescript
const COUPON_ID = process.env.STRIPE_COUPON_ID_20!; // 20% off
// Add logic for different discount levels
```

### UI Styling
- **UpgradeWall**: Modal overlay styling in `src/components/UpgradeWall.tsx`
- **TimedOffer**: Inline component styling in `src/components/billing/TimedOffer.tsx`

## 🧪 Testing

### Test Promotion Creation
```bash
curl -X POST /api/promo/create \
  -H "Authorization: Bearer <token>"
```

### Test Checkout with Promo
```bash
curl -X POST /api/billing/checkout \
  -H "Content-Type: application/json" \
  -d '{"plan": "monthly", "promotion_code": "promo_..."}'
```

## 🔒 Security Considerations

- **RLS Policies**: `user_promos` table has row-level security enabled
- **Admin Only**: Only service role can insert/update promotions
- **User Isolation**: Users can only see their own promotions
- **Single Use**: Each promotion code is limited to 1 redemption

## 🚨 Troubleshooting

### Common Issues

1. **Promo Not Creating**: Check Stripe API key and coupon ID
2. **Countdown Not Working**: Verify client-side JavaScript execution
3. **Discount Not Applied**: Ensure promotion code is passed to checkout
4. **Webhook Errors**: Check Stripe webhook endpoint configuration

### Debug Logs
Check browser console and server logs for:
- API response errors
- Stripe API errors
- Database constraint violations

## 📈 Performance

- **Caching**: Existing promos are reused if not expired
- **Indexes**: Database indexes on `user_id` and `expires_at`
- **Cleanup**: Consider adding a cron job to clean up expired promos

## 🔮 Future Enhancements

- **A/B Testing**: Different discount levels or durations
- **Personalization**: User-specific offer targeting
- **Analytics Dashboard**: Conversion rate tracking
- **Bulk Promotions**: Team-wide or organization-wide offers
- **Email Integration**: Send promotional emails with countdown

## 📝 Files Modified

- `supabase/migrations/20250125_create_user_promos.sql`
- `src/app/api/promo/create/route.ts`
- `src/app/api/billing/checkout/route.ts`
- `src/app/api/billing/public-checkout/route.ts`
- `src/app/api/webhooks/stripe/route.ts`
- `src/components/UpgradeWall.tsx`
- `src/components/billing/TimedOffer.tsx`
- `src/app/dashboard/billing/page.tsx`

## ✅ Implementation Status

- [x] Database schema and migration
- [x] Promo creation API
- [x] Checkout integration
- [x] Webhook redemption tracking
- [x] UpgradeWall component with countdown
- [x] TimedOffer component for billing page
- [x] Analytics event tracking
- [x] Billing page integration

The time-boxed promotion system is now fully implemented and ready for use! 
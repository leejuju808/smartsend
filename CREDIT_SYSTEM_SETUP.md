# Credit System Setup Guide

This guide explains how to set up the AI Reply Credit system that allows teams to purchase credit packs for AI replies.

## 1. Stripe Configuration

### Create One-Time Products/Prices
In your Stripe dashboard, create the following products and prices:

1. **200 Credits Pack**
   - Product: "AI Reply Credits - 200 Pack"
   - Price: One-time payment (set your desired price)
   - Copy the price ID (starts with `price_`)

2. **1,000 Credits Pack**
   - Product: "AI Reply Credits - 1,000 Pack"
   - Price: One-time payment (set your desired price)
   - Copy the price ID

3. **5,000 Credits Pack**
   - Product: "AI Reply Credits - 5,000 Pack"
   - Price: One-time payment (set your desired price)
   - Copy the price ID

### Environment Variables
Add these to your `.env.local` file:

```bash
# Credit pack prices
STRIPE_TOPUP_200=price_your_200_pack_price_id
STRIPE_TOPUP_1000=price_your_1000_pack_price_id
STRIPE_TOPUP_5000=price_your_5000_pack_price_id
```

## 2. Database Migration

Run the database migration to add the credit system:

```bash
supabase db push
```

This will:
- Add `credit_balance` column to `teams` table
- Add `covered_by_credit` column to `ai_reply_events` table
- Create RPC functions for consuming and adding credits

## 3. How It Works

### Credit Consumption
1. When a user sends an AI reply, the system checks if their team has credits
2. If credits are available, 1 credit is consumed and the event is marked as `covered_by_credit = true`
3. If no credits, the event is marked as `covered_by_credit = false` and falls through to metered billing

### Billing
- **Credit-covered events**: Not billed to Stripe (prepaid)
- **Uncovered events**: Billed normally through your existing metered billing system
- **Usage reporting**: Only counts uncovered events for Stripe billing

### Purchase Flow
1. User clicks "Buy Credits" button
2. Stripe Checkout session is created for the selected pack
3. After successful payment, webhook adds credits to team balance
4. Credits are immediately available for use

## 4. Components Added

### CreditMeter Component
- Shows current credit balance
- Provides buttons to purchase credit packs
- Located in `/dashboard/billing` page

### Topup API
- Endpoint: `/api/billing/topup`
- Creates Stripe checkout sessions for credit packs
- Handles authentication and validation

### Webhook Integration
- Processes successful credit pack purchases
- Adds credits to team balance via `add_team_credits` RPC

## 5. Testing

1. **Purchase Flow**: Test buying credits through the UI
2. **Credit Consumption**: Send AI replies and verify credits are consumed
3. **Billing Integration**: Ensure credit-covered events don't appear in usage reports
4. **Fallback**: Verify metered billing works when credits are exhausted

## 6. Monitoring

- Check `teams.credit_balance` for current balances
- Monitor `ai_reply_events.covered_by_credit` for usage patterns
- Review Stripe webhook logs for purchase processing

## 7. Pricing Strategy

Consider these pricing tiers:
- **200 credits**: $X (good for small teams)
- **1,000 credits**: $Y (most popular)
- **5,000 credits**: $Z (enterprise teams)

Credits never expire and provide immediate value without subscription commitment. 
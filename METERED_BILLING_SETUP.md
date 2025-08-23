# Metered Billing Setup for AI Replies

This document outlines the complete implementation of metered billing for AI replies in SmartSendAI.

## Overview

The system tracks AI reply usage per team and bills customers based on actual usage rather than flat-rate pricing. This includes:

- Usage tracking for AI replies sent from dashboard and extension
- Daily aggregation and reporting to Stripe
- Real-time usage display in the dashboard
- Automatic billing at the end of each period

## Prerequisites

1. **Stripe Account**: Pro plan with metered billing enabled
2. **Supabase Project**: With service role key access
3. **GitHub Repository**: For automated usage reporting

## Step 1: Stripe Setup (One-time)

### Create Metered Price

1. Go to Stripe Dashboard → Products
2. Find your Pro product or create one
3. Add a new price with these settings:
   - **Billing model**: Per unit
   - **Usage type**: Metered
   - **Aggregation mode**: Sum
   - **Name**: "AI Reply"
   - **Price**: Set your desired per-reply rate (e.g., $0.01 per reply)

4. **Save the Price ID** as `NEXT_PUBLIC_STRIPE_METERED_PRICE_ID` in your environment variables

### Environment Variables

Add to your `.env.local`:
```bash
NEXT_PUBLIC_STRIPE_METERED_PRICE_ID=price_xxxxxxxxxxxxx
```

## Step 2: Database Setup

### Run Migration

The migration file `supabase/migrations/20250120_add_ai_reply_metered_billing.sql` has been created and will:

1. Create `ai_reply_events` table for tracking usage
2. Add Stripe usage tracking fields to `teams` table
3. Set up RLS policies for security

### Apply Migration

```bash
# In Supabase dashboard or CLI
supabase db push
```

## Step 3: Code Implementation

### Files Modified/Created

1. **Database Migration**: `supabase/migrations/20250120_add_ai_reply_metered_billing.sql`
2. **Checkout Routes**: Updated to include metered price
   - `src/app/api/billing/checkout/route.ts`
   - `src/app/api/billing/public-checkout/route.ts`
3. **Webhook Handler**: Enhanced to capture usage item ID and period bounds
   - `src/app/api/webhooks/stripe/route.ts`
4. **Usage Tracking**: Added to reply sending
   - `src/app/api/replies/send/route.ts`
5. **Usage Reporting Script**: Daily aggregation script
   - `scripts/report-usage.ts`
6. **GitHub Action**: Automated daily reporting
   - `.github/workflows/report-usage.yml`
7. **Usage Display**: Real-time usage badge
   - `src/components/UsageBadge.tsx`
   - `src/components/UsageBadgeClient.tsx`
   - `src/app/dashboard/layout.tsx`

## Step 4: Testing

### 1. Test Checkout Flow

1. Go through the upgrade flow
2. Verify two line items appear in Stripe:
   - Base Pro subscription
   - Metered AI Reply add-on

### 2. Test Usage Tracking

1. Send an AI reply from the dashboard
2. Check `ai_reply_events` table in Supabase
3. Verify the event is recorded with correct team_id and user_id

### 3. Test Webhook

1. Check Stripe webhook logs
2. Verify `stripe_usage_item_id` is stored in teams table
3. Confirm period bounds are captured

### 4. Test Usage Display

1. Check dashboard header shows usage badge
2. Verify count matches actual replies sent

## Step 5: Production Deployment

### 1. Environment Variables

Ensure these are set in production:
```bash
NEXT_PUBLIC_STRIPE_METERED_PRICE_ID=price_xxxxxxxxxxxxx
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxxx
SUPABASE_SERVICE_ROLE_KEY=eyJxxxxxxxxxxxxx
```

### 2. GitHub Secrets

Add these secrets to your GitHub repository:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`

### 3. Deploy Migration

```bash
supabase db push --project-ref your-project-ref
```

## Step 6: Monitor and Verify

### 1. Daily Usage Reporting

- GitHub Action runs at 02:15 UTC daily
- Check GitHub Actions tab for success/failure
- Verify usage records appear in Stripe Dashboard

### 2. Stripe Dashboard

- Monitor usage records in Subscriptions → [Subscription] → Usage
- Check invoices for metered line items
- Verify billing amounts match expected usage

### 3. Database Monitoring

- Check `ai_reply_events` table growth
- Monitor `teams` table for usage tracking data
- Verify RLS policies are working correctly

## Troubleshooting

### Common Issues

1. **Usage not tracking**: Check RLS policies and team_id resolution
2. **Webhook failures**: Verify Stripe webhook endpoint and secret
3. **GitHub Action failures**: Check environment variables and secrets
4. **Usage badge not showing**: Verify user has team_id and usage data exists

### Debug Commands

```bash
# Check usage events for a team
supabase db query "SELECT COUNT(*) FROM ai_reply_events WHERE team_id = 'team-uuid';"

# Verify webhook data
supabase db query "SELECT stripe_usage_item_id, current_period_start, current_period_end FROM teams WHERE id = 'team-uuid';"

# Test usage reporting manually
npm run tsx scripts/report-usage.ts
```

## Billing Flow

1. **Subscription Creation**: Customer subscribes with base + metered prices
2. **Usage Accumulation**: AI replies are logged to `ai_reply_events`
3. **Daily Reporting**: GitHub Action aggregates yesterday's usage
4. **Stripe Billing**: Usage records are sent to Stripe
5. **Period End**: Customer is billed based on actual usage
6. **Invoice Generation**: Stripe creates invoice with metered line item

## Cost Structure

- **Base Pro**: Fixed monthly/annual fee
- **AI Replies**: Per-reply metered billing
- **Example**: $29/month + $0.01 per AI reply
- **Customer with 100 replies**: $29 + $1 = $30 total

## Security Considerations

1. **RLS Policies**: Users can only see their team's usage data
2. **Webhook Verification**: Stripe signature verification prevents spoofing
3. **Service Role**: Usage reporting uses service role for admin access
4. **Data Isolation**: Team-based data separation prevents cross-team access

## Future Enhancements

1. **Usage Limits**: Add soft/hard limits with notifications
2. **Usage Analytics**: Dashboard showing usage trends and patterns
3. **Bulk Operations**: Batch usage reporting for high-volume teams
4. **Usage Alerts**: Notifications when approaching billing thresholds
5. **Usage History**: Historical usage data and reporting

## Support

For issues or questions:
1. Check Stripe webhook logs
2. Verify GitHub Action execution
3. Review database RLS policies
4. Check environment variable configuration
5. Monitor Supabase logs for errors 
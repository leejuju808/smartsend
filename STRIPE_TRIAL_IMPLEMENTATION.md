# Stripe Trial Implementation Guide

This guide covers the implementation of Stripe trial functionality, webhook handling for trial management, and dunning email automation.

## 1. Stripe Dashboard Configuration

### Enable Trial on Pro Price
1. Open your Stripe Dashboard
2. Navigate to Products > Pro plan
3. Open the Pro price
4. Set **Trial period days** = 7 (or 14, your choice)
5. Copy the `price_xxx` ID for reference
6. Save the changes

**Result**: Every new checkout will start as `trialing` and automatically flip to `active` at the end if the card is valid.

## 2. Webhook Handler Updates

The webhook handler at `src/app/api/stripe/webhook/route.ts` has been updated to:

- Handle `customer.subscription.updated` with trial logic
- Process `invoice.payment_failed` for dunning emails
- Use a helper function `setProfileByCustomerId()` for consistent updates
- Support both `trialing` and `active` statuses as "pro" in your app
- Update the `users` table (main subscription table) instead of `profiles`

### Key Changes Made:

```typescript
case "customer.subscription.updated": {
  const sub = event.data.object as Stripe.Subscription;
  const customerId = sub.customer as string;
  const status = sub.status; // trialing | active | past_due | canceled | unpaid
  const periodEnd = (sub as any).current_period_end ? new Date((sub as any).current_period_end * 1000).toISOString() : null;

  const appStatus =
    status === "active" || status === "trialing" ? "pro" :
    "free";

  await setProfileByCustomerId(customerId, {
    subscription_status: appStatus,
    stripe_subscription_id: sub.id,
    subscription_current_period_end: periodEnd
  });
  break;
}
```

## 3. Dunning Email System

### New Endpoint: `/api/emails/dunning`
- **Location**: `src/app/api/emails/dunning/route.ts`
- **Purpose**: Sends payment failure notifications via Resend
- **Trigger**: `invoice.payment_failed` webhook from Stripe

### Email Content:
```
Subject: Action required: Update your payment method

Hi there,

We couldn't process your last payment for SmartSendAI.

Please update your payment method to avoid interruption:
[BILLING_URL]/dashboard/billing

Thanks,
SmartSendAI
```

## 4. Database Schema Updates

### New Migration: `20250115_add_subscription_period_end.sql`
- Adds `subscription_current_period_end` column to `users` table
- Adds `subscription_current_period_end` column to `workspaces` table
- Creates indexes for efficient subscription period lookups

### Columns Added:
- `subscription_current_period_end`: TIMESTAMP WITH TIME ZONE
- Tracks when the current subscription period ends
- Useful for trial expiration and renewal logic

**Note**: The subscription data is stored in the `users` table, not the `profiles` table.

## 5. Pricing Page Updates

### Changes Made:
- Updated Pro plan description to: "7-day free trial, then $49/month"
- Changed CTA button text to: "Start Free Trial →"
- Maintains existing upgrade flow to `/dashboard/billing?upgrade=1`

## 6. Environment Variables Required

Ensure these environment variables are set:

```bash
# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Resend (for dunning emails)
RESEND_API_KEY=re_...
RESEND_FROM=noreply@yourdomain.com

# App URL
NEXT_PUBLIC_SITE_URL=https://yourdomain.com
```

## 7. Testing Checklist

### Stripe Dashboard Setup:
- [ ] Pro price has trial period enabled
- [ ] Trial period days set to desired value (7 or 14)
- [ ] Webhook endpoint configured and tested

### Local Testing:
1. **Start webhook listener**:
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```

2. **Test trial flow**:
   - Sign up as free user
   - Go to billing → click Upgrade
   - Complete checkout with test card (4242 4242 4242 4242)
   - Verify status shows as `trialing`
   - Check Supabase: `users.subscription_status='pro'`

3. **Test trial expiration**:
   - Fast-forward trial end in Stripe Dashboard
   - Verify webhook flips status to `active`
   - Check database updates

4. **Test payment failure**:
   - In Stripe: create test clock, advance to due date
   - Simulate failed payment
   - Verify webhook triggers `invoice.payment_failed`
   - Check dunning email sent via Resend

5. **Test cancellation**:
   - Cancel subscription in Stripe
   - Verify webhook flips back to `free`

## 8. Webhook Events Handled

| Event | Action | Status Mapping | Table Updated |
|-------|--------|----------------|---------------|
| `checkout.session.completed` | Update user to pro | `subscription_status: "pro"` | `users` |
| `customer.subscription.created` | Update user to pro | `subscription_status: "pro"` | `users` |
| `customer.subscription.updated` | Handle status changes | `trialing/active` → `pro`, others → `free` | `users`, `workspaces` |
| `customer.subscription.deleted` | Downgrade to free | `subscription_status: "free"` | `users` |
| `invoice.payment_failed` | Send dunning email | Triggers email via Resend | N/A |

## 9. Troubleshooting

### Common Issues:

1. **Webhook not receiving events**:
   - Check `stripe listen` is running
   - Verify webhook endpoint URL is correct
   - Check webhook secret in environment variables

2. **Dunning emails not sending**:
   - Verify `RESEND_API_KEY` is set
   - Check `RESEND_FROM` email address
   - Ensure `NEXT_PUBLIC_SITE_URL` is correct

3. **Database updates not working**:
   - Run the new migration: `supabase db push`
   - Check Supabase service role key permissions
   - Verify table structure matches expected schema
   - **Important**: Check `users` table, not `profiles` table

### Monitoring:
- Check webhook logs in Stripe Dashboard
- Monitor application logs for webhook processing
- Use Stripe CLI for local webhook testing

## 10. Next Steps

After implementation:

1. **Monitor trial conversion rates** in Stripe Analytics
2. **Set up dunning email analytics** in Resend Dashboard
3. **Consider A/B testing** different trial periods (7 vs 14 days)
4. **Implement trial extension logic** for high-value users
5. **Add trial countdown UI** in dashboard

## Support

For issues or questions:
- Check Stripe webhook logs
- Review application error logs
- Test with Stripe CLI locally
- Verify environment variables are set correctly
- **Remember**: Subscription data is in `users` table, not `profiles` 
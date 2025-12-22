# Stripe Billing + Seats System Setup Guide

## Environment Variables

Add these to your `.env.local` file:

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_live_... # or sk_test_... for testing
STRIPE_WEBHOOK_SECRET=whsec_...

# Stripe Price IDs (create these in your Stripe dashboard)
NEXT_PUBLIC_STRIPE_PRICE_SOLO=price_...
NEXT_PUBLIC_STRIPE_PRICE_TEAM=price_...
NEXT_PUBLIC_STRIPE_PRICE_PRO=price_...

# App URL
NEXT_PUBLIC_APP_URL=https://app.smartsend.ai

# Supabase (should already exist)
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Stripe Setup Steps

### 1. Create Products and Prices in Stripe Dashboard

1. Go to [Stripe Dashboard > Products](https://dashboard.stripe.com/products)
2. Create three products:

**Solo Plan:**
- Name: "SmartSend Solo"
- Price: $29/month
- Copy the price ID to `NEXT_PUBLIC_STRIPE_PRICE_SOLO`

**Team Plan:**
- Name: "SmartSend Team" 
- Price: $79/month
- Copy the price ID to `NEXT_PUBLIC_STRIPE_PRICE_TEAM`

**Pro Plan:**
- Name: "SmartSend Pro"
- Price: $199/month
- Copy the price ID to `NEXT_PUBLIC_STRIPE_PRICE_PRO`

### 2. Set Up Webhook Endpoint

1. Go to [Stripe Dashboard > Webhooks](https://dashboard.stripe.com/webhooks)
2. Click "Add endpoint"
3. URL: `https://your-domain.com/api/stripe/webhook`
4. Select these events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Copy the webhook secret to `STRIPE_WEBHOOK_SECRET`

### 3. Enable Customer Portal

1. Go to [Stripe Dashboard > Settings > Billing](https://dashboard.stripe.com/settings/billing)
2. Enable "Customer portal"
3. Configure allowed actions (update payment method, cancel subscription, etc.)

## Database Migration

Run the migration to set up the billing system:

```bash
# Apply the migration
supabase db push
```

Or manually run the SQL from `supabase/migrations/20250131_stripe_billing_seats.sql`

## Testing Checklist

### 1. Test Checkout Flow
- [ ] Navigate to `/dashboard/billing?ws=your-workspace-id`
- [ ] Click "Choose Solo/Team/Pro" 
- [ ] Complete Stripe checkout
- [ ] Verify redirect to success page
- [ ] Check `billing_subscriptions` table has new row

### 2. Test Webhook Events
- [ ] Verify `checkout.session.completed` updates subscription
- [ ] Test `customer.subscription.updated` 
- [ ] Test `customer.subscription.deleted`
- [ ] Test `invoice.payment_failed`

### 3. Test Seat Management
- [ ] Add workspace members
- [ ] Verify `seats_in_use` updates automatically
- [ ] Try adding more members than plan allows
- [ ] Verify seat limit enforcement

### 4. Test Feature Gating
- [ ] Call `/api/example-feature-gated?workspace_id=your-ws-id`
- [ ] Test with different plan levels
- [ ] Verify upgrade prompts for restricted features

### 5. Test Customer Portal
- [ ] Click "Open Customer Portal" 
- [ ] Verify portal opens with correct customer
- [ ] Test updating payment method
- [ ] Test canceling subscription

## Usage Examples

### Feature Gating in API Routes

```typescript
import { checkFeature } from "@/lib/featureGate";

export async function POST(req: NextRequest) {
  const { workspace_id } = await req.json();
  
  const gate = await checkFeature(workspace_id, "reply_inbox");
  if (!gate.ok) {
    return NextResponse.json({ 
      error: "Upgrade required", 
      required_plan: gate.required 
    }, { status: 402 });
  }
  
  // Proceed with feature logic...
}
```

### Checking Seat Availability

```typescript
import { canAddMember } from "@/lib/featureGate";

const canAdd = await canAddMember(workspace_id);
if (!canAdd) {
  // Show upgrade prompt
}
```

### Getting Billing Status

```typescript
import { getWorkspaceBillingStatus } from "@/lib/featureGate";

const status = await getWorkspaceBillingStatus(workspace_id);
console.log(status.plan, status.seats_in_use, status.seats_allowed);
```

## Troubleshooting

### Common Issues

1. **Webhook not receiving events**: Check webhook URL is accessible and secret is correct
2. **Seats not updating**: Verify trigger is created and `refresh_workspace_seats` function exists
3. **Feature gate failing**: Check billing_subscriptions table has correct data
4. **Checkout failing**: Verify price IDs are correct and products are active in Stripe

### Debug Commands

```sql
-- Check billing status
SELECT * FROM billing_subscriptions WHERE workspace_id = 'your-ws-id';

-- Check seat counts
SELECT 
  w.id,
  COUNT(wm.id) as member_count,
  b.seats_allowed,
  b.seats_in_use
FROM workspaces w
LEFT JOIN workspace_members wm ON wm.workspace_id = w.id
LEFT JOIN billing_subscriptions b ON b.workspace_id = w.id
WHERE w.id = 'your-ws-id'
GROUP BY w.id, b.seats_allowed, b.seats_in_use;

-- Manual seat refresh
SELECT refresh_workspace_seats('your-ws-id');
```

## Security Notes

- Always validate workspace_id belongs to the authenticated user
- Use RLS policies to prevent unauthorized access
- Never expose Stripe secret keys to client-side code
- Validate webhook signatures to prevent tampering
- Use HTTPS for all webhook endpoints
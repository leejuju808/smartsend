# Block 20900 — Billing Enforcement Usage Guide

This guide shows how to use Block 20900 billing enforcement throughout SmartSend.

## Overview

Block 20900 enforces:
- **Campaign limits** (Starter: 1, Growth: 3, Domination: unlimited)
- **Email sending caps** (Starter: 500/mo, Growth: 2,000/mo, Domination: 20k/mo)
- **Team seat limits** (Starter: 2, Growth: 3, Domination: unlimited)
- **Feature access** (Insurance Brain, Proposal Builder, etc.)

## 1. Campaign Creation Enforcement

Add enforcement to campaign creation endpoints:

```typescript
import { enforceCampaignLimit } from '@/lib/billing/enforcement-20900';

export async function POST(req: NextRequest) {
  // ... get orgId from request ...
  
  // Enforce campaign limit
  const limitError = await enforceCampaignLimit(orgId);
  if (limitError) {
    return limitError; // Returns NextResponse with 402 status
  }
  
  // ... create campaign ...
}
```

## 2. Email Sending Enforcement

Add enforcement before sending emails:

```typescript
import { canSendEmail, trackEmailSent } from '@/lib/billing/email-enforcement-helper';

export async function sendEmail(args: { campaignId: string, ... }) {
  // Check limit before sending
  const { allowed, error } = await canSendEmail(null, args.campaignId, null, 1);
  
  if (!allowed) {
    throw new Error(error.message); // or return error response
  }
  
  // ... send email ...
  
  // Track usage after successful send
  await trackEmailSent(null, args.campaignId, null, 1);
}
```

## 3. Team Member Invitation Enforcement

Add enforcement to team invitation endpoints:

```typescript
import { enforceSeatLimit } from '@/lib/billing/enforcement-20900';

export async function POST(req: NextRequest) {
  // ... get orgId ...
  
  // Enforce seat limit
  const limitError = await enforceSeatLimit(orgId);
  if (limitError) {
    return limitError; // Returns NextResponse with 402 status
  }
  
  // ... invite team member ...
}
```

## 4. Feature Access Gating

Use the `FeatureGate` component to wrap premium features:

```tsx
import { FeatureGate } from '@/components/billing/FeatureGate';

export function InsuranceBrainPage({ orgId }: { orgId: string }) {
  return (
    <FeatureGate
      feature="insurance_brain"
      featureDisplayName="Insurance Brain"
      orgId={orgId}
    >
      {/* Insurance Brain UI */}
    </FeatureGate>
  );
}
```

Or check access programmatically:

```typescript
import { enforceFeatureAccess } from '@/lib/billing/enforcement-20900';

export async function GET(req: NextRequest) {
  // ... get orgId ...
  
  // Enforce feature access
  const accessError = await enforceFeatureAccess(
    orgId,
    'proposal_builder',
    'Proposal Builder'
  );
  
  if (accessError) {
    return accessError; // Returns NextResponse with 403 status
  }
  
  // ... return feature data ...
}
```

## 5. Stripe Webhook Handler

The webhook handler at `/api/webhooks/stripe-20900` automatically:
- Creates/updates subscription records on `checkout.session.completed`
- Updates subscription status on `customer.subscription.updated`
- Sets status to `canceled` on `customer.subscription.deleted`
- Sets status to `active` on `invoice.payment_succeeded`
- Sets status to `past_due` on `invoice.payment_failed`

**Important**: Configure this webhook endpoint in your Stripe Dashboard:
- URL: `https://yourdomain.com/api/webhooks/stripe-20900`
- Events: `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_*`

## 6. Upgrade Modal

Show upgrade modals when limits are hit:

```tsx
import { UpgradeModal } from '@/components/billing/UpgradeModal';
import { useState } from 'react';

export function MyComponent() {
  const [showUpgrade, setShowUpgrade] = useState(false);
  
  const handleAction = async () => {
    const response = await fetch('/api/campaigns/create', { ... });
    const data = await response.json();
    
    if (data.error === 'CAMPAIGN_LIMIT_REACHED') {
      setShowUpgrade(true);
      return;
    }
    
    // ... handle success ...
  };
  
  return (
    <>
      <button onClick={handleAction}>Create Campaign</button>
      <UpgradeModal
        isOpen={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        reason="campaign_limit"
        currentCount={data.current_count}
        maxAllowed={data.max_allowed}
        requiredPlan="growth"
      />
    </>
  );
}
```

## 7. Feature List

### Starter Plan Features
- ✅ Inbox
- ✅ Basic personalization
- ✅ Reply tracking
- ✅ Lead labeling
- ✅ 1 Campaign
- ✅ 500 emails/month
- ✅ 2 team members (1 owner + 1 seat)

### Growth Plan Features
- ✅ All Starter features
- ✅ Insurance Brain
- ✅ Scope Parser
- ✅ Install-Ready Playbook
- ✅ Hot Lead Engine
- ✅ Contact Card v1
- ✅ CRM Pipeline
- ✅ Calendar Integration
- ✅ 3 Campaigns
- ✅ 2,000 emails/month
- ✅ 3 team members

### Domination Plan Features
- ✅ All Growth features
- ✅ Proposal Builder
- ✅ AI Estimator
- ✅ Adjuster Engine
- ✅ Revenue Dashboard
- ✅ Unlimited Campaigns
- ✅ 20,000 emails/month (soft cap)
- ✅ Unlimited team members
- ✅ VIP Onboarding

## 8. Database Functions

Use these database functions directly if needed:

```sql
-- Get subscription info
SELECT * FROM get_org_subscription_20900('org-uuid');

-- Check campaign limit
SELECT * FROM can_create_campaign_20900('org-uuid');

-- Check email limit
SELECT * FROM can_send_emails_20900('org-uuid', 1);

-- Check seat limit
SELECT * FROM can_add_team_member_20900('org-uuid');

-- Check feature access
SELECT has_feature_access_20900('org-uuid', 'insurance_brain');
```

## 9. Environment Variables

Ensure these are set:

```env
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER_ID=price_...
STRIPE_PRICE_GROWTH_ID=price_...
STRIPE_PRICE_DOMINATION_ID=price_...
```

## 10. Testing

Test enforcement by:

1. **Campaign Limit**: Try creating more campaigns than allowed
2. **Email Limit**: Try sending more emails than monthly limit
3. **Seat Limit**: Try inviting more team members than allowed
4. **Feature Access**: Try accessing premium features on lower plans

All should return appropriate error responses with upgrade prompts.

















































# AUREV SDK Usage Examples

## Basic Setup

### Server-Side (API Routes, Server Components)

```typescript
import { aurev } from "@/lib/aurev";

// Get user
const user = await aurev.getUser();
if (!user) {
  return { error: "Not authenticated" };
}

// Get organization
const orgId = await aurev.getOrg();

// Get plan
const plan = await aurev.getPlan();
console.log(`Current plan: ${plan}`);

// Track analytics
await aurev.track("campaign_sent", {
  campaign_id: "camp_123",
  recipients: 100,
  plan: plan,
});
```

### Upgrade Plan

```typescript
import { aurev } from "@/lib/aurev";

// Upgrade to Pro
const checkoutUrl = await aurev.upgradePlan("pro");
// Redirect user to checkoutUrl
return Response.redirect(checkoutUrl);
```

### Track Campaign Events

```typescript
import { aurev } from "@/lib/aurev";

// After sending a campaign
await aurev.track("campaign_sent", {
  campaign_id: campaignId,
  recipients: leadCount,
  plan: await aurev.getPlan(),
});

// After receiving a reply
await aurev.track("reply_received", {
  lead_id: leadId,
  campaign_id: campaignId,
  intent: "meeting",
});
```

## Integration with Existing Code

### Replace Direct Supabase Calls

**Before:**
```typescript
const { data: { user } } = await supabase.auth.getUser();
const { data: org } = await supabase.from("organization_members").select("org_id").eq("user_id", user.id).single();
```

**After:**
```typescript
import { aurev } from "@/lib/aurev";
const user = await aurev.getUser();
const orgId = await aurev.getOrg();
```

### Replace Direct Subscription Checks

**Before:**
```typescript
const { data: sub } = await supabase.from("subscriptions").select("plan").eq("user_id", user.id).single();
const plan = sub?.plan || "free";
```

**After:**
```typescript
import { aurev } from "@/lib/aurev";
const plan = await aurev.getPlan();
```

## Environment Variables

Make sure these are set:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRICE_PRO=price_pro_...
STRIPE_PRICE_ENTERPRISE=price_enterprise_...
AUREV_DASH_URL=https://dashboard.aurev.io
```


# Block 16700 — Upgrade Wall Enforcement v1 — Implementation Complete

## Overview

This block implements app-level "Upgrade Wall" enforcement that protects Free/Starter limits and automatically triggers upgrade modals when users hit limits. This is the conversion engine that turns signups into revenue.

## What Was Implemented

### 1. Plan Limit Constants

**Frontend:** `/lib/planLimits.ts`
- Shared constants for campaign and monthly email limits
- Used by frontend components for display and validation

**Backend:** `/lib/server/planLimits.ts`
- Mirror of frontend constants for server-side enforcement
- Ensures consistency between frontend and backend

### 2. Server-Side Plan Check Helpers

**File:** `/lib/server/checkPlan.ts`
- `canCreateCampaign(plan, currentCount)` - Checks if user can create campaigns
- `canSendEmail(plan, sentThisMonth)` - Checks if user can send emails
- `getUpgradeReason()` - Returns upgrade reason code for failed checks

### 3. API Enforcement

**Campaign Creation:** `/app/api/campaigns/route.ts`
- Updated to use new `canCreateCampaign()` helper
- Returns `403` with `upgrade_required` error when limit hit
- Error format: `{ error: "upgrade_required", reason: "campaign_limit", ... }`

**Email Sending:** `/app/api/campaigns/[id]/launch/route.ts`
- Updated to return `upgrade_required` format
- Checks monthly email quota before launching campaigns
- Error format: `{ error: "upgrade_required", reason: "monthly_email_limit", ... }`

### 4. Upgrade Modal Component

**File:** `/components/UpgradeModal.tsx`
- Clean, premium modal that shows upgrade options
- Handles three upgrade reasons:
  - `campaign_limit` - Campaign creation limit reached
  - `monthly_email_limit` - Monthly email quota reached
  - `feature_locked` - Feature requires higher plan
- Integrates with `/api/billing/create-checkout-session`
- Automatically redirects to Stripe checkout

### 5. Upgrade Gate Hook

**File:** `/hooks/useUpgradeGate.tsx`
- React hook for managing upgrade modal state
- `requireUpgrade(reason)` - Shows upgrade modal
- `close()` - Closes upgrade modal
- `upgradeReason` - Current upgrade reason (or null)

### 6. Feature Lock Enforcement

**Updated Components:**
- `/components/campaigns/FollowupToggle.tsx` - Now uses upgrade modal instead of link
- `/app/(dashboard)/revenue/page.tsx` - Added upgrade wall overlay for Domination-only feature

**Pattern:**
```tsx
const features = getFeatures(workspace.plan_key);
if (!features.revenueDashboard) {
  // Show upgrade wall overlay
}
```

### 7. Dashboard Upgrade Wall

**Revenue Dashboard:** `/app/(dashboard)/revenue/page.tsx`
- Shows blurred overlay when user is not on Domination plan
- "Upgrade to Domination" button triggers upgrade modal
- Blocks access to revenue tracking features

## Upgrade Reasons

1. **`campaign_limit`** - User hit campaign creation limit
   - Starter: 1 campaign
   - Growth: 3 campaigns
   - Domination: Unlimited

2. **`monthly_email_limit`** - User hit monthly email quota
   - Starter: 500 emails/month
   - Growth: 2,000 emails/month
   - Domination: Unlimited (20,000 fair-use cap)

3. **`feature_locked`** - Feature requires higher plan
   - Auto-followups: Growth+
   - Advanced routing: Growth+
   - Revenue dashboard: Domination only

## Integration Examples

See `/UPGRADE_WALL_INTEGRATION_EXAMPLE.md` for complete integration patterns.

### Basic Pattern:
```tsx
const { upgradeReason, requireUpgrade, close } = useUpgradeGate();

// In API call handler:
if (res.status === 403 && json.error === "upgrade_required") {
  requireUpgrade(json.reason);
}

// In render:
{upgradeReason && <UpgradeModal feature={upgradeReason} onClose={close} />}
```

## Files Created

1. `/lib/planLimits.ts` - Frontend plan limits
2. `/lib/server/planLimits.ts` - Backend plan limits
3. `/lib/server/checkPlan.ts` - Plan check helpers
4. `/components/UpgradeModal.tsx` - Upgrade modal component
5. `/hooks/useUpgradeGate.tsx` - Upgrade gate hook
6. `/UPGRADE_WALL_INTEGRATION_EXAMPLE.md` - Integration guide
7. `/BLOCK_16700_UPGRADE_WALL_IMPLEMENTATION.md` - This file

## Files Modified

1. `/app/api/campaigns/route.ts` - Added upgrade wall enforcement
2. `/app/api/campaigns/[id]/launch/route.ts` - Added email quota enforcement
3. `/components/campaigns/FollowupToggle.tsx` - Updated to use upgrade modal
4. `/app/(dashboard)/revenue/page.tsx` - Added upgrade wall overlay

## Next Steps

1. **Integrate in Campaign Creation Pages**
   - Update campaign creation forms to use `useUpgradeGate`
   - Show upgrade modal when API returns `upgrade_required`

2. **Add More Feature Locks**
   - Automation features (Growth+)
   - Advanced routing (Growth+)
   - Multi-campaign features (Growth+)

3. **Email Sending Worker Integration**
   - Add upgrade check in send queue worker
   - Log upgrade_required errors for tracking

4. **Analytics**
   - Track upgrade modal views
   - Track upgrade conversions
   - Monitor limit hits by plan

## Testing Checklist

- [ ] Create campaign when at limit → Shows upgrade modal
- [ ] Launch campaign when email quota exceeded → Shows upgrade modal
- [ ] Access revenue dashboard on Starter → Shows upgrade wall
- [ ] Click upgrade button → Redirects to Stripe checkout
- [ ] API returns correct error format for all limit types
- [ ] Upgrade modal shows correct plan recommendations

## Revenue Impact

This block is critical for monetization:
- **Campaign limits** → Drives Growth plan upgrades
- **Email limits** → Drives Growth/Domination upgrades
- **Feature locks** → Drives plan upgrades for specific features
- **Dashboard walls** → Creates urgency for Domination plan

Every limit hit is now a conversion opportunity.




























































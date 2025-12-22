# Block 23720 — SmartSend Roofing Upsell + Expansion Engine v1

## Implementation Summary

This block implements a comprehensive upsell system that automatically detects upgrade opportunities and presents contextual upgrade prompts to roofing customers at the right moments.

## What Was Implemented

### 1. Database Schema (`supabase/migrations/20250130000002_block23720_upsell_expansion_engine.sql`)

- **`upgrade_trigger_events` table**: Tracks all upgrade trigger events with cooldown logic
- **`upgrade_email_templates` table**: Stores email templates for upgrade communications
- **Helper functions**: 
  - `should_show_upgrade_trigger()` - Prevents spam with cooldown logic
  - `record_upgrade_trigger()` - Records trigger events

### 2. Upgrade Trigger Detection (`lib/upsell/trigger-detection.ts`)

Detects 5 main upgrade triggers:

1. **Campaign Limit Hit** - When user tries to create more campaigns than their plan allows
2. **Email Limit Approaching** - When user hits 80% of monthly email capacity
3. **High Engagement** - When user gets 10+ replies in a week
4. **First Campaign Launched** - Day 1 trigger for Starter users
5. **First Replies Received** - Day 5 trigger for Starter users

### 3. Contextual Upgrade Modal (`components/upsell/ContextualUpgradeModal.tsx`)

- Shows exact scripts from the upsell playbook
- Displays plan features and benefits
- One-click upgrade flow
- Tracks user interactions (shown, dismissed, clicked)

### 4. Upgrade Trigger Manager (`components/upsell/UpgradeTriggerManager.tsx`)

- Client-side component that checks for triggers periodically
- Shows upgrade modals at the right moments
- Respects cooldown periods (24 hours)

### 5. API Endpoints

- **`/api/upsell/check-triggers`** - Checks if user should see upgrade prompts
- **`/api/upsell/record-action`** - Records user interactions with upgrade prompts

### 6. Email Service (`lib/upsell/email-service.ts`)

- Sends contextual upgrade emails based on templates
- Supports scheduled emails (e.g., Day 5 email)
- Tracks email sends to prevent duplicates

### 7. Integration Points

- **Campaign Creation**: Records trigger when campaign limit is hit
- **Dashboard Layout**: Includes `UpgradeTriggerManager` component
- **Email Sending**: Can be extended to check email limits

## Upgrade Scripts Implemented

### Starter → Growth Scripts

1. **Campaign Limit Hit**: 
   > "You're getting traction already. Growth will let you run up to 3 campaigns at once, which means: ✔ Lead revival ✔ Free estimate ✔ Storm outreach all running automatically. Want me to upgrade you so we can launch your next campaign today?"

2. **Day 5 Replies**:
   > "You're getting replies — great start. Growth unlocks multi-campaign automation so you can run: • Lead revival • Free estimate • Storm outreach …all at the same time. Want me to upgrade your account?"

3. **Email Limit**:
   > "You're capped at 500 emails this month on Starter. Growth gives you 2,000 and advanced follow-up — perfect for booking more estimates consistently."

### Growth → Domination Scripts

1. **Campaign Limit Hit**:
   > "You're ready for unlimited campaigns. Domination is built for roofers who want full automation and consistent booked estimates across multiple crews."

2. **Storm Season**:
   > "Storms don't wait. Domination lets you run unlimited storm campaigns instantly — that's how roofers pick up huge months."

## Timing Implementation

- **Day 1**: Triggered when first campaign is launched (within 24 hours)
- **Day 5**: Triggered when user receives first replies (4-6 days after campaign launch)
- **80% Email Usage**: Triggered when approaching monthly limit
- **Campaign Limit**: Triggered immediately when limit is hit
- **High Engagement**: Triggered when 10+ replies received in a week

## Upgrade Email Templates

Three email templates are seeded:

1. **starter_to_growth_day5** - Sent 5 days after first campaign launch
2. **starter_limit_hit** - Sent when email limit is approaching
3. **growth_to_domination** - Sent when Growth users hit campaign limit

## Usage

### Automatic Triggers

The system automatically detects triggers when:
- User creates a campaign (checks campaign limits)
- User sends emails (can check email limits)
- User receives replies (checks engagement)

### Manual Trigger Check

```typescript
import { useUpgradeTriggers } from '@/hooks/useUpgradeTriggers';

function MyComponent() {
  const { primaryTrigger, checkTriggers } = useUpgradeTriggers();
  
  // primaryTrigger contains the highest priority trigger
  // checkTriggers() manually refreshes triggers
}
```

### Recording Triggers Server-Side

```typescript
import { recordUpgradeTrigger } from '@/lib/upsell/record-trigger';

await recordUpgradeTrigger({
  workspaceId,
  userId,
  triggerType: 'campaign_limit_hit',
  currentPlan: 'starter',
  suggestedPlan: 'growth',
  triggerData: { activeCampaigns: 1, maxCampaigns: 1 },
});
```

## Next Steps

1. **Scheduled Email Job**: Set up a cron job to call `checkAndSendScheduledUpgradeEmails()` daily
2. **Storm Season Detection**: Add logic to detect storm season and trigger Domination upsells
3. **Multi-City Detection**: Add logic to detect when users expand to multiple cities
4. **Crew Size Detection**: Add onboarding question about crew size and trigger appropriate plan suggestions
5. **Analytics**: Track conversion rates for each trigger type

## Files Created/Modified

### New Files
- `supabase/migrations/20250130000002_block23720_upsell_expansion_engine.sql`
- `lib/upsell/trigger-detection.ts`
- `lib/upsell/email-service.ts`
- `lib/upsell/record-trigger.ts`
- `components/upsell/ContextualUpgradeModal.tsx`
- `components/upsell/UpgradeTriggerManager.tsx`
- `hooks/useUpgradeTriggers.ts`
- `app/api/upsell/check-triggers/route.ts`
- `app/api/upsell/record-action/route.ts`

### Modified Files
- `src/app/dashboard/layout.tsx` - Added UpgradeTriggerManager component
- `app/api/campaigns/route.ts` - Added trigger recording when campaign limit hit

## Testing Checklist

- [ ] Campaign limit trigger shows when Starter user tries to create 2nd campaign
- [ ] Email limit trigger shows when user hits 80% of monthly limit
- [ ] High engagement trigger shows when 10+ replies received in a week
- [ ] First campaign trigger shows within 24 hours of first campaign launch
- [ ] First replies trigger shows 4-6 days after campaign launch
- [ ] Upgrade modal displays correct scripts for each trigger type
- [ ] Cooldown prevents showing same trigger multiple times
- [ ] Upgrade emails are sent at correct times
- [ ] User interactions (shown, dismissed, clicked) are tracked

## Notes

- All upgrade triggers are non-blocking - they don't prevent users from using the app
- Cooldown period is 24 hours to prevent spam
- Upgrade prompts are contextual and tied to actual user behavior
- Scripts match the exact copy from Block 23720 specification







































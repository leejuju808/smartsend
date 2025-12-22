# Block 21925 — SmartSend Roofing Lead Intent Classifier v1

## Implementation Summary

This implementation adds a comprehensive roofing-specific intent classification system that allows SmartSend to automatically understand what homeowners are trying to do and route/respond accordingly.

## What Was Implemented

### 1. Database Changes ✅

**Migration:** `supabase/migrations/20250130000002_block_21925_lead_intent_classifier_v1.sql`

- Added `last_intent` column to `leads` table for quick access to most recent intent
- Created indexes for efficient filtering by intent
- Added database trigger to automatically update `leads.last_intent` when activity intent changes
- Created `v_lead_intent_summary` view for analytics
- Updated column comments to document the 12 roofing-specific intents

### 2. Edge Function ✅

**File:** `supabase/functions/classify-intent/index.ts`

- New edge function that classifies homeowner messages into one of 12 roofing-specific intents
- Uses OpenAI GPT-4o-mini for classification
- Updates `lead_activities.homeowner_intent` column
- Updates `leads.last_intent` column
- Creates timeline events in `lead_timeline_events` table
- Handles errors gracefully

**The 12 Roofing-Specific Intents:**
1. `intent_book_estimate` - Wants to schedule an estimate
2. `intent_schedule_inspection` - Wants to schedule an inspection
3. `intent_needs_asap_service` - Urgent need, leaking, immediate service
4. `intent_request_price` - Asking for price/quote
5. `intent_price_shopping` - Comparing prices, getting multiple estimates
6. `intent_provide_insurance_info` - Providing insurance claim info
7. `intent_ask_insurance_process` - Asking about insurance process
8. `intent_ready_for_proposal` - Ready to move forward, wants proposal
9. `intent_still_deciding` - Still thinking, not ready to decide
10. `intent_question_about_scope` - Asking questions about work scope
11. `intent_not_interested` - Not interested, went with someone else
12. `intent_cancel_or_stop` - Wants to cancel or stop communication

### 3. UI Components ✅

**New Component:** `components/lead/IntentBadge.tsx`

- Displays roofing-specific intent badges with color coding
- Supports compact and full display modes
- Color scheme:
  - Green: Booking/scheduling intents, ready for proposal
  - Red: Urgent service needs
  - Blue: Price requests
  - Yellow: Price shopping
  - Purple: Insurance-related
  - Cyan: Questions about scope
  - Gray: Rejection/cancellation, still deciding

**Updated Component:** `components/lead/HomeownerToneTag.tsx`

- Updated to handle both legacy intents (Block 21823) and new roofing-specific intents (Block 21925)
- Backward compatible with existing tone/intent system
- Properly formats and colors the new roofing intents

### 4. Helper Functions ✅

**File:** `src/lib/homeowner-classification.ts`

Added two new functions:
- `classifyRoofingIntent()` - Classifies a message using the new roofing-specific intent classifier
- `classifyRoofingIntentActivity()` - Classifies an activity by ID

## How to Use

### Calling the Edge Function

```typescript
import { classifyRoofingIntent } from "@/lib/homeowner-classification";

// Classify a message
const result = await classifyRoofingIntent(
  activityId,
  messageBody,
  leadId // optional
);

if (result) {
  console.log("Intent:", result.intent);
}
```

### Displaying Intent Badges

```tsx
import { IntentBadge } from "@/components/lead/IntentBadge";

// In your component
<IntentBadge intent={lead.last_intent} compact={false} />
```

### Using with HomeownerToneTag

```tsx
import { HomeownerToneTag } from "@/components/lead/HomeownerToneTag";

// Displays both tone and intent
<HomeownerToneTag 
  tone={activity.homeowner_tone}
  intent={activity.homeowner_intent}
  compact={true}
/>
```

## Integration Points

The intent classifier can be integrated into:

1. **Pipeline Cards** - Show intent badge on lead cards
2. **Inbox Messages** - Display intent for each message
3. **Lead Detail Pages** - Show current intent in lead header
4. **Timeline** - Intent changes appear in timeline
5. **Action Queue** - Prioritize based on intent

## Logic Impact (Future Implementation)

The intent classification enables automatic actions:

- **intent_book_estimate** → Auto-send scheduling link, route to estimator
- **intent_needs_asap_service** → Emergency routing, owner alert, top priority
- **intent_request_price** → Auto-send price range template, create proposal task
- **intent_price_shopping** → Lower job probability, lower priority, add to follow-up
- **intent_provide_insurance_info** → Trigger insurance workflow, prioritize job
- **intent_not_interested** → Auto-mark "lost", trigger resurrection after 30 days
- **intent_ready_for_proposal** → Push "Send Proposal NOW" action, increase probability
- **intent_still_deciding** → Add nurturing follow-ups, slight probability decrease

## Next Steps

1. **Trigger Integration** - Set up automatic classification when `message_in` activities are created
2. **Automation Rules** - Implement the logic impacts described above
3. **UI Integration** - Add IntentBadge to pipeline cards, inbox, and lead detail pages
4. **Analytics** - Use `v_lead_intent_summary` view for intent-based analytics

## Testing

To test the implementation:

1. Create a `message_in` activity in `lead_activities`
2. Call the edge function with the activity ID and message body
3. Verify the intent is classified and stored in both `lead_activities` and `leads` tables
4. Check that a timeline event is created
5. Display the intent using `IntentBadge` component

## Files Created/Modified

### Created:
- `supabase/migrations/20250130000002_block_21925_lead_intent_classifier_v1.sql`
- `supabase/functions/classify-intent/index.ts`
- `components/lead/IntentBadge.tsx`

### Modified:
- `src/lib/homeowner-classification.ts` - Added roofing intent classification functions
- `components/lead/HomeownerToneTag.tsx` - Updated to handle new roofing intents

## Notes

- The edge function is backward compatible with the existing tone detection system
- Intent classification runs independently of tone classification
- The system supports both legacy intents (Block 21823) and new roofing-specific intents (Block 21925)
- Timeline events are created automatically when intent is classified
- The `last_intent` column on leads is automatically updated via database trigger










































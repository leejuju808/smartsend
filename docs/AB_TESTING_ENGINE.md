# Block 24020 — SmartSend Roofing A/B Testing Engine v1

## Overview

The SmartSend A/B Testing Engine automatically tests email variations to improve campaign performance for roofers. It's completely automatic, invisible to roofers, and focuses on metrics that matter: opens, replies, and booked estimates.

## Philosophy

**Roofers don't need to:**
- Choose variations
- Configure tests
- Read charts
- Interpret percentages

**SmartSend automatically:**
- Tests variations
- Chooses winners
- Improves campaigns
- Shows simple results ("This version wins")

## What Gets Tested

### 1. Subject Lines
- "Quick question about your roof in {{city}}"
- "About your home…"
- "Inspection availability this week"
- "Storm in your area — free inspection?"

### 2. Opening Line Variations
- "Saw you requested info earlier…"
- "Just reaching out about your roof in {{city}}…"
- "Not sure if you still need repairs, but…"

### 3. CTA Style (Soft vs Direct)
- "Do you still need a roof inspection?"
- "Want us to stop by tomorrow?"
- "Can we help with repairs this week?"

### 4. Follow-Up Timing
- Day 2 vs Day 3
- Day 4 vs Day 5
- Morning vs afternoon sends

## How It Works

### Automatic Test Triggers

Tests automatically start when:
1. Campaign hits 1,000+ sends
2. Campaign's open rate drops below 25%
3. Campaign runs for more than 3 weeks
4. Roofer runs a storm campaign
5. Roofer imports a new large list

### Test Execution Flow

1. **Split Recipients**: 10-20% of list gets test variants (A vs B)
2. **Measure Performance**: Track opens and replies for each variant
3. **Pick Winner**: Automatically select best performing variant
4. **Apply Winner**: Send winning variant to remaining 80-90%
5. **Learn**: Update "Roofing Brain" with learnings

### Winner Selection

Winner is chosen based on:
1. **Primary**: Reply rate (most important for roofers)
2. **Secondary**: Open rate (if reply rates are equal)

Minimum sample size: 50 emails per variant before declaring winner.

## Database Schema

### Tables

- `ab_tests` - Main test container
- `ab_test_variants` - Test variations (A vs B)
- `ab_test_recipients` - Which recipients got which variant
- `ab_test_results` - Simple results summary for roofers
- `roofing_brain` - Aggregate learnings across all roofers

### Key Functions

- `should_auto_test_ab(campaign_id)` - Check if campaign should auto-test
- `create_auto_ab_test(campaign_id, test_type)` - Create new test
- `check_ab_test_winner(test_id)` - Declare winner when ready
- `learn_from_ab_test(test_id)` - Update roofing brain
- `get_ab_test_result_summary(campaign_id)` - Get simple result for roofer

## Integration Points

### 1. Campaign Enqueue

When enqueueing campaign emails, check for active test:

```typescript
import { integrateAbTestOnEnqueue } from '@/lib/ab-testing/integrate-enqueue';

await integrateAbTestOnEnqueue(campaignId);
```

### 2. Email Tracking

Update test stats when emails are opened/replied:

```typescript
import { updateAbTestTracking } from '@/lib/ab-testing/integrate-enqueue';

await updateAbTestTracking({
  emailLogId: emailLog.id,
  leadId: lead.id,
  openedAt: new Date(),
  repliedAt: replyDate,
});
```

### 3. UI Component

Show test results to roofers:

```tsx
import { TestResultCard } from '@/components/ab-testing/TestResultCard';

<TestResultCard campaignId={campaign.id} />
```

## Cron Job

The A/B testing cron runs every hour (`/api/cron/ab-testing`) and:
- Checks campaigns that should auto-test
- Creates new tests automatically
- Checks running tests for winners
- Applies winners to remaining recipients

## Roofing Brain

The "Roofing Brain" learns from all tests across all roofers:

- **Regional Patterns**: If Florida roofers get higher open rates with weather subject lines, templates adjust for all Florida users
- **CTA Preferences**: If Washington responds better to repair CTAs, SmartSend adapts
- **Messaging Styles**: If revival campaigns work best with softer messaging, default templates update

This creates a self-improving system that gets better over time.

## What NOT to Test

- ❌ Roofer-written custom emails
- ❌ Full body text every time
- ❌ Small user segments
- ❌ Sending domains
- ❌ Super complex multi-variant tests
- ❌ UI design

Keep it simple. Keep it revenue-focused.

## Results Display

Roofers see ONE simple line:

🟩 "Winner Selected: Version A (12.4% reply rate)"

And a summary card explaining:
- Why this won
- More homeowners opened
- More homeowners replied
- Booked estimate potential increased

## Benefits

Most roofing companies:
- Never test subject lines
- Never test messages
- Never test timing
- Never improve anything

SmartSend does it all automatically → so roofers get:
- ✔ More opens
- ✔ More replies
- ✔ More booked estimates
- ✔ More roofs sold
- ✔ More revenue
- ✔ Higher ROI
- ✔ Higher trust in SmartSend

This is a retention and upgrade multiplier.







































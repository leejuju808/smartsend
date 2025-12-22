# Block 21998 — Job Momentum Score v1 — Integration Guide

This document explains how to integrate momentum score updates into your existing SmartSend systems.

## Overview

The Job Momentum Score (0-100) tracks whether a job is accelerating toward a win, stalled, or slipping away. It updates automatically based on communication patterns, timing, tone, intent, and activity.

## Quick Start

```typescript
import { updateJobMomentum, MomentumSignals } from "@/lib/momentum";

// Example: New message from homeowner
await updateJobMomentum(leadId, [
  MomentumSignals.NEW_MESSAGE_HOMEOWNER,
]);

// Example: Fast estimator response
await updateJobMomentum(leadId, [
  MomentumSignals.ESTIMATOR_REPLY_FAST,
]);
```

## Integration Points

### 1. Message Handlers

**When:** A new message arrives from homeowner or estimator

**Location:** `src/app/api/inbound/reply/route.ts`, `supabase/functions/email-inbound/index.ts`

```typescript
import { 
  updateJobMomentum, 
  MomentumSignals,
  calculateResponseTimeSignals,
  calculateHomeownerReplySignals 
} from "@/lib/momentum";

// After processing inbound message
if (isHomeownerMessage) {
  const signals = [
    MomentumSignals.NEW_MESSAGE_HOMEOWNER,
    ...calculateHomeownerReplySignals(
      lastEstimatorMessageAt,
      messageCreatedAt
    ),
  ];
  
  await updateJobMomentum(leadId, signals);
}

// After estimator sends reply
if (isEstimatorMessage) {
  const signals = [
    ...calculateResponseTimeSignals(
      homeownerMessageAt,
      estimatorReplyAt
    ),
  ];
  
  await updateJobMomentum(leadId, signals);
}
```

### 2. Tone/Intent Classification

**When:** Tone or intent is classified for a homeowner message

**Location:** `supabase/functions/classify-homeowner-message/index.ts`

```typescript
import { 
  updateJobMomentum, 
  calculateToneSignals,
  calculateIntentSignals 
} from "@/lib/momentum";

// After tone classification
const toneSignals = calculateToneSignals(classifiedTone);
const intentSignals = calculateIntentSignals(classifiedIntent);

await updateJobMomentum(leadId, [
  ...toneSignals,
  ...intentSignals,
]);
```

### 3. Proposal Events

**When:** Proposal is requested, sent, or viewed

**Location:** Proposal creation/sending handlers

```typescript
import { updateJobMomentum, MomentumSignals } from "@/lib/momentum";

// Proposal requested
await updateJobMomentum(leadId, [
  MomentumSignals.PROPOSAL_REQUESTED,
]);

// Proposal sent quickly (< 6 hours)
const proposalRequestedAt = /* ... */;
const proposalSentAt = /* ... */;
const hoursDiff = (proposalSentAt - proposalRequestedAt) / (1000 * 60 * 60);

if (hoursDiff < 6) {
  await updateJobMomentum(leadId, [
    MomentumSignals.PROPOSAL_SENT_FAST,
  ]);
} else if (hoursDiff > 24) {
  await updateJobMomentum(leadId, [
    MomentumSignals.ESTIMATOR_SLOW_PROPOSAL,
  ]);
}
```

### 4. Risk Score Updates

**When:** Risk score or category changes

**Location:** `supabase/functions/compute-risk-score/index.ts`

```typescript
import { 
  updateJobMomentum, 
  calculateRiskSignals 
} from "@/lib/momentum";

// After risk score calculation
const riskSignals = calculateRiskSignals(riskCategory);

if (riskSignals.length > 0) {
  await updateJobMomentum(leadId, riskSignals);
}
```

### 5. Experience Score Updates

**When:** Homeowner experience score changes

**Location:** `supabase/functions/update-homeowner-experience/index.ts`

```typescript
import { 
  updateJobMomentum, 
  calculateExperienceScoreSignals 
} from "@/lib/momentum";

// After experience score update
const experienceSignals = calculateExperienceScoreSignals(
  oldExperienceScore,
  newExperienceScore
);

if (experienceSignals.length > 0) {
  await updateJobMomentum(leadId, experienceSignals);
}
```

### 6. Time Gap Detection (Cron Job)

**When:** Periodic check for stalled jobs

**Location:** Create new cron job or add to existing daily check

```typescript
import { 
  updateJobMomentum, 
  calculateTimeGapSignals 
} from "@/lib/momentum";

// Check all active leads
const { data: activeLeads } = await supabase
  .from("leads")
  .select("id, last_activity_at")
  .in("status", ["new", "in_progress"]);

for (const lead of activeLeads) {
  const gapSignals = calculateTimeGapSignals(
    lead.last_activity_at,
    new Date()
  );
  
  if (gapSignals.length > 0) {
    await updateJobMomentum(lead.id, gapSignals);
  }
}
```

### 7. Pipeline Stage Changes

**When:** Lead moves to a new pipeline stage

**Location:** `app/api/pipeline/update-stage/route.ts`

```typescript
import { updateJobMomentum, MomentumSignals } from "@/lib/momentum";

// If moving forward quickly (positive signal)
if (isMovingForward && timeInPreviousStage < threshold) {
  await updateJobMomentum(leadId, [
    { type: "stage_moved_forward", value: 10 },
  ]);
}

// If stuck in stage too long (negative signal)
if (timeInStage > 72 * 60 * 60 * 1000) { // 72 hours
  await updateJobMomentum(leadId, [
    { type: "stuck_in_stage", value: -15 },
  ]);
}
```

## Signal Reference

### Positive Signals (Increase Momentum)

| Signal | Value | Trigger |
|--------|-------|---------|
| `new_message_homeowner` | +5 | New message from homeowner |
| `homeowner_reply_fast` | +10 | Homeowner replies in < 1 hour |
| `estimator_reply_fast` | +10 | Estimator replies in < 10 minutes |
| `tone_positive` | +10 | Positive tone detected |
| `homeowner_sends_photos` | +15 | Homeowner shares photos |
| `proposal_requested` | +25 | Homeowner requests proposal |
| `proposal_sent_fast` | +20 | Proposal sent in < 6 hours |
| `scheduling_questions` | +25 | Homeowner asks about scheduling |
| `homeowner_urgency` | +20 | Urgency expressed |
| `experience_score_rising` | +5 | Experience score rising |

### Negative Signals (Decrease Momentum)

| Signal | Value | Trigger |
|--------|-------|---------|
| `no_reply_24h` | -10 | 24 hours without reply |
| `no_contact_48h` | -20 | 48 hours without contact |
| `estimator_slow_response` | -10 | Estimator response > 1 hour |
| `estimator_slow_proposal` | -25 | Proposal sent > 24 hours |
| `tone_negative` | -20 | Negative tone detected |
| `intent_shopping` | -15 | Intent shifts to price shopping |
| `risk_medium` | -10 | Risk category = medium |
| `risk_high` | -20 | Risk category = high |
| `risk_critical` | -40 | Risk category = critical |
| `experience_score_declining` | -20 | Experience score drops > 10 points |

## UI Integration

### Display Momentum Meter

```tsx
import { MomentumMeter } from "@/components/pipeline/MomentumMeter";

// In pipeline card
<MomentumMeter 
  score={lead.momentum_score} 
  trend={lead.momentum_trend}
  size="sm"
/>

// In lead detail view
<MomentumMeter 
  score={lead.momentum_score} 
  trend={lead.momentum_trend}
  size="lg"
  variant="card"
/>

// Inline badge
<MomentumBadge 
  score={lead.momentum_score} 
  trend={lead.momentum_trend}
/>
```

### Visual Indicators

- **High momentum (≥70)**: Green, glowing effect
- **Medium momentum (40-69)**: Yellow
- **Low momentum (<40)**: Red, pulsing outline

## Database Queries

### Find Jobs with Low Momentum

```sql
SELECT id, name, momentum_score, momentum_trend
FROM leads
WHERE momentum_score < 30
  AND status IN ('new', 'in_progress')
ORDER BY momentum_score ASC;
```

### Find Jobs Gaining Momentum

```sql
SELECT id, name, momentum_score, momentum_trend
FROM leads
WHERE momentum_trend = 'positive'
  AND momentum_score > 50
ORDER BY momentum_score DESC;
```

## Action Queue Integration

Low momentum jobs should trigger action queue items:

```typescript
// In build-action-queue function
if (lead.momentum_score < 30 && lead.momentum_trend === 'negative') {
  tasks.push({
    lead_id: lead.id,
    type: 'revive_job',
    priority: 'high',
    title: 'Revive this job - momentum dropping',
    description: `Momentum score: ${lead.momentum_score} (${lead.momentum_trend})`,
  });
}
```

## Risk Engine Integration

Momentum can trigger risk updates:

```typescript
// In compute-risk-score function
if (lead.momentum_score < 30) {
  // Auto-move to "at risk"
  riskFactors.push({ type: 'low_momentum', weight: 20 });
}

if (lead.momentum_score < 15) {
  // Auto-move to "critical"
  riskFactors.push({ type: 'critical_momentum', weight: 40 });
}
```

## Testing

Test momentum updates with sample signals:

```typescript
import { updateJobMomentum, MomentumSignals } from "@/lib/momentum";

// Test positive momentum
await updateJobMomentum("lead-id", [
  MomentumSignals.NEW_MESSAGE_HOMEOWNER,
  MomentumSignals.HOMEOWNER_REPLY_FAST,
  MomentumSignals.PROPOSAL_REQUESTED,
]);

// Test negative momentum
await updateJobMomentum("lead-id", [
  MomentumSignals.NO_CONTACT_48H,
  MomentumSignals.ESTIMATOR_SLOW_RESPONSE,
  MomentumSignals.RISK_HIGH,
]);
```

## Monitoring

Check momentum distribution:

```sql
SELECT 
  momentum_trend,
  COUNT(*) as count,
  AVG(momentum_score) as avg_score,
  MIN(momentum_score) as min_score,
  MAX(momentum_score) as max_score
FROM leads
WHERE status IN ('new', 'in_progress')
GROUP BY momentum_trend;
```

## Next Steps

1. ✅ Database migration created
2. ✅ Edge function created
3. ✅ UI component created
4. ⏳ Integrate into message handlers
5. ⏳ Integrate into tone/intent classification
6. ⏳ Integrate into proposal handlers
7. ⏳ Add cron job for time gap detection
8. ⏳ Update action queue to use momentum
9. ⏳ Update risk engine to use momentum










































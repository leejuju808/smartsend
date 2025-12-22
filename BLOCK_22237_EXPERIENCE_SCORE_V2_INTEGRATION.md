# Block 22237 — Homeowner Experience Score v2 Integration Guide

## Overview
This document outlines how to integrate Experience Score v2 triggers into existing systems.

## When to Recalculate Experience Score

The Experience Score v2 should be recalculated automatically when:

### 1. New Messages Arrive
**Location**: `supabase/functions/insert-transcript-message/index.ts` or message ingestion handlers
**Trigger**: After inserting a new transcript message
```typescript
// After inserting transcript message
await supabase.functions.invoke("calculate-experience-score-v2", {
  body: { lead_id: leadId },
});
```

### 2. Tone Updates
**Location**: Tone Engine edge functions
**Trigger**: When homeowner tone is detected/changed
```typescript
// After tone classification
await supabase.functions.invoke("calculate-experience-score-v2", {
  body: { lead_id: leadId },
});
```

### 3. Intent Updates
**Location**: Intent Engine edge functions
**Trigger**: When intent classification changes
```typescript
// After intent classification
await supabase.functions.invoke("calculate-experience-score-v2", {
  body: { lead_id: leadId },
});
```

### 4. Proposal Delays
**Location**: Proposal creation/update handlers
**Trigger**: When proposal is sent late or delayed
```typescript
// Check if proposal is late
const daysSinceCreated = (Date.now() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24);
if (daysSinceCreated > 3 && !hasProposal) {
  await supabase.functions.invoke("calculate-experience-score-v2", {
    body: { lead_id: leadId },
  });
}
```

### 5. Momentum Changes
**Location**: Momentum Engine edge functions
**Trigger**: When momentum score changes significantly
```typescript
// After momentum calculation
if (Math.abs(newMomentum - oldMomentum) > 10) {
  await supabase.functions.invoke("calculate-experience-score-v2", {
    body: { lead_id: leadId },
  });
}
```

### 6. Stage Friction
**Location**: Pipeline stage update handlers
**Trigger**: When job stalls in a stage
```typescript
// Check for stage stagnation
const daysInStage = (Date.now() - new Date(stageEnteredAt).getTime()) / (1000 * 60 * 60 * 24);
if (daysInStage > 7) {
  await supabase.functions.invoke("calculate-experience-score-v2", {
    body: { lead_id: leadId },
  });
}
```

### 7. Hot Lead Cooling
**Location**: Hot Lead Detector edge functions
**Trigger**: When hot lead becomes slow/unresponsive
```typescript
// After detecting hot lead cooling
if (wasHot && !isHot) {
  await supabase.functions.invoke("calculate-experience-score-v2", {
    body: { lead_id: leadId },
  });
}
```

### 8. Estimator Behavior Changes
**Location**: Follow-up delay detection
**Trigger**: When estimator follow-up is delayed
```typescript
// Check for slow follow-up
const hoursSinceLastMessage = (Date.now() - new Date(lastMessageAt).getTime()) / (1000 * 60 * 60);
if (hoursSinceLastMessage > 24 && lastMessageSender === "homeowner") {
  await supabase.functions.invoke("calculate-experience-score-v2", {
    body: { lead_id: leadId },
  });
}
```

## Database Triggers (Optional)

You can also add database triggers to automatically recalculate when certain fields change:

```sql
-- Trigger on homeowner_experience_score change (if needed)
CREATE OR REPLACE FUNCTION trigger_experience_score_recalc()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger if score changed significantly
  IF ABS(NEW.homeowner_experience_score - OLD.homeowner_experience_score) > 5 THEN
    -- Call edge function via pg_net or similar
    PERFORM net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/calculate-experience-score-v2',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
      ),
      body := jsonb_build_object('lead_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

## Integration Checklist

- [ ] Add trigger to transcript message insertion
- [ ] Add trigger to tone engine updates
- [ ] Add trigger to intent engine updates
- [ ] Add trigger to proposal creation/updates
- [ ] Add trigger to momentum score changes
- [ ] Add trigger to pipeline stage changes
- [ ] Add trigger to hot lead status changes
- [ ] Add trigger to follow-up delay detection
- [ ] Test all triggers with sample data
- [ ] Monitor edge function invocations for performance

## Performance Considerations

- Batch recalculations if multiple events occur simultaneously
- Debounce rapid updates (e.g., don't recalculate more than once per minute per lead)
- Use queue system for high-volume updates
- Cache results when possible

## Example Integration

```typescript
// Example: In transcript message insertion handler
async function insertTranscriptMessage(message: TranscriptMessage) {
  // Insert message
  const { data, error } = await supabase
    .from("transcript_messages")
    .insert(message)
    .select()
    .single();

  if (error) throw error;

  // Trigger experience score recalculation (debounced)
  await debouncedRecalculateExperienceScore(message.lead_id);

  return data;
}

// Debounce function to prevent excessive calls
const experienceScoreRecalcQueue = new Map<string, NodeJS.Timeout>();

async function debouncedRecalculateExperienceScore(leadId: string) {
  // Clear existing timeout
  if (experienceScoreRecalcQueue.has(leadId)) {
    clearTimeout(experienceScoreRecalcQueue.get(leadId)!);
  }

  // Set new timeout (wait 30 seconds before recalculating)
  const timeout = setTimeout(async () => {
    await supabase.functions.invoke("calculate-experience-score-v2", {
      body: { lead_id: leadId },
    });
    experienceScoreRecalcQueue.delete(leadId);
  }, 30000);

  experienceScoreRecalcQueue.set(leadId, timeout);
}
```










































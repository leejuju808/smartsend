# Block 20990 — SmartSend Reply Classification Engine v2

## Overview

This is **ONE OF THE MOST IMPORTANT BRAINS IN SMARTSEND**.

Reply Classification Engine v2 turns homeowner + adjuster replies into:
- **Actions** (stage updates, notifications, calendar events)
- **Signals** (extracted data: adjuster names, claim numbers, dates)
- **Triggers** (automated workflows)
- **Lead scoring** (heat score upgrades)
- **Stage updates** (pipeline automation)
- **AI-driven insights** (activity feed events)

**No manual reading needed.** SmartSend reads every message and instantly knows what to do.

## Architecture

### Database Schema

**Table: `reply_classifications`**
- Stores all classification results with confidence scores
- Tracks extracted data (adjuster names, claim numbers, dates, etc.)
- Records triggered actions (what SmartSend did)
- Links to messages, threads, and leads

### Classification Categories

#### Homeowner Intent (14 categories)
1. `interested_wants_inspection` - Wants inspection scheduled
2. `interested_wants_estimate` - Asking for estimate/quote
3. `interested_ready_to_book` - "Let's get started", "when can we schedule"
4. `interested_wants_to_move_forward` - Ready to move forward (less explicit)
5. `insurance_claim_filed` - Claim filed
6. `insurance_adjuster_scheduled` - Adjuster appointment scheduled
7. `insurance_needs_help_filing_claim` - Needs help filing claim
8. `insurance_claim_approved` - Claim approved
9. `insurance_approval_attached` - Approval letter/document attached
10. `insurance_asking_questions` - Asking insurance questions
11. `price_concern_objection` - Price/cost concerns
12. `not_interested_already_hired` - Already hired someone else
13. `not_interested_no_damage` - No damage
14. `not_interested_remove_me` - Unsubscribe/remove

#### Adjuster Intent (10 categories)
1. `adjuster_scheduled_appointment` - Scheduling appointment
2. `adjuster_requesting_photos` - Requesting photos
3. `adjuster_requesting_estimate` - Requesting contractor estimate
4. `adjuster_denied_supplement` - Denied supplement
5. `adjuster_pending_review` - Claim pending review
6. `adjuster_approved_supplement` - Approved supplement
7. `adjuster_asking_homeowner_info` - Asking homeowner for info
8. `adjuster_sending_scope` - Sending scope of work
9. `adjuster_adjusting_pricing` - Adjusting pricing
10. `adjuster_approved_claim` - Approved claim

### Secondary Signal Extraction

For each message, SmartSend extracts:

**From Homeowners:**
- Adjuster name
- Carrier (State Farm, Allstate, etc.)
- Claim number
- Date of adjuster appointment
- Date of storm damage
- Insurance questions
- Deductible info (amount, type)
- ACV/RCV language
- Approval wording
- "Ready to book" phrases
- Roof type / location

**From Adjusters:**
- Missing photos
- Missing documentation
- Scope PDF detected
- Approval PDF detected
- Market pricing language
- Approval/denial terms

### Lead Heat Score Upgrade

New weighting signals:
- **+30 points**: "We want to move forward" / "Ready to book"
- **+25 points**: "When can we start?"
- **+20 points**: Insurance approval attached
- **+15 points**: Adjuster scheduled
- **+10 points**: Asking for estimate
- **+5-10 points**: Replying with questions
- **-10 points**: Price objection
- **-50 points**: Not interested
- **-100 points**: Remove me

### Pipeline Stage Updates

Classifications automatically move jobs:
- `insurance_adjuster_scheduled` → `ADJUSTER_SCHEDULED`
- `insurance_claim_approved` → `CLAIM_APPROVED`
- `interested_ready_to_book` → `INSTALL_READY`
- `interested_wants_estimate` → `NEW_LEAD`
- `not_interested_already_hired` → `LOST`
- `not_interested_remove_me` → `NOT_A_FIT`

### Activity Feed Events

Every classification creates activity feed events with:
- Icon (🔥, 📄, 🧰, ⚠, etc.)
- Description
- Action suggestion
- Timestamp

Examples:
- 🔥 Homeowner is ready to move forward — CALL NOW
- 📄 Approval letter parsed — RCV $28,500
- 🧰 Adjuster requested photos — add to calendar
- ⚠ Price objection — recommended script ready

## Usage

### Automatic Classification

Classification happens automatically when new inbound messages arrive via database triggers.

### Manual Classification

Call the edge function directly:

```typescript
const response = await fetch(`${SUPABASE_URL}/functions/v1/reply-classify-v2`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
  },
  body: JSON.stringify({
    message_id: 'uuid-of-message'
  })
});
```

### Database Function

Process classification directly in database:

```sql
SELECT public.process_reply_classification_v2(
  p_message_id := 'uuid',
  p_thread_id := 'uuid',
  p_lead_id := 'uuid',
  p_classification := 'interested_ready_to_book',
  p_confidence_score := 0.95,
  p_extracted_data := '{"ready_to_book_phrases": ["let's get started"]}'::jsonb,
  p_insurance_context := '{"carrier": "State Farm"}'::jsonb
);
```

## Database Functions

### `process_reply_classification_v2()`
Main processing function that:
1. Saves classification to `reply_classifications` table
2. Updates lead heat score
3. Updates pipeline stage
4. Creates activity feed events
5. Triggers special actions (proposals, calendar events, suppressions)

### `update_lead_heat_from_classification()`
Updates lead heat score based on classification with confidence weighting.

### `update_pipeline_stage_from_classification()`
Updates pipeline stage in `roofing_jobs` and `inbox_threads` tables.

### `create_activity_feed_from_classification()`
Creates activity feed event with icon, description, and action suggestion.

## Integration Points

### Insurance Brain (Block 20360)
- Uses insurance context from `inbox_threads` for better classification
- Extracts carrier, claim status, RCV, deductible, supplements

### Pipeline Sync (Block 20620)
- Automatically updates `roofing_jobs` stages
- Maps classifications to pipeline stages

### Activity Feed (Block 20680)
- Creates activity feed events for each classification
- Provides icons, descriptions, and action suggestions

### Hot Lead Priority (Block 20430)
- Updates lead heat scores based on classifications
- Marks leads as HOT when ready to book

## Example Flow

1. **Homeowner sends email**: "We want to move forward with the roof replacement. When can we schedule?"

2. **Classification Engine**:
   - Classification: `interested_ready_to_book`
   - Confidence: 0.95
   - Extracted: `{"ready_to_book_phrases": ["move forward", "when can we schedule"]}`

3. **Actions Triggered**:
   - Lead heat score: +30 points
   - Pipeline stage: `INSTALL_READY`
   - Activity feed: 🔥 Homeowner is ready to move forward — CALL NOW
   - Proposal suggested: true
   - Lead marked as HOT

4. **Result**: Roofer gets instant notification with all context and next actions.

## Testing

Test classification manually:

```sql
-- Get a recent inbound message
SELECT id, thread_id, lead_id, subject, body_text
FROM messages
WHERE direction = 'inbound'
ORDER BY created_at DESC
LIMIT 1;

-- Classify it
SELECT public.process_reply_classification_v2(
  p_message_id := 'your-message-id',
  p_thread_id := 'your-thread-id',
  p_lead_id := 'your-lead-id',
  p_classification := 'interested_ready_to_book',
  p_confidence_score := 0.95,
  p_extracted_data := '{}'::jsonb,
  p_insurance_context := '{}'::jsonb
);
```

## Monitoring

Query classification results:

```sql
-- Recent classifications
SELECT 
  rc.classification,
  rc.confidence_score,
  rc.extracted_data,
  rc.triggered_actions,
  l.email as lead_email,
  rc.created_at
FROM reply_classifications rc
LEFT JOIN leads l ON rc.lead_id = l.id
ORDER BY rc.created_at DESC
LIMIT 50;

-- Classification accuracy by category
SELECT 
  classification,
  COUNT(*) as count,
  AVG(confidence_score) as avg_confidence,
  MIN(confidence_score) as min_confidence,
  MAX(confidence_score) as max_confidence
FROM reply_classifications
GROUP BY classification
ORDER BY count DESC;
```

## Future Enhancements

- [ ] Add training data collection for model improvement
- [ ] Add classification confidence thresholds
- [ ] Add manual override/correction UI
- [ ] Add classification analytics dashboard
- [ ] Add A/B testing for different classification models
- [ ] Add multi-language support

















































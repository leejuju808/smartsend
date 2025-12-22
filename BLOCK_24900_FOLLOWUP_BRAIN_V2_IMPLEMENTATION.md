# Block 24900 — SmartSend Roofing Follow-Up Brain v2

**Adaptive Follow-Up • NLP Reply Understanding • Hot Lead Activation • Personality-Based Sequences • True AI Follow-Up That Books More Roofing Jobs**

## Overview

Follow-Up Brain v2 is the intelligent roofing follow-up engine that makes SmartSend's follow-up smarter, more human, and 10× more effective than any CRM or cold email tool.

This version fixes the #1 reason roofers lose money: **bad follow-up**.

## Key Features

### ✅ NLP Reply Detection (5 Types)
- **Hot Lead Intent**: "How soon can you come?", "We have a leak"
- **Warm Lead / Interested**: "Can you send options?", "I'm comparing quotes"
- **Not Ready Yet**: "Maybe next month", "We're waiting for insurance"
- **Objection**: "Too expensive", "We already have someone"
- **Not Interested / Dead Lead**: "Stop emailing", "No thanks"

### ✅ Adaptive Follow-Up Modes (4 Modes)
- **Direct Mode**: Short, fast, no fluff (decisive homeowners)
- **Reassurance Mode**: Warm, comforting, educational (nervous homeowners)
- **Authority Mode**: Professional, detailed, proof-driven (logical homeowners)
- **Revival Mode**: Curiosity-based (unresponsive homeowners)

### ✅ Hot Lead Activation
- Instant notification to owner and reps
- Auto-reply sent immediately
- Priority tagging
- "Book Inspection Now" prompt

### ✅ Behavior-Adaptive Timing
- Tracks open times and reply patterns
- Optimizes send times based on homeowner behavior
- Time-of-day and day-of-week optimization

### ✅ Follow-Up Sequences (4 Types)
- **Inspection Booking**: "Want morning or afternoon?"
- **Quote Follow-Up**: "Any questions about the options?"
- **Insurance Nurture**: "Any update from adjuster?"
- **Dormant Lead Revival**: "Still need help with your roof?"

### ✅ NLP Objection Handling
- Detects objections automatically
- Generates personalized replies
- Handles price, timing, competitor objections

### ✅ Priority Stack (4 Tiers)
- **Tier 1**: HOT LEADS (needs immediate follow-up)
- **Tier 2**: WARM LEADS (needs nurturing)
- **Tier 3**: INSURANCE LEADS (needs steady check-ins)
- **Tier 4**: DORMANT LEADS (needs revival)

### ✅ Follow-Up Brain Score
- Overall effectiveness score (0-100)
- Average reply time tracking
- Hot leads caught count
- Missed leads alerts
- Reply rate and conversion rate

## Architecture

### Database Tables

1. **followup_nlp_detections** - Stores NLP classification of replies
2. **followup_modes** - Tracks follow-up mode per lead
3. **hot_lead_activations** - Logs hot lead activations
4. **homeowner_behavior_patterns** - Tracks behavior for timing optimization
5. **followup_sequences** - Defines sequence templates
6. **followup_sequence_executions** - Tracks sequence step execution
7. **objection_handling** - Stores objections and auto-replies
8. **followup_priority_stack** - Organizes leads by priority tier
9. **followup_brain_scores** - Stores diagnostic scores
10. **conversation_momentum** - Tracks conversation momentum

### Core Libraries

- `nlp-detection.ts` - NLP reply detection engine
- `adaptive-modes.ts` - Follow-up mode generation
- `hot-lead-activation.ts` - Hot lead activation system
- `behavior-timing.ts` - Behavior-adaptive timing engine
- `sequences.ts` - Follow-up sequence management
- `objection-handling.ts` - Objection detection and handling
- `priority-stack.ts` - Priority tier management
- `scoring.ts` - Follow-Up Brain Score calculation

### API Routes

- `/api/followup-brain-v2/detect` - Process reply and detect type
- `/api/followup-brain-v2/process-sequences` - Process pending sequences
- `/api/followup-brain-v2/activate-hot-lead` - Activate hot lead
- `/api/followup-brain-v2/score` - Calculate Follow-Up Brain Score

### Edge Function

- `supabase/functions/followup-brain-v2/index.ts` - Main orchestration function

## Usage

### Processing a Reply

```typescript
import { detectReplyType } from '@/lib/followup-brain-v2';

const detection = await detectReplyType(replyText, subject);
// Returns: { detection_type, confidence_score, homeowner_tone, etc. }
```

### Activating a Hot Lead

```typescript
import { activateHotLead } from '@/lib/followup-brain-v2';

const result = await activateHotLead(leadId, detectionId, trigger);
// Sends notifications and auto-reply
```

### Starting a Sequence

```typescript
import { startSequence } from '@/lib/followup-brain-v2';

await startSequence(leadId, 'inspection_booking', workspaceId);
```

### Calculating Score

```typescript
import { calculateFollowUpBrainScore } from '@/lib/followup-brain-v2';

const score = await calculateFollowUpBrainScore(workspaceId);
// Returns: { overallScore, avgReplyTimeMinutes, hotLeadsCaught, etc. }
```

## Setup & Deployment

### 1. Run Migration

```bash
supabase migration up
```

This creates all necessary tables, indexes, triggers, and seed data.

### 2. Deploy Edge Function

```bash
supabase functions deploy followup-brain-v2
```

### 3. Configure CRON (Optional)

Add to `supabase/config.toml`:

```toml
[cron.jobs."followup-brain-v2-process"]
schedule = "*/15 * * * *"  # Every 15 minutes
endpoint = "/functions/v1/followup-brain-v2"
```

### 4. Integrate with Reply Webhook

When a reply is received, call:

```typescript
POST /api/followup-brain-v2/detect
{
  "lead_id": "...",
  "reply_text": "...",
  "reply_id": "...",
  "subject": "..."
}
```

## How It Works

### 1. Reply Detection Flow

1. Homeowner sends reply
2. NLP detection analyzes reply
3. Detection stored in `followup_nlp_detections`
4. Priority tier updated automatically (trigger)
5. Actions triggered based on detection type:
   - Hot lead → Activation
   - Objection → Auto-reply
   - Warm lead → Sequence started
   - Not interested → Follow-ups stopped

### 2. Hot Lead Activation Flow

1. Hot lead detected
2. Owner and rep notifications sent
3. Auto-reply sent immediately
4. Lead tagged as priority
5. Timeline event created

### 3. Sequence Execution Flow

1. Sequence started for lead
2. Steps scheduled based on behavior patterns
3. CRON job processes pending steps
4. Emails sent at optimal times
5. Steps skipped if lead replies

### 4. Behavior Timing Flow

1. Email opens/replies tracked
2. Behavior pattern updated
3. Preferred hours/days calculated
4. Optimal send time calculated
5. Next follow-up scheduled at optimal time

## Monitoring

### Check Hot Leads

```sql
SELECT 
  hla.*,
  l.email,
  l.first_name
FROM hot_lead_activations hla
JOIN leads l ON l.id = hla.lead_id
WHERE hla.notification_sent = FALSE
ORDER BY hla.created_at DESC;
```

### Check Priority Stack

```sql
SELECT 
  fps.*,
  l.email,
  l.status
FROM followup_priority_stack fps
JOIN leads l ON l.id = fps.lead_id
ORDER BY fps.priority_tier, fps.priority_score DESC;
```

### Check Follow-Up Score

```sql
SELECT 
  *
FROM followup_brain_scores
WHERE workspace_id = '...'
ORDER BY score_period_start DESC
LIMIT 1;
```

## Benefits for Roofers

1. **Never miss a hot lead** - Instant activation and notifications
2. **Higher reply rates** - Behavior-adaptive timing
3. **Better conversions** - Personality-matched follow-ups
4. **Objection handling** - Auto-replies to objections
5. **Measurable results** - Follow-Up Brain Score
6. **Time savings** - Automated follow-up sequences
7. **More bookings** - Intelligent sequence management

## Future Enhancements

- [ ] A/B testing for follow-up messages
- [ ] SMS follow-ups for hot leads
- [ ] Multi-language support
- [ ] Custom sequence builder UI
- [ ] Advanced analytics dashboard
- [ ] Integration with calendar scheduling
- [ ] Voice call follow-ups for tier 1 leads

## Acceptance Criteria

✅ NLP detection works for all 5 reply types  
✅ Adaptive modes generate appropriate messages  
✅ Hot leads activate instantly with notifications  
✅ Behavior timing optimizes send times  
✅ Sequences execute automatically  
✅ Objections handled with auto-replies  
✅ Priority stack organizes leads correctly  
✅ Follow-Up Brain Score calculates accurately  
✅ All database tables created with proper indexes  
✅ RLS policies enforce workspace isolation  
✅ API routes handle errors gracefully  

## Files Created

### Database
- `supabase/migrations/20250130000004_block_24900_followup_brain_v2.sql`

### Libraries
- `src/lib/followup-brain-v2/nlp-detection.ts`
- `src/lib/followup-brain-v2/adaptive-modes.ts`
- `src/lib/followup-brain-v2/hot-lead-activation.ts`
- `src/lib/followup-brain-v2/behavior-timing.ts`
- `src/lib/followup-brain-v2/sequences.ts`
- `src/lib/followup-brain-v2/objection-handling.ts`
- `src/lib/followup-brain-v2/priority-stack.ts`
- `src/lib/followup-brain-v2/scoring.ts`
- `src/lib/followup-brain-v2/index.ts`

### API Routes
- `src/app/api/followup-brain-v2/detect/route.ts`
- `src/app/api/followup-brain-v2/process-sequences/route.ts`
- `src/app/api/followup-brain-v2/activate-hot-lead/route.ts`
- `src/app/api/followup-brain-v2/score/route.ts`

### Edge Function
- `supabase/functions/followup-brain-v2/index.ts`

## Summary

Follow-Up Brain v2 is a complete intelligent follow-up system that:

- Detects homeowner intent using NLP
- Adapts follow-up style to homeowner personality
- Activates hot leads instantly
- Optimizes timing based on behavior
- Manages sequences automatically
- Handles objections intelligently
- Prioritizes leads effectively
- Provides measurable diagnostics

This makes SmartSend the closest thing to having a 24/7 AI sales rep that never forgets, never misses, and always follows up at the right time with the right message.







































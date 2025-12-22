# Block 16000 — SmartSend AI Reply Brain v2

## 🎯 Mission Complete

Turned the reply classifier from a simple "hot/warm/not interested" system into a full-scale roofing communication brain that understands EVERYTHING a homeowner writes.

**This is the block that makes roofers feel like:**
> "SmartSend reads messages better than my office manager."

---

## ✅ What Was Built

### 1. **18 Reply Categories (v2 — Roofing Optimized)**

Every homeowner reply falls into one of these categories:

**🔥 HOT LEADS:**
- `yes_wants_estimate` - "I want an estimate"
- `yes_come_inspect` - "Come inspect" / "Can you come look?"
- `booking_link_clicked` - They clicked a booking link
- `insurance_claim_active` - "I filed a claim" / "Insurance said..."
- `adjuster_coming_soon` - "Adjuster is coming" / "Meeting with adjuster"

**🟡 WARM LEADS:**
- `has_question` - Asking questions (but not ready to book)
- `wants_pricing` - "How much?" / "What do you charge?"
- `wants_availability` - "When are you available?"
- `wants_more_info` - "Tell me more" / "Send info"
- `needs_photos` - "Can you send photos?" / "Show me examples"
- `considering_not_sure` - "Thinking about it" / "Not sure yet"

**🔵 COLD LEADS:**
- `not_now_maybe_later` - "Not now, maybe later"
- `checking_around` - "Checking around" / "Getting quotes"
- `already_got_quotes` - "Already got quotes" / "Already have someone"

**🔴 HARD NO:**
- `not_interested` - "Not interested" / "No thanks"
- `wrong_person` - "Wrong person" / "Don't own this"
- `stop_messaging` - "Stop emailing" / "Remove me"

**⚠ SPECIAL FLAGS:**
- `urgent_roof_damage` - Mentions leaking, water, hole, shingles blown off, etc.

---

### 2. **Emotional Tone Detection**

AI detects the emotional tone of every reply:
- `neutral` - Standard, matter-of-fact
- `curious` - Asking questions, interested
- `confused` - Needs clarification
- `annoyed` - Frustrated or irritated
- `interested` - Engaged and curious
- `excited` - Enthusiastic
- `urgent` - Time-sensitive, needs immediate attention
- `frustrated` - Annoyed or upset
- `skeptical` - Doubtful or questioning
- `demanding` - Assertive or insistent

**Example:**
```
Homeowner: "Hey, water is leaking near the kitchen. Can you come today?"

SmartSend marks:
- Category: urgent_roof_damage
- Tone: urgent
- Confidence: 97%
```

---

### 3. **Question Extraction**

SmartSend extracts ALL questions from a homeowner reply:

**Example:**
```
Homeowner: "When are you available? Do you charge for inspections?"

SmartSend detects:
- Question 1: "When are you available?" → Type: availability
- Question 2: "Do you charge for inspections?" → Type: pricing
- Intent: Wants inspection
- Tone: Curious → Warm
```

**Question Types:**
- `availability` - When are you available?
- `pricing` - How much does it cost?
- `inspection` - Can you inspect?
- `insurance` - Insurance-related questions
- `process` - How does the process work?
- `timeline` - How long will it take?
- `warranty` - Warranty questions
- `materials` - Material questions
- `other` - Other questions

---

### 4. **Insurance Intent Recognition**

SmartSend detects insurance-related keywords and automatically:
- Adds `insurance-opportunity` tag
- Moves to "HOT" pipeline stage
- Suggests proper insurance sequence
- Suggests time-sensitive follow-up

**Detected Keywords:**
- adjuster
- claim
- insurance
- deductible
- ACV/RCV
- coverage
- carrier
- "filed a claim"

**This gets the BIGGEST jobs.**

---

### 5. **Booking Intent Detection**

Triggers include:
- "Can you come check it?"
- "When can you stop by?"
- "Tomorrow works for me."
- "Where do I book?"

SmartSend automatically:
- Marks lead as HOT
- Opens scheduler suggestions
- Adds "ready-to-book" tag
- Suggests quick booking link

---

### 6. **Objection Detection**

SmartSend detects objections like:
- "Is your price negotiable?" → `price_too_high`
- "I'm getting other quotes." → `getting_other_quotes`
- "That sounds too expensive." → `price_too_high`
- "We don't need a new roof." → `not_needed`
- "My husband handles this." → `wrong_person`

This helps roofers CLOSE more jobs by identifying obstacles early.

---

### 7. **Auto-Suggestion Engine**

At the bottom of each message, SmartSend shows:

**Suggested Replies (AI):**
- "Offer inspection availability tomorrow"
- "Send booking link"
- "Answer pricing question with template"
- "Recommend insurance prep steps"
- "Move to HOT pipeline column?"

Each suggestion includes:
- Action text
- Priority (1-10, higher = more important)
- Reasoning

Roofers feel like SmartSend is right there with them.

---

### 8. **Auto Pipeline Movement**

SmartSend automatically moves contacts:

**HOT →**
- Booking intent
- Insurance intent
- Storm damage
- Yes to inspection

**WARM →**
- Questions
- Not urgent
- Needs info

**COLD →**
- Not now
- Maybe later

**NOT_INTERESTED →**
- Hard no
- Wrong person

Contractors feel like pipeline manages itself.

---

### 9. **Logging + Timeline Events**

Each reply generates:
- Intent classification
- Emotion
- Extracted questions
- Next-step suggestion
- Pipeline movement
- Tags added

Stored in: `reply_intelligence_events`

This lets you track performance and understand what homeowners are saying.

---

## 📁 Files Created

### Database Migration
- `supabase/migrations/20250130000001_block16000_reply_brain_v2.sql`
  - Creates `reply_intelligence_events` table
  - Adds enhanced fields to `inbound_messages`
  - Creates auto pipeline movement functions
  - Creates auto tagging functions
  - Sets up database triggers

### TypeScript Implementation
- `src/lib/ai/replyBrainV2.ts`
  - Main AI classification function
  - Comprehensive intelligence analysis
  - All 18 categories, tone detection, question extraction, etc.

- `src/lib/ai/replyIntelligenceIntegration.ts`
  - Helper functions to integrate with existing reply processing
  - `processReplyWithIntelligenceV2()` - Main integration function
  - `getIntelligenceEvents()` - Fetch intelligence history
  - `getLatestIntelligenceForContact()` - Get latest intelligence for a contact

### API Routes
- `src/app/api/replies/intelligence/route.ts`
  - POST: Analyze reply with intelligence v2
  - GET: Fetch intelligence events

### Integration
- Updated `app/api/replies/[id]/classify/route.ts`
  - Integrated Reply Brain v2 alongside existing v1 classification
  - Returns both v1 and v2 results

---

## 🚀 How to Use

### Option 1: Use the API Route

```typescript
// POST /api/replies/intelligence
const response = await fetch('/api/replies/intelligence', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    inbound_message_id: 'uuid',
    contact_id: 'uuid',
    campaign_id: 'uuid',
    workspace_id: 'uuid',
    text: 'Homeowner reply text',
    subject: 'Email subject'
  })
});

const { intelligence } = await response.json();
// intelligence contains all the analysis
```

### Option 2: Use the Integration Function

```typescript
import { processReplyWithIntelligenceV2 } from '@/lib/ai/replyIntelligenceIntegration';

const intelligence = await processReplyWithIntelligenceV2({
  inboundMessageId: 'uuid',
  contactId: 'uuid',
  campaignId: 'uuid',
  workspaceId: 'uuid',
  text: 'Homeowner reply text',
  subject: 'Email subject'
});

// Intelligence is automatically stored and pipeline is moved
```

### Option 3: Use Directly in Reply Processing

The system is already integrated into the existing `/api/replies/[id]/classify` route. When you classify a reply, it automatically runs both v1 and v2 analysis.

---

## 📊 Database Schema

### `reply_intelligence_events` Table

Stores comprehensive intelligence for each reply:

```sql
- id: uuid (primary key)
- created_at: timestamptz
- inbound_message_id: uuid (FK to inbound_messages)
- contact_id: uuid (FK to contacts)
- campaign_id: uuid (FK to campaigns)
- workspace_id: uuid (FK to workspaces)
- category: reply_category_v2 (18 categories)
- confidence: numeric(4,3)
- emotional_tone: emotional_tone
- tone_confidence: numeric(4,3)
- extracted_questions: jsonb (array of questions)
- has_insurance_intent: boolean
- insurance_keywords: text[]
- insurance_confidence: numeric(4,3)
- has_booking_intent: boolean
- booking_confidence: numeric(4,3)
- has_objection: boolean
- objection_type: objection_type
- objection_text: text
- has_urgent_damage: boolean
- damage_keywords: text[]
- urgency_score: numeric(4,3)
- suggested_actions: jsonb (array of suggestions)
- suggested_reply_templates: text[]
- suggested_pipeline_stage: text
- suggested_tags: text[]
- pipeline_moved: boolean
- raw_ai_response: jsonb
- processing_time_ms: integer
```

---

## 🔄 Automatic Actions

### Pipeline Movement

When a reply is analyzed, the system automatically:
1. Determines the appropriate pipeline stage based on category
2. Moves the contact to that stage
3. Updates `lead_status` for compatibility
4. Logs the movement in `reply_intelligence_events`

### Tagging

Automatically adds tags:
- `insurance-opportunity` - If insurance intent detected
- `ready-to-book` - If booking intent detected
- `urgent-damage` - If urgent damage detected
- Plus any custom tags suggested by AI

### Database Triggers

A database trigger automatically processes intelligence events:
- Moves pipeline stage
- Adds tags
- Updates contact status

---

## 🎨 Example Response

```json
{
  "category": "yes_come_inspect",
  "confidence": 0.95,
  "emotionalTone": "urgent",
  "toneConfidence": 0.92,
  "extractedQuestions": [
    {
      "question": "When are you available?",
      "type": "availability",
      "confidence": 0.98
    }
  ],
  "hasInsuranceIntent": false,
  "insuranceKeywords": [],
  "insuranceConfidence": 0.0,
  "hasBookingIntent": true,
  "bookingConfidence": 0.95,
  "hasObjection": false,
  "hasUrgentDamage": true,
  "damageKeywords": ["leaking", "water"],
  "urgencyScore": 0.97,
  "suggestedActions": [
    {
      "action": "Offer inspection availability tomorrow",
      "priority": 10,
      "reasoning": "Urgent damage + booking intent"
    },
    {
      "action": "Send booking link",
      "priority": 9,
      "reasoning": "Homeowner wants to schedule"
    }
  ],
  "suggestedReplyTemplates": ["urgent-inspection-offer"],
  "suggestedPipelineStage": "HOT",
  "suggestedTags": ["urgent-damage", "ready-to-book"],
  "eventId": "uuid-of-stored-event"
}
```

---

## 🔥 Why Roofers Will LOVE This

1. **Every message becomes CLEAR** - They instantly know exactly what the homeowner needs
2. **They never miss buying signals** - YES leads become HOT automatically
3. **Urgent damage gets prioritized** - This leads to SAME-DAY jobs → money
4. **Insurance leads don't slip away** - SmartSend identifies them IMMEDIATELY
5. **Follow-up becomes easy** - Auto suggestions = AI assistant for their office
6. **Pipeline updates without manual effort** - Huge time-saver

---

## 🧪 Testing

To test the system:

1. **Run the migration:**
   ```bash
   # Apply the migration
   supabase migration up
   ```

2. **Test with a sample reply:**
   ```bash
   curl -X POST http://localhost:3000/api/replies/intelligence \
     -H "Content-Type: application/json" \
     -d '{
       "workspace_id": "your-workspace-id",
       "text": "Hey, water is leaking near the kitchen. Can you come today?",
       "subject": "Urgent roof repair"
     }'
   ```

3. **Check the database:**
   ```sql
   SELECT * FROM reply_intelligence_events 
   ORDER BY created_at DESC 
   LIMIT 10;
   ```

---

## 📝 Next Steps

1. **Run the migration** to create the database tables
2. **Test with real replies** to see the intelligence in action
3. **Build UI components** to display:
   - Emotional tone badges
   - Extracted questions list
   - Suggested actions
   - Insurance/booking/urgent flags
4. **Create dashboard views** showing:
   - Intelligence event timeline
   - Category distribution
   - Tone analysis
   - Question types breakdown

---

## 🎯 Summary

Block 16000 transforms SmartSend from a simple reply classifier into a comprehensive roofing communication intelligence system. Every homeowner reply is now analyzed for:

- ✅ 18-category classification
- ✅ Emotional tone detection
- ✅ Question extraction
- ✅ Insurance intent recognition
- ✅ Booking intent detection
- ✅ Objection detection
- ✅ Auto-suggestions
- ✅ Auto pipeline movement
- ✅ Comprehensive logging

**This is a MASSIVE revenue unlock for roofers.**






















































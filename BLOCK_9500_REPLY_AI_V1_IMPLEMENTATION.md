# Block 9500 — Reply AI v1 Implementation

## Overview

Reply AI v1 makes SmartSend understand every homeowner reply and instantly classify it into actionable categories that roofing companies care about:

- **Hot Lead** (ready to book)
- **Warm Lead** (interested but needs info)
- **Neutral** (questions / clarifying)
- **Not Interested**
- **Unsubscribe**
- **Spam / Out of office**
- **Technical bounce**

## Implementation Summary

### 1. Database Changes

**Migration:** `supabase/migrations/20250130000002_block9500_reply_ai_v1.sql`

Added columns to `messages` table:
- `reply_summary` (text) - Short AI-generated summary
- `reply_next_action` (text) - Recommended action: 'book', 'answer', 'stop', 'info_needed', 'none'
- `ai_confidence` (numeric(4,3)) - AI confidence score (0.0 to 1.0)
- `intent` (text) - Classification: 'hot', 'warm', 'neutral', 'not_interested', 'unsubscribe', 'spam', 'bounce'

**Database Functions:**
- `clean_email_text(text)` - Cleans email text by removing signatures, quoted replies
- `process_reply_classification(...)` - Processes classification and updates messages + lead stats

### 2. API Endpoint

**Endpoint:** `POST /api/ai/reply-classify`

**Request Body:**
```json
{
  "message_id": "uuid",
  "text": "full_email_text",
  "account_id": "uuid",  // optional, will be fetched from message if not provided
  "campaign_id": "uuid", // optional
  "contact_id": "uuid"   // optional
}
```

**Response:**
```json
{
  "success": true,
  "classification": {
    "intent": "hot",
    "summary": "They want you to come by to check the roof.",
    "next_action": "book",
    "confidence": 0.95
  }
}
```

**Features:**
- Cleans email text (strips signatures, quoted replies)
- Classifies using OpenAI GPT-4o-mini
- Updates messages table with classification results
- Updates `lead_auto_follow_up_stats` with intent and timestamp
- Triggers follow-up brain logic (stops follow-ups for hot/not_interested/unsubscribe)
- Logs events to `follow_up_events` table

### 3. Follow-Up Brain Integration

The endpoint automatically triggers follow-up brain logic:

- **Hot leads** → Stop all follow-ups, log event
- **Unsubscribe** → Stop follow-ups + add to suppression list
- **Not Interested** → Stop follow-ups, log event
- **Spam** → Log event but don't change stats

### 4. Frontend Components

**Components Created:**
1. `components/replies/ReplyClassificationTag.tsx` - Badge component for displaying intent
2. `components/replies/ReplyClassificationDisplay.tsx` - Full display card for lead drawers
3. `components/replies/MessageWithClassification.tsx` - Example integration in message lists

**Usage Example:**
```tsx
import { ReplyClassificationTag } from "@/components/replies/ReplyClassificationTag";

<ReplyClassificationTag
  intent={message.intent}
  summary={message.reply_summary}
  next_action={message.reply_next_action}
  confidence={message.ai_confidence}
  showSummary={true}
  showAction={true}
/>
```

## Integration Points

### When Inbound Message Arrives

After storing the raw message, call the classification endpoint:

```typescript
await fetch('/api/ai/reply-classify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message_id: message.id,
    text: message.body_text,
    account_id: accountId,
    campaign_id: campaignId,
    contact_id: contactId,
  }),
});
```

### Display in UI

**Campaign → Messages View:**
- Show classification tag next to each inbound reply
- Display summary on hover or in expanded view
- Show "AI Action: Book / Answer / Stop" badge

**Lead Drawer:**
- Show latest intent and summary
- Display recommended action
- Quick action buttons (Reply, Mark as Won, Add note)

**Campaign Overview:**
- Show counts: 🔥 Hot Leads (X), 🟠 Warm Leads (Y), ⚪ Neutral (Z)

## Classification Categories

| Intent | Examples | Next Action |
|--------|----------|-------------|
| **hot** | "Yes come by", "Can you call me?", "I need someone asap" | `book` |
| **warm** | "Maybe", "Can you send info?", "How much is it?" | `answer` |
| **neutral** | Questions, clarifications, "Who is this?" | `answer` |
| **not_interested** | "No thanks", "I'm good", "Already fixed" | `stop` |
| **unsubscribe** | "Stop emailing me", "Remove me" | `stop` |
| **spam** | Out-of-office, auto responses, irrelevant text | `none` |
| **bounce** | Hard bounce, invalid email | `none` |

## Testing

### Test Cases

1. **Hot Lead Reply:**
   ```
   Input: "Yes, can you come by tomorrow afternoon?"
   Expected: intent="hot", next_action="book", summary="They want you to come by to check the roof."
   ```

2. **Warm Lead Reply:**
   ```
   Input: "What's the ballpark cost for a tune-up?"
   Expected: intent="warm", next_action="answer", summary="They want pricing info."
   ```

3. **Unsubscribe:**
   ```
   Input: "Stop emailing me."
   Expected: intent="unsubscribe", next_action="stop", follow-ups stopped, added to suppression
   ```

### Manual Testing

1. Send a test email from a lead
2. Receive reply via webhook
3. Check that message is classified correctly
4. Verify follow-ups are stopped for negative intents
5. Check dashboard counts update correctly

## Environment Variables

Required:
- `OPENAI_API_KEY` - OpenAI API key for classification
- `OPENAI_MODEL` - (optional) Model to use, defaults to "gpt-4o-mini"

## Next Steps

1. **Frontend Integration:**
   - Add classification tags to message lists
   - Update lead drawer to show classification
   - Add campaign overview stats bar

2. **Dashboard Metrics (Block 8990):**
   - Count replies received
   - Count positive replies
   - Count hot leads
   - Track jobs won (later stage)

3. **Lead Status Strip (Block 8920):**
   - Update hot/warm/neutral counts instantly
   - Filter pipeline by lead status

4. **Admin Controls:**
   - Allow manual override of intent
   - Display "Low confidence" warnings
   - Review queue for low-confidence classifications

## Files Created/Modified

### New Files:
- `supabase/migrations/20250130000002_block9500_reply_ai_v1.sql`
- `app/api/ai/reply-classify/route.ts`
- `components/replies/ReplyClassificationTag.tsx`
- `components/replies/ReplyClassificationDisplay.tsx`
- `components/replies/MessageWithClassification.tsx`

### Modified Files:
- None (this is a new feature)

## Notes

- Classification uses OpenAI GPT-4o-mini for cost efficiency
- Fallback to "neutral" if AI fails
- Low confidence (< 0.7) is flagged but still used
- All classifications are logged for audit and improvement
- Follow-up brain integration is automatic and non-blocking

























































# Email Reply Tracking Implementation

## Overview
This implementation adds comprehensive email reply tracking with intent detection to SmartSend AI. It extends the existing `email_logs` table with reply metadata and creates a new `email_replies` table for storing inbound replies.

## Files Created

### 1. SQL Migration
**File**: `supabase/migrations/20250215_email_reply_tracking.sql`

**Changes to `email_logs` table:**
- `provider_message_id` - Message ID from email provider (Gmail/Outlook/SMTP)
- `replied_at` - Timestamp when reply was received
- `reply_intent` - Detected intent (interested, booked, not_interested, unsubscribe, ooo, ambiguous)
- `reply_confidence` - Confidence score (0-1)
- `reply_excerpt` - First 280 characters of the reply

**New `email_replies` table:**
- Stores complete reply messages
- Links to originating `email_logs` entry
- Includes provider info, message IDs, subject, body (text & HTML)
- Includes detected intent and confidence score
- Indexed for fast lookups

**Helper function:**
- `find_log_by_inreplyto(p_in_reply_to text)` - Finds originating email by in-reply-to header

**View:**
- `campaign_replies` - Reply counts per campaign

### 2. Intent Detection Library
**File**: `src/lib/replyDetection/detectIntent.ts`

Provides two approaches:
1. **Heuristic detection** - Fast, rule-based classification using keyword matching
2. **AI-enhanced detection** - Optional OpenAI augmentation for ambiguous cases

**Supported intents:**
- `interested` - Prospect shows interest
- `booked` - Meeting/call scheduled
- `not_interested` - Explicit rejection
- `unsubscribe` - Unsubscribe request
- `ooo` - Out of office auto-reply
- `ambiguous` - Unclear intent

**Usage:**
```typescript
import { detectIntent } from '@/lib/replyDetection/detectIntent';

const result = await detectIntent("Sounds good! Let's schedule a call.");
// { intent: "interested", confidence: 0.85 }
```

### 3. Inbound Reply Webhook
**File**: `src/app/api/inbound/reply/route.ts`

Provider-agnostic webhook that:
1. Accepts POST requests with reply data
2. Matches replies to original emails via in-reply-to header or fallback matching
3. Detects intent using the detection library
4. Stores reply in `email_replies` table
5. Updates `email_logs` with reply metadata
6. Handles orphaned replies (unable to match)

**Security:**
- Protected by `x-smartsend-signature` header check
- Requires `INBOUND_SECRET` environment variable

**Request format:**
```json
{
  "provider": "gmail",
  "provider_message_id": "xxx",
  "in_reply_to": "yyy",
  "from": "user@example.com",
  "to": "replies+token@smartsend.ai",
  "subject": "Re: Your outreach",
  "body_text": "Sounds good...",
  "body_html": "<p>Sounds good...</p>"
}
```

## Environment Variables

Add these to your `.env` file:

```bash
# Required
INBOUND_SECRET=super-long-random-secret-key
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Optional (for AI-enhanced intent detection)
OPENAI_API_KEY=your-openai-api-key
```

## Usage

### Sending Emails

When sending emails, store the `provider_message_id` in the `email_logs` table:

```typescript
await supabase
  .from('email_logs')
  .update({ provider_message_id: gmailMessageId })
  .eq('id', emailLogId);
```

### Receiving Replies

Configure your Gmail/Outlook integration to POST to `/api/inbound/reply` when replies are received.

**Example Gmail integration:**
```typescript
// When a reply is received
const reply = await gmail.users.messages.get({
  userId: 'me',
  id: messageId
});

await fetch('https://yourdomain.com/api/inbound/reply', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-smartsend-signature': process.env.INBOUND_SECRET
  },
  body: JSON.stringify({
    provider: 'gmail',
    provider_message_id: messageId,
    in_reply_to: reply.payload.headers.find(h => h.name === 'In-Reply-To')?.value,
    from: reply.payload.headers.find(h => h.name === 'From')?.value,
    to: reply.payload.headers.find(h => h.name === 'To')?.value,
    subject: reply.payload.headers.find(h => h.name === 'Subject')?.value,
    body_text: extractText(reply.payload),
    body_html: extractHtml(reply.payload)
  })
});
```

### Querying Replies

**Get all replies for a campaign:**
```sql
SELECT * FROM email_replies er
JOIN email_logs el ON el.id = er.email_log_id
WHERE el.campaign_id = 'xxx';
```

**Get reply stats:**
```sql
SELECT 
  campaign_id,
  count(*) as total_replies,
  count(*) FILTER (WHERE intent = 'interested') as interested,
  count(*) FILTER (WHERE intent = 'booked') as booked,
  count(*) FILTER (WHERE intent = 'unsubscribe') as unsubscribes
FROM campaign_replies
JOIN email_logs USING (campaign_id)
GROUP BY campaign_id;
```

**Get unhandled replies (not viewed by user):**
```sql
SELECT * FROM email_replies
WHERE email_log_id IN (
  SELECT id FROM email_logs WHERE replied_at IS NULL
);
```

## UI Integration

### Display Reply Status

Add reply badges to your engagement table:

```tsx
<TableCell>
  {row.replied_at ? (
    <Badge variant="outline" className="bg-green-50 text-green-700">
      Replied
    </Badge>
  ) : null}
</TableCell>
```

### Show Reply Details

Create a replies list component:

```tsx
const { data: replies } = await supabase
  .from('email_replies')
  .select('*, email_logs!inner(campaign_id)')
  .eq('email_logs.campaign_id', campaignId)
  .order('created_at', { ascending: false });

return (
  <div>
    {replies.map(reply => (
      <ReplyCard
        key={reply.id}
        intent={reply.intent}
        confidence={reply.confidence}
        excerpt={reply.reply_excerpt}
        from={reply.from_email}
        received={reply.created_at}
      />
    ))}
  </div>
);
```

## Intent Detection Behavior

### Heuristic Detection
- **Confidence ≥ 0.9**: Uses heuristic result only
- **Confidence < 0.9**: Falls back to AI if `OPENAI_API_KEY` is set
- **No API key**: Returns heuristic result

### AI Enhancement
- Only used when heuristic confidence is low
- Helps handle edge cases and nuanced replies
- Merges results with heuristic (takes strongest signal)

## Future Enhancements

1. **Unsubscribe automation**: Automatically add to suppression list
2. **Thread tracking**: Track multi-message conversations
3. **Sentiment analysis**: Add sentiment scoring
4. **Auto-categorization**: Create custom intent categories
5. **Reply templates**: Suggest reply templates based on intent
6. **Notification system**: Alert sales reps of high-intent replies 
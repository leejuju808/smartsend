# Reply Detection Edge Function Implementation

## Overview
This document describes the AI-powered reply detection system that classifies incoming email responses and updates campaign logs accordingly.

## Core Flow

```
Gmail webhook → Edge Function trigger (detectReply)
                     ↓
              Fetch email body + subject
                     ↓
              Pass to OpenAI classifier
                     ↓
         Classify as: Human Reply, Out of Office, 
         Bounce/Delivery Failure, or Automated
                     ↓
         If "Human Reply":
         - Update campaign_logs.replied = true
         - Update leads status = "Replied"
                     ↓
              Store classification result
              in reply_logs table
```

## Files Created/Modified

### 1. Database Migration
**File:** `supabase/migrations/20250131_add_replied_to_campaign_logs.sql`

Creates:
- `replied` field on `campaign_logs` table
- `reply_logs` table with classification results
- Indexes for efficient querying
- RLS policies for security

### 2. Type Definitions
**File:** `src/types/replyTypes.ts`

Defines TypeScript types:
- `ReplyType`: Classification categories
- `ReplyDetectionResult`: AI detection result
- `ReplyLogEntry`: Database entry structure
- `EdgeFunctionRequest`: Request payload

### 3. AI Detector Library
**File:** `src/lib/openaiReplyDetector.ts`

Provides OpenAI-powered classification:
- `detectReplyType()`: Main classification function
- Handles parsing errors gracefully
- Returns normalized result with confidence score

### 4. Edge Function
**Files:**
- `supabase/functions/detect-reply/index.ts` (updated)
- `supabase/functions/detect-reply/deno.json` (updated)

Implements the reply detection workflow:
1. Receives email data from Gmail webhook
2. Calls OpenAI to classify the reply
3. Updates `campaign_logs.replied = true` if human reply
4. Stores classification in `reply_logs` table
5. Updates lead status for backward compatibility

### 5. Additional Edge Function
**File:** `supabase/functions/reply_detection_edge/index.ts`

Alternative implementation following the original spec structure (can be used as reference or deployed separately).

## Database Schema

### reply_logs table
```sql
CREATE TABLE public.reply_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id text,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  type text NOT NULL,
  confidence numeric CHECK (confidence >= 0 AND confidence <= 1),
  created_at timestamptz DEFAULT now()
);
```

### campaign_logs updates
```sql
ALTER TABLE campaign_logs
  ADD COLUMN replied BOOLEAN DEFAULT FALSE;
```

## Integration

The system integrates with existing Gmail webhook at `app/api/gmail/webhook/route.ts`:

1. Gmail webhook receives incoming email
2. Calls `/functions/v1/detectReply` edge function
3. Edge function classifies and logs the reply
4. Returns classification result

## Usage

### Trigger Reply Detection
```typescript
const response = await fetch(`${SUPABASE_URL}/functions/v1/detectReply`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${SERVICE_ROLE_KEY}`
  },
  body: JSON.stringify({
    email_id: "email-id",
    subject: "Email subject",
    body: "Email body content",
    campaign_id: "campaign-uuid",
    threadId: "thread-id", // optional
    from: "sender@example.com" // optional
  })
});
```

### Query Classification Results
```sql
SELECT * FROM reply_logs 
WHERE campaign_id = 'your-campaign-id'
ORDER BY created_at DESC
LIMIT 10;
```

### Check Reply Status
```sql
SELECT * FROM campaign_logs 
WHERE replied = true
ORDER BY created_at DESC;
```

## Classification Categories

1. **Human Reply**: Actual response from the recipient
2. **Out of Office**: Auto-reply indicating absence
3. **Bounce / Delivery Failure**: Undeliverable messages
4. **Automated System Message**: Automated notifications

## AI Model

- **Model**: gpt-4o-mini
- **Temperature**: 0.2 (low for consistency)
- **Response Format**: JSON object
- **Confidence**: 0-1 score

## Environment Variables

Required for edge function:
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_KEY` or `SUPABASE_SERVICE_ROLE_KEY`: Service role key
- `OPENAI_API_KEY`: OpenAI API key

## Error Handling

- Graceful fallback on JSON parse errors
- Logs errors to console for debugging
- Returns appropriate HTTP status codes
- Maintains backward compatibility with existing `replies` table

## Testing

### Manual Test
```bash
curl -X POST https://your-project.supabase.co/functions/v1/detectReply \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SERVICE_KEY" \
  -d '{
    "subject": "Re: Test Email",
    "body": "Thanks for reaching out!",
    "campaign_id": "your-campaign-id",
    "threadId": "test-thread-id"
  }'
```

### Expected Response
```json
{
  "message": "Reply detected and classified ✅",
  "lead_id": "lead-uuid",
  "classification": {
    "type": "Human Reply",
    "isHuman": true,
    "confidence": 0.9
  }
}
```

## Future Enhancements

1. Add webhook signature verification
2. Support for additional classification categories
3. Confidence threshold configuration
4. Batch classification for multiple replies
5. Integration with auto-followup engine
6. Real-time notifications for high-confidence human replies


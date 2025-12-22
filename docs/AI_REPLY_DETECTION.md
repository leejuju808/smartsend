# AI Reply Detection (Auto-Mark as Replied)

## Overview

Automatically detects when an incoming message is a real human reply (vs auto-replies, bounces, spam, or signatures-only) and updates thread status accordingly. Provides confidence scoring, labels, and logs.

## Architecture

### Detection Pipeline

1. **Fast Heuristic Path** (sub-150ms)
   - Rule-based signals: headers, subject patterns, body cues, length/entropy
   - Score rubric (0-1) with weighted positive/negative signals
   - Decision: `score ≥ 0.6` → human, `0.4 ≤ score < 0.6` → LLM fallback, `< 0.4` → classify as ooo/spam/bounce/noise

2. **LLM Fallback** (on ambiguous cases)
   - Only invoked when heuristic score is 0.4-0.6
   - Uses GPT-4o-mini for classification
   - Returns `{label, confidence}` JSON

### Database Schema

**email_messages**
- `detection` JSONB: `{is_reply: bool, confidence: float, label: string, reasons: string[], ...}`

**email_threads**
- `first_replied_at` timestamptz
- `status`: 'unreplied' | 'replied' | 'needs_review' | 'archived'
- `ai_flag`: 'handwritten' | 'ooo' | 'spammy' | 'bounce' | null

### Edge Function

`supabase/functions/reply_detect/index.ts`

**Input:**
```json
{
  "org_id": "uuid",
  "workspace_id": "uuid", // alternative to org_id
  "message_id": "uuid"
}
```

**Output:**
```json
{
  "ok": true,
  "label": "human" | "ooo" | "spam" | "bounce" | "noise",
  "confidence": 0.92,
  "fast": { /* heuristic details */ },
  "detection": { /* full detection data */ }
}
```

### Integration Points

**Primary: ReplyProcessor** (`src/lib/replies.ts`)
- Automatically calls `syncAndDetectReply()` after processing inbound messages
- Syncs `inbound_messages` → `email_messages` if needed
- Non-blocking (async, errors don't break flow)

**Manual Calls:**
```typescript
import { syncAndDetectReply, callReplyDetector } from '@/lib/reply-detection';

// If you have an email_messages entry already:
await callReplyDetector(workspaceId, emailMessageId);

// If you need to sync from inbound_messages first:
await syncAndDetectReply(workspaceId, inboundMessageData, threadId, leadId, campaignId);
```

**Backfill Script:**
```sql
-- Find messages needing detection
SELECT id, workspace_id 
FROM email_messages 
WHERE direction = 'inbound' 
  AND detection IS NULL
LIMIT 100;
```

Then call the edge function for each `message_id`.

## Heuristic Signals

### Positive Signals
- +0.45: Intent cues (greeting + verbs like "interested", "schedule", "let's", "call", "price")
- +0.20: Questions present
- +0.15: Low quoted ratio (<60%)
- +0.10: Name match (lead name in salutation)

### Negative Signals
- -0.50: Auto headers (`Auto-Submitted`, `X-Auto-Response-Suppress`, `Precedence`)
- -0.40: OOO keywords ("out of office", "automatic reply", "vacation")
- -0.50: Bounce markers ("MAILER-DAEMON", "Undelivered Mail", "DSN")
- -0.25: High link density (>0.15)
- -0.30: Very short (≤20 chars) with mostly quoted text

### Label Classification
- `human`: score ≥ 0.6 or LLM confirms human reply
- `ooo`: OOO keywords detected
- `bounce`: Bounce markers detected
- `spam`: High link density + spam traits
- `noise`: Very short, signature-only, or low confidence

## UI Integration

### Thread Row Chips

Map `ai_flag` to visual indicators:

```tsx
// In thread row component
{thread.ai_flag === 'ooo' && <Badge variant="outline">OOO</Badge>}
{thread.ai_flag === 'spammy' && <Badge variant="destructive">Spam</Badge>}
{thread.ai_flag === 'bounce' && <Badge variant="secondary">Bounce</Badge>}
```

### Thread Pane Badge

Show detection confidence on incoming messages:

```tsx
// In message component
{message.detection && message.detection.label === 'human' && (
  <Tooltip>
    <TooltipTrigger>
      <Badge variant="success">
        Detected: Human reply ({Math.round(message.detection.confidence * 100)}%)
      </Badge>
    </TooltipTrigger>
    <TooltipContent>
      <div className="text-xs">
        {message.detection.reasons?.join(', ')}
      </div>
    </TooltipContent>
  </Tooltip>
)}
```

### Filters

Add "Needs Review" filter to inbox:

```tsx
<Select value={statusFilter} onValueChange={setStatusFilter}>
  <SelectItem value="all">All</SelectItem>
  <SelectItem value="replied">Replied</SelectItem>
  <SelectItem value="needs_review">Needs Review</SelectItem>
  <SelectItem value="unreplied">Unreplied</SelectItem>
</Select>
```

## Detection Stats View

Query `vw_detection_stats` for dashboard cards:

```sql
SELECT 
  label,
  SUM(cnt) as total,
  AVG(avg_conf) as avg_confidence
FROM vw_detection_stats
WHERE day >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY label;
```

Example dashboard card:
```tsx
// Today: 27 human, 8 ooo, 3 spam, 1 bounce
{stats.map(s => (
  <Card key={s.label}>
    <CardHeader>
      <CardTitle>{s.total}</CardTitle>
      <CardDescription>{s.label}</CardDescription>
    </CardHeader>
  </Card>
))}
```

## Environment Variables

Required for LLM fallback:
- `OPENAI_API_KEY` in Edge Function environment

Set via Supabase Dashboard → Edge Functions → reply_detect → Settings → Secrets

## Testing

### Manual Test

```bash
curl -X POST https://<project>.supabase.co/functions/v1/reply_detect \
  -H "Authorization: Bearer <service_role_key>" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_id": "<workspace_id>",
    "message_id": "<message_id>"
  }'
```

### Sample Messages

**Human Reply:**
```
Subject: Re: Follow-up

Hi Sarah,

Thanks for reaching out! I'm interested in learning more about your product.
When would be a good time to schedule a demo?

Best,
John
```

Expected: `label: "human"`, `confidence: ~0.75-0.90`

**OOO:**
```
Subject: Out of Office

I am currently out of the office and will return on January 15th.
```

Expected: `label: "ooo"`, `confidence: ~0.60-0.80`

**Bounce:**
```
Subject: Delivery Status Notification (Failure)

This message could not be delivered to the following recipient(s):
[SMTP error details]
```

Expected: `label: "bounce"`, `confidence: ~0.85-0.95`

## Performance

- Heuristic path: **<150ms** (typical: 50-100ms)
- LLM fallback: **200-500ms** (only on 0.4-0.6 score)
- Database updates: **<50ms** (indexed lookups)

Total end-to-end for heuristic-only: **<200ms**

## Troubleshooting

**Detection not running:**
- Check `SUPABASE_SERVICE_ROLE_KEY` is set
- Verify edge function is deployed
- Check logs: `supabase functions logs reply_detect`

**Low confidence:**
- Review `detection.reasons` array
- May need LLM fallback tuning
- Check for unusual email formats

**Threads not updating:**
- Verify `thread_id` is set on `email_messages`
- Check RLS policies allow service role updates
- Verify `email_threads` table exists with correct schema

## Future Enhancements

- Per-user model training
- Language-specific tuning
- Custom threshold configuration
- Batch detection API for backfills
- Webhook notifications on status changes


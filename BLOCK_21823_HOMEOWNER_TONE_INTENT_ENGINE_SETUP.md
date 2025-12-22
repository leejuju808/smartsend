# Block 21823 — SmartSend Roofing Homeowner Tone Intent Engine v1

## Overview

This feature automatically classifies homeowner messages with emotional tone and intent, providing contractors with instant clarity about who they're dealing with.

**Tone Classifications:**
- positive, neutral, confused, impatient, angry, price-shopping, scheduling-focused, appreciation

**Intent Classifications:**
- high intent, medium intent, low intent, not interested, needs clarification, ready to book, wants price, stalling

## Implementation Files

### Database
- `supabase/migrations/20250130000002_block_21823_homeowner_tone_intent_engine_v1.sql`
  - Adds `homeowner_tone` and `homeowner_intent` columns to `lead_activities` table
  - Creates indexes for efficient querying
  - Creates helper functions and views

### Edge Function
- `supabase/functions/classify-homeowner-message/index.ts`
  - Uses OpenAI GPT-4o-mini to classify messages
  - Updates `lead_activities` table with tone and intent

### Application Code
- `src/lib/homeowner-classification.ts` - Helper functions to trigger classification
- `src/app/api/homeowner-classify/route.ts` - API endpoint to trigger classification
- `components/lead/HomeownerToneTag.tsx` - React component to display tone/intent badges
- `components/leads/LeadActivityWithTone.tsx` - Example integration component

## Setup Instructions

### 1. Run Database Migration

Execute the migration in Supabase SQL Editor:

```sql
-- Run: supabase/migrations/20250130000002_block_21823_homeowner_tone_intent_engine_v1.sql
```

This will:
- Add `homeowner_tone` and `homeowner_intent` columns to `lead_activities`
- Create indexes for performance
- Create helper functions and views

### 2. Deploy Edge Function

```bash
cd supabase
supabase functions deploy classify-homeowner-message
```

### 3. Set Environment Variables

In Supabase Dashboard → Edge Functions → classify-homeowner-message → Settings:

```
OPENAI_API_KEY=your_openai_api_key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 4. Configure Automatic Classification

#### Option A: Application-Level Trigger (Recommended)

Modify the code that creates `lead_activities` entries to call the classification API:

```typescript
import { classifyHomeownerActivity } from "@/lib/homeowner-classification";

// After creating a message_in activity
if (activity.kind === "message_in" && activity.body) {
  // Trigger classification (non-blocking)
  classifyHomeownerActivity(activity.id).catch(console.error);
}
```

#### Option B: Supabase Webhook Trigger

1. Go to Supabase Dashboard → Database → Webhooks
2. Create a new webhook:
   - Table: `lead_activities`
   - Events: INSERT
   - HTTP Request URL: `https://your-project.functions.supabase.co/classify-homeowner-message`
   - HTTP Request Method: POST
   - HTTP Request Headers:
     ```
     Content-Type: application/json
     Authorization: Bearer YOUR_SERVICE_ROLE_KEY
     ```
   - HTTP Request Body:
     ```json
     {
       "activity_id": "{{ $1.id }}",
       "message_body": "{{ $1.body }}"
     }
     ```
   - Filter: `kind = 'message_in' AND body IS NOT NULL`

#### Option C: Database Trigger with pg_net (Advanced)

If `pg_net` extension is enabled, you can modify the trigger function to call the edge function directly. See the migration file for details.

## Usage

### Display Tone/Intent in Components

```tsx
import { HomeownerToneTag } from "@/components/lead/HomeownerToneTag";

function MyComponent({ activity }) {
  return (
    <div>
      {activity.kind === "message_in" && (
        <HomeownerToneTag
          tone={activity.homeowner_tone}
          intent={activity.homeowner_intent}
          compact={true}
        />
      )}
    </div>
  );
}
```

### Query Activities by Tone/Intent

```sql
-- Find all angry homeowners
SELECT * FROM lead_activities
WHERE kind = 'message_in'
  AND homeowner_tone = 'angry'
ORDER BY created_at DESC;

-- Find high-intent leads
SELECT * FROM lead_activities
WHERE kind = 'message_in'
  AND homeowner_intent = 'high intent'
ORDER BY created_at DESC;

-- Use the summary view
SELECT * FROM v_homeowner_tone_intent_summary
WHERE lead_id = 'your-lead-id';
```

### Manual Classification

```typescript
import { classifyHomeownerActivity } from "@/lib/homeowner-classification";

// Classify a specific activity
const result = await classifyHomeownerActivity(activityId);
console.log(result); // { tone: "positive", intent: "high intent" }
```

### Batch Classification

```typescript
import { batchClassifyHomeownerActivities } from "@/lib/homeowner-classification";

// Classify multiple activities
const activityIds = ["id1", "id2", "id3"];
const results = await batchClassifyHomeownerActivities(activityIds);
```

## Integration Points

The `HomeownerToneTag` component should be integrated into:

1. **Unified Inbox** - Show tone/intent for each message
2. **Lead Timeline** - Display alongside activity entries
3. **Estimator Dashboard** - Highlight high-intent leads
4. **Company Scorecard** - Aggregate tone/intent metrics
5. **Routing Logs** - Show why leads were routed
6. **Coaching Engine** - Provide context for estimators

## Example Integration

See `components/leads/LeadActivityWithTone.tsx` for a complete example of how to integrate the tone/intent tags into a timeline component.

## API Endpoints

### POST `/api/homeowner-classify`

Trigger classification for a specific activity.

**Request:**
```json
{
  "activity_id": "uuid"
}
```

**Response:**
```json
{
  "ok": true,
  "tone": "positive",
  "intent": "high intent",
  "activity_id": "uuid"
}
```

## Database Schema

### `lead_activities` Table

New columns:
- `homeowner_tone` (text) - Tone classification
- `homeowner_intent` (text) - Intent classification

### Views

- `v_homeowner_tone_intent_summary` - Aggregated tone/intent statistics per lead

## Troubleshooting

### Classification Not Running

1. Check edge function logs in Supabase Dashboard
2. Verify `OPENAI_API_KEY` is set correctly
3. Ensure activity has `kind = 'message_in'` and non-empty `body`
4. Check API route logs for errors

### Classification Returns Wrong Values

1. Review OpenAI response in edge function logs
2. Check that tone/intent values match valid options
3. Verify message body is being passed correctly

### Performance Issues

1. Classification runs asynchronously - it won't block message insertion
2. Consider rate limiting if processing many messages
3. Use batch classification for backfilling existing messages

## Future Enhancements

- Real-time classification via database triggers
- Confidence scores for classifications
- Historical tone/intent trends
- Automated alerts for angry/impatient homeowners
- Integration with lead scoring system










































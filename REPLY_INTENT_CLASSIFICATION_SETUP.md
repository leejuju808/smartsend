# Reply Intent Classification System

A complete system for classifying email reply intents using OpenAI, with database schema, Edge Functions, API routes, and UI components.

## What This Does

- **Automatic Classification**: Every received email message is automatically classified with an intent label (interested, meeting, unsubscribe, etc.)
- **Thread Rollups**: Thread status is automatically updated based on the latest intent
- **Automation Rules**: Lightweight rules engine for auto-assigning threads, setting status, scheduling follow-ups
- **UI Integration**: Intent badges, filters, and extracted meeting times displayed in the inbox

## Files Created

### 1. Database Migration
- `supabase/migrations/20250229000006_reply_intent_classification.sql`
  - Adds `intent`, `intent_confidence`, `extracted_contacts`, `extracted_times`, `follow_up_at` to `email_messages`
  - Adds `last_intent`, `status`, `owner_id` to `email_threads`
  - Creates `automation_rules` table for workflow automation

### 2. Edge Function
- `supabase/functions/reply-intent/index.ts`
  - Classifies received messages using OpenAI GPT-4o-mini
  - Updates message and thread with intent labels
  - Applies automation rules based on intent

### 3. API Routes
- `src/app/api/hooks/on-reply/route.ts` - Webhook to trigger classification
- `src/app/api/inbox/email-thread/route.ts` - Returns thread with intent data

### 4. UI Components
- `src/lib/intent-utils.ts` - Intent color/label utilities
- `src/components/IntentBadge.tsx` - Reusable intent badge component
- `src/components/IntentFilters.tsx` - Intent filter chips component
- Updated `src/app/dashboard/inbox/[id]/page.tsx` - Shows intent badges and extracted times

### 5. API Updates
- Updated `src/app/api/inbox/threads/route.ts` - Includes intent data in responses

## Setup Instructions

### 1. Apply Database Migration

```bash
# Via Supabase Dashboard
# Go to SQL Editor → paste contents of:
# supabase/migrations/20250229000006_reply_intent_classification.sql → Run
```

Or via CLI:
```bash
supabase db push
```

### 2. Deploy Edge Function

```bash
supabase functions deploy reply-intent
```

### 3. Set Environment Variables

In Supabase Dashboard → Functions → Secrets:
- `OPENAI_API_KEY` - Your OpenAI API key

In your `.env.local`:
```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
```

### 4. Wire Up Webhook

In your inbound email handler (Gmail/Outlook/Resend), after inserting a received `email_messages` row, call:

```typescript
// After inserting email_messages with direction='received'
await fetch('/api/hooks/on-reply', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message_id: newMessageId })
});
```

### 5. Update Inbox UI

The inbox components have been updated to show intent badges. To add intent filters:

```tsx
import IntentFilters from '@/components/IntentFilters';

// In your inbox component
const [selectedIntent, setSelectedIntent] = useState('all');

// When fetching threads, include intent filter
const params = new URLSearchParams({
  workspaceId: workspaceId,
  intent: selectedIntent !== 'all' ? selectedIntent : undefined
});

<IntentFilters 
  selectedIntent={selectedIntent} 
  onIntentChange={setSelectedIntent} 
/>
```

## Intent Types

- `interested` - Positive interest, wants more info
- `meeting` - Proposes/accepts time to meet/call/demo
- `referral` - Forwards/points to another contact/department
- `not_now` - Polite decline or "circle back later"
- `unsubscribe` - Unsubscribe/stop emailing/opt-out
- `ooo` - Out-of-office/auto-reply
- `bounce` - Mailer daemon/undeliverable
- `question` - Neutral questions, needs clarification
- `unknown` - Cannot determine intent

## Thread Status Routing

Automatically set based on intent:
- `unsubscribe`, `bounce` → `do_not_contact`
- `meeting`, `interested`, `question`, `referral` → `open`
- `not_now`, `ooo` → `waiting`
- Default → `open`

## Automation Rules

Create rules in the `automation_rules` table:

```sql
INSERT INTO automation_rules (workspace_id, name, match_intents, action, action_payload, is_enabled)
VALUES (
  'workspace-id',
  'Auto-assign interested leads',
  ARRAY['interested', 'meeting'],
  'assign',
  '{"owner_id": "user-id"}'::jsonb,
  true
);
```

Available actions:
- `assign` - Assign thread to owner (requires `owner_id` in payload)
- `set_status` - Set thread status (requires `status` in payload)
- `schedule_followup` - Schedule follow-up (requires `days` in payload)
- `add_tag` - Placeholder for future tag system

## UI Components

### Intent Badge

```tsx
import IntentBadge from '@/components/IntentBadge';

<IntentBadge intent="interested" confidence={0.95} size="sm" />
```

### Intent Filters

```tsx
import IntentFilters from '@/components/IntentFilters';

<IntentFilters 
  selectedIntent={selectedIntent}
  onIntentChange={setSelectedIntent}
/>
```

## Testing

1. Send a test email to your inbound handler
2. Check that the message gets inserted into `email_messages`
3. Verify the webhook is called (check logs)
4. Check `email_messages` table for `intent` and `intent_confidence`
5. Check `email_threads` table for `last_intent` and `status`
6. View the thread in the inbox UI to see intent badges

## Troubleshooting

- **Classification not running**: Check Edge Function logs in Supabase Dashboard
- **OpenAI errors**: Verify `OPENAI_API_KEY` is set correctly
- **No intent badges showing**: Ensure messages have `direction='received'` or `direction='inbound'`
- **Rules not applying**: Verify `automation_rules` table has enabled rules for the workspace

## Security

- OpenAI API key is stored in Supabase function secrets (never exposed to client)
- Classification is idempotent (safe to call multiple times)
- RLS policies enforce workspace isolation
- Service role required for rule application

## Next Steps

- Add rate limiting to `/api/hooks/on-reply`
- Implement tag system for `add_tag` action
- Add analytics dashboard for intent distribution
- Create UI for managing automation rules


# Reply Detection Setup Guide

This document explains how to set up the rule-based reply detection system.

## Overview

The system automatically detects replies to outbound emails and:
- Classifies inbound emails (reply, ooo, bounce, unsubscribe, noise)
- Marks threads and leads as replied
- Pauses future campaign sends for leads who have replied

## Database Setup

### 1. Run Migrations

Run the migrations in order:
```bash
# 1. Schema updates
psql -f supabase/migrations/001_reply_detection.sql

# 2. Trigger setup
psql -f supabase/migrations/002_reply_trigger.sql

# 3. RLS policies
psql -f supabase/migrations/003_reply_detection_rls.sql
```

### 2. Configure Edge Function URL

After deploying the edge function, set the URL in PostgreSQL:

```sql
-- Replace YOUR-PROJECT with your Supabase project reference
ALTER SYSTEM SET app.settings.reply_detection_url = 'https://YOUR-PROJECT.supabase.co/functions/v1/reply-detection';
SELECT pg_reload_conf();
```

Or set it via Supabase Dashboard → Settings → Database → Custom Postgres Settings.

## Deploy Edge Function

```bash
supabase functions deploy reply-detection --no-verify-jwt
```

## How It Works

### 1. Email Insert Trigger

When an inbound email is inserted into the `emails` table:
- The trigger `trg_emails_reply_detection` fires
- It calls the `reply-detection` edge function via HTTP (pg_net)

### 2. Classification

The edge function classifies emails using rule-based heuristics:

- **unsubscribe**: Contains unsubscribe keywords
- **ooo**: Out of office auto-replies
- **bounce**: Delivery failure notifications
- **reply**: Positive reply signals (yes, interested, schedule, etc.) or reply markers
- **noise**: Default fallback

### 3. Actions on Reply

When a reply is detected:
1. Updates `emails.classification = 'reply'`
2. Updates `threads.replied = true`
3. Updates `leads.status = 'replied'`
4. Pauses all pending `campaign_sends` for that lead (`paused = true`)
5. Logs an event in `email_events`

## Testing

Insert a test inbound email:

```sql
-- First create a thread (if needed)
INSERT INTO threads (lead_id) VALUES ('<your-lead-id>') RETURNING id;

-- Insert an inbound email
INSERT INTO emails (
  thread_id, 
  direction, 
  from, 
  to, 
  subject, 
  body
) VALUES (
  '<thread-id>',
  'inbound',
  'alex@acme.com',
  'you@brand.com',
  'Re: Quick question',
  'Hey — yes, let us talk next week about pricing. Tuesday works.'
);
```

The trigger should:
- Call the edge function
- Mark classification as 'reply'
- Update thread.replied = true
- Update lead.status = 'replied'
- Pause campaign_sends for that lead

## UI Integration

### Thread Header Badge

Use the `ThreadHeader` component to show replied status:

```tsx
import { ThreadHeader } from "@/components/replies/ThreadHeader";

<ThreadHeader 
  subject={thread.subject} 
  replied={thread.replied} 
/>
```

### Filter Paused Sends

The system automatically filters out paused campaign sends in:
- `/api/campaigns/send-worker` route
- `sendCampaignSends` edge function

Queue lists will not show paused items.

## Troubleshooting

### Trigger Not Firing

1. Check that `pg_net` extension is enabled:
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'pg_net';
   ```

2. Verify trigger exists:
   ```sql
   SELECT * FROM pg_trigger WHERE tgname = 'trg_emails_reply_detection';
   ```

3. Check function URL is set:
   ```sql
   SHOW app.settings.reply_detection_url;
   ```

### Edge Function Not Called

1. Check edge function logs in Supabase Dashboard
2. Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set
3. Check that the email has `direction = 'inbound'`

### Classification Not Working

Review the classification logic in `supabase/functions/reply-detection/index.ts` and adjust the regex patterns as needed.

## Future Enhancements

### Optional: AI-Powered Classification

You can enhance the system by calling OpenAI for edge cases:

```typescript
// In classify() function, add fallback:
if (label === "noise") {
  // Call OpenAI to classify difficult cases
  const aiLabel = await classifyWithAI(body, subject);
  return aiLabel || "noise";
}
```

This keeps costs low (only calls AI for ambiguous cases) while improving accuracy.

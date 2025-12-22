# Adaptive Reply Brain System - Implementation Complete

## ✅ Implementation Summary

All components of the Adaptive Reply Brain system have been implemented:

### 1. Database Schema (`supabase/migrations/20250131000000_reply_brain_system.sql`)
- ✅ Enums: `reply_intent` and `reply_action`
- ✅ Tables:
  - `reply_brain_models` - Per-account model/prompt versioning
  - `reply_brain_inferences` - Inference log with intent/action/confidence
  - `reply_brain_feedback` - Human feedback for model improvement
  - `reply_brain_policy` - Per-tenant thresholds and policy
  - `brain_queue` - Lightweight queue for decoupling email ingest → inference
- ✅ RLS policies for all tables
- ✅ Trigger: `enqueue_brain_on_inbound()` - Auto-enqueues inbound emails
- ✅ RPC functions:
  - `unsubscribe_lead_by_email_id()` - Unsubscribe lead
  - `mark_bounce_by_email_id()` - Mark bounce
  - `create_meeting_task_from_inference()` - Create meeting task
  - `queue_followup_from_inference()` - Queue followup emails
- ✅ Seed data: Default model for existing accounts

### 2. Edge Function (`supabase/functions/reply-brain-worker/index.ts`)
- ✅ Processes `brain_queue` with optimistic locking
- ✅ Calls OpenAI GPT-4o-mini for classification
- ✅ Writes inference results to `reply_brain_inferences`
- ✅ Auto-applies actions based on confidence threshold
- ✅ Handles retries with exponential backoff
- ✅ Supports different email body column formats

### 3. Next.js Server Action (`app/(dashboard)/inbox/_actions/brainFeedback.ts`)
- ✅ Server action for submitting feedback on inferences
- ✅ Validates input with Zod
- ✅ Inserts feedback into `reply_brain_feedback`

### 4. UI Components
- ✅ `ReplyBrainBadge.tsx` - Displays intent, action, and confidence
- ✅ Settings page (`app/(dashboard)/settings/reply-brain/page.tsx`)
- ✅ Settings form component with test button

### 5. Test Route (`app/api/reply-brain/test/route.ts`)
- ✅ POST endpoint to manually trigger worker
- ✅ Useful for testing and debugging

### 6. Cron Configuration (`supabase/config.toml`)
- ✅ Scheduled to run every minute
- ✅ Function configured with `verify_jwt = false` for service role access

## 📋 Setup Instructions

### 1. Apply Database Migration

Run the migration in Supabase SQL Editor:
```sql
-- File: supabase/migrations/20250131000000_reply_brain_system.sql
```

Or via CLI:
```bash
supabase db push
```

### 2. Deploy Edge Function

```bash
cd supabase
supabase functions deploy reply-brain-worker
```

### 3. Set Environment Variables

In Supabase Dashboard → Edge Functions → reply-brain-worker → Settings:

- `OPENAI_API_KEY` - Your OpenAI API key
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key

### 4. Verify Cron Schedule

The cron job is configured in `supabase/config.toml` to run every minute. Verify it's active in Supabase Dashboard → Database → Cron Jobs.

### 5. Test the System

1. **Insert a test inbound email:**
   ```sql
   INSERT INTO public.emails (direction, subject, body, account_id, lead_id, campaign_id)
   VALUES ('inbound', 'Test Reply', 'I am interested in learning more!', 
           '<your-account-id>', '<your-lead-id>', '<your-campaign-id>');
   ```

2. **Check the queue:**
   ```sql
   SELECT * FROM public.brain_queue WHERE status = 'queued';
   ```

3. **Wait for worker to process (or trigger manually):**
   ```bash
   curl -X POST https://<project>.functions.supabase.co/reply-brain-worker \
     -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
   ```

4. **Check inference results:**
   ```sql
   SELECT * FROM public.reply_brain_inferences ORDER BY created_at DESC LIMIT 5;
   ```

## 🎯 Usage

### Viewing Inferences in UI

Add the `ReplyBrainBadge` component to your inbox UI:

```tsx
import { ReplyBrainBadge } from "@/app/(dashboard)/inbox/components/ReplyBrainBadge";

// In your inbox component:
<ReplyBrainBadge 
  intent={inference.intent} 
  action={inference.action} 
  confidence={inference.confidence} 
/>
```

### Submitting Feedback

```tsx
import { submitBrainFeedback } from "@/app/(dashboard)/inbox/_actions/brainFeedback";

const formData = new FormData();
formData.set("inferenceId", inference.id);
formData.set("correct_intent", "positive");
formData.set("correct_action", "send_followup_a");
formData.set("note", "Actually interested");

await submitBrainFeedback(formData);
```

### Configuring Policy

Navigate to `/settings/reply-brain` to adjust:
- Minimum confidence threshold (default: 0.65)
- Auto-actions and route-actions arrays

## 🔍 Monitoring

### Check Queue Status
```sql
SELECT 
  status, 
  COUNT(*) as count,
  AVG(attempt) as avg_attempts
FROM public.brain_queue
GROUP BY status;
```

### View Recent Inferences
```sql
SELECT 
  i.*,
  e.subject,
  l.email as lead_email
FROM public.reply_brain_inferences i
JOIN public.emails e ON e.id = i.email_id
LEFT JOIN public.leads l ON l.id = e.lead_id
ORDER BY i.created_at DESC
LIMIT 20;
```

### Check Feedback
```sql
SELECT 
  f.*,
  i.intent as original_intent,
  i.action as original_action
FROM public.reply_brain_feedback f
JOIN public.reply_brain_inferences i ON i.id = f.inference_id
ORDER BY f.created_at DESC;
```

## 🐛 Troubleshooting

### Queue Not Processing
1. Check cron job is running: Supabase Dashboard → Database → Cron Jobs
2. Verify function is deployed: `supabase functions list`
3. Check function logs: Supabase Dashboard → Edge Functions → reply-brain-worker → Logs

### Missing Account ID
The trigger tries to derive `account_id` from:
1. `emails.account_id` (if exists)
2. `campaigns.account_id` (via `campaign_id`)
3. `accounts.id` (via `user_id`)

Ensure at least one of these paths resolves correctly.

### OpenAI Errors
- Verify `OPENAI_API_KEY` is set correctly
- Check OpenAI API status
- Review function logs for detailed error messages

## 📝 Next Steps

1. **Integrate badges into inbox UI** - Add `ReplyBrainBadge` to your inbox thread view
2. **Tune confidence thresholds** - Start with 0.70-0.80 for safer auto-actions
3. **Collect feedback** - Use the feedback system to improve model accuracy
4. **Monitor performance** - Track inference accuracy and latency
5. **Customize prompts** - Update `reply_brain_models.system_prompt` per account

## 🎉 Block 103 Shipped!

The Adaptive Reply Brain system is now fully implemented and ready for use.
















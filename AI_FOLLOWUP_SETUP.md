# AI Follow-Up Writer & Scheduler Setup Guide

## Overview

The AI Follow-Up Writer automatically generates and schedules follow-up emails for leads who haven't replied in 3+ days. This keeps email sequences alive without manual effort.

## 🗄️ Database Setup

### 1. Apply Migration

Run the migration file in your Supabase SQL Editor:

```bash
# Copy contents of: supabase/migrations/20250231_ai_followup_queue.sql
# Paste and execute in: Supabase Dashboard → SQL Editor
```

This creates the `ai_followup_queue` table with:
- Draft storage (`ai_draft`, `ai_prompt`)
- Status tracking (`pending`, `approved`, `sent`, `skipped`)
- Scheduling (`scheduled_for`)
- RLS policies for org-based access

## 🚀 Edge Function Setup

### 2. Deploy AI Follow-Up Writer Function

```bash
# Deploy the edge function
supabase functions deploy ai-followup-writer --no-verify-jwt
```

**Environment Variables Required:**
- `SUPABASE_URL` - Already set
- `SUPABASE_SERVICE_ROLE_KEY` - Already set
- `OPENAI_API_KEY` - Must be set in Supabase Dashboard → Functions → Secrets

### 3. Configure Scheduled Execution

Set up a cron job or scheduled function to run `ai-followup-writer` daily.

**Option A: Supabase Scheduled Functions (pg_cron)**

In Supabase SQL Editor, run:

```sql
-- Schedule daily execution at 2 AM UTC
SELECT cron.schedule(
  'ai-followup-writer-daily',
  '0 2 * * *',  -- Daily at 2 AM UTC
  $$
  SELECT
    net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/ai-followup-writer',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
```

**Option B: External Cron (via cron job, GitHub Actions, etc.)**

```bash
# Call the function daily
curl -X POST \
  https://YOUR_PROJECT.supabase.co/functions/v1/ai-followup-writer \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

**Option C: Supabase Edge Function Cron**

Create `supabase/functions/cron-ai-followup/index.ts`:

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  
  const res = await fetch(`${supabaseUrl}/functions/v1/ai-followup-writer`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
  });
  
  return new Response(JSON.stringify({ ok: res.ok }), { status: 200 });
});
```

Then set up Supabase Scheduled Functions or external cron to call `cron-ai-followup`.

## 💻 Frontend Integration

The UI automatically displays follow-up drafts in the thread view:

1. Navigate to `/dashboard/replies/[threadId]`
2. If a pending draft exists, you'll see a "🤖 AI Follow-up Draft" box
3. Click "Send" to approve and send, or "Skip" to dismiss

## 🔧 How It Works

### Detection Logic

The `ai-followup-writer` function:
1. Finds threads with `last_message_at` older than 3 days
2. Filters for threads with `status = 'open'`
3. Skips threads that already have pending follow-ups
4. Generates personalized drafts using GPT-4o-mini
5. Schedules drafts for 12 hours later (configurable)

### Draft Generation

Each draft:
- Includes full conversation context
- References campaign goals ("book a call", "demo", "info")
- Matches tone of previous messages
- Stays under 100 words

### User Approval Flow

1. Draft appears in thread view
2. User clicks "Send" → Calls `/api/followups/send`
3. Message inserted into `messages` table
4. Thread status updated to "replied"
5. Draft marked as "sent" in queue

## 📝 API Endpoints

### `POST /api/followups/send`

Sends an approved follow-up draft.

**Request:**
```json
{
  "draftId": "uuid"
}
```

**Response:**
```json
{
  "ok": true,
  "messageId": "uuid"
}
```

## ✅ Verification Checklist

- [ ] Migration applied successfully
- [ ] `ai_followup_queue` table exists
- [ ] Edge function deployed
- [ ] `OPENAI_API_KEY` set in Supabase secrets
- [ ] Scheduler configured (daily execution)
- [ ] Test thread with no reply for 3+ days
- [ ] Verify draft appears in UI
- [ ] Test sending a draft
- [ ] Verify message is inserted
- [ ] Verify queue status updates to "sent"

## 🎯 Definition of Done

✅ **AI detects threads with no reply in 3+ days**
- Function queries `threads` with `last_message_at <= 3 days ago`
- Only processes threads with `status = 'open'`

✅ **Drafts personalized follow-ups automatically**
- Uses conversation context
- Includes campaign goals
- Generated via GPT-4o-mini

✅ **User can approve or skip**
- UI displays draft in thread view
- "Send" and "Skip" buttons functional

✅ **Sent drafts mark as "sent" in queue**
- Status updates to "sent" after successful send
- Message inserted into `messages` table

✅ **Automation truly continues conversations autonomously**
- Runs daily via scheduler
- No manual intervention required for detection/generation

## 🔍 Troubleshooting

**No drafts appearing?**
- Check that threads are older than 3 days
- Verify thread status is "open"
- Check edge function logs for errors
- Ensure `OPENAI_API_KEY` is set

**Drafts not sending?**
- Verify `/api/followups/send` endpoint is accessible
- Check browser console for errors
- Verify user has permissions to thread

**Scheduler not running?**
- Verify cron job is active
- Check Supabase function logs
- Test manual execution first


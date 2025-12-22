# Inbound Ingest Pollers

This MVP wires up Gmail and Outlook pollers that drop inbound mail into `inbox_messages` via the shared `ingest_inbound_message` RPC. The SQL helper adds lightweight AI labels so the inbox surfaces reply intent immediately.

## 1. Database Setup

Run the helper script in the Supabase SQL editor (or via `psql`):

```sql
\i supabase/sql/2025-11-06_inbound_ingest_ai_labels.sql
```

That script enables `pg_trgm`, installs the `detect_ai_label` function, ensures provider metadata columns on `connected_accounts`, creates a durable dead-letter queue, and publishes the `ingest_inbound_message` RPC.

## 2. Deploy Poller Functions

Deploy the edge functions from the workspace root:

```bash
supabase functions deploy gmail-poll
supabase functions deploy outlook-poll
```

Both functions assume `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are configured in the Supabase project and use the access tokens stored on `connected_accounts`.

## 3. Cron Schedules

The Supabase config already schedules both pollers to run every minute. Double-check `supabase/config.toml` if you override schedules locally.

```toml
[functions.gmail-poll]
verify_jwt = false

[cron.jobs.gmail-poll]
schedule = "* * * * *"
endpoint = "/functions/v1/gmail-poll"

[functions."outlook-poll"]
verify_jwt = false

[cron.jobs."outlook-poll"]
schedule = "* * * * *"
endpoint = "/functions/v1/outlook-poll"
```

## 4. Five-Minute Smoke Test

1. Send a test email from a secondary inbox (Gmail or Outlook) to an address that maps to an existing lead/thread.
2. Wait ~1 minute for the poller window. Confirm a new row appears in `inbox_messages` with the `ai_label` populated (`select ai_label, created_at from inbox_messages order by created_at desc limit 5`).
3. Open the thread list in the app and confirm:
   - The label chip shows `AI: …` in the metadata line.
   - `replied_at` and `stopped_by_reply` toggle to “replied / paused” for human replies.
4. Forward a bounce notice (e.g., “Delivery Status Notification (Failure)”) and ensure it lands with `ai_label = 'bounce'`, without marking the thread as replied.

Record any failures in `public.dead_letter_queue`—the pollers write provider errors there for retry triage.

## 5. Next Steps

- Replace `detect_ai_label` with the hosted LLM service once ready; keep the function signature identical so the pollers stay untouched.
- Upgrade the Gmail poller to use `watch` + `historyId` for real-time delivery when you have Pub/Sub wiring available.
- Add optional UI filters for high-intent labels (`positive`, `question`, etc.) to speed up triage.












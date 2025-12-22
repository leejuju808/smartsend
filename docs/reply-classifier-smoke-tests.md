# Reply Classifier Smoke Tests

This checklist covers the seed data helpers, automated UI smoke checks, and quick manual QA paths for the reply classifier and inbox snooze workflow.

## A. Supabase Test Helpers (run once)

1. Apply the SQL helpers in `supabase/sql/2025-11-09_inbox_test_helpers.sql`.
2. Run the block in Supabase SQL editor (or `supabase db remote commit`) to create:
   - `test_make_thread` – seeds a campaign, lead, and inbox thread.
   - `test_inbound` – inserts an inbound `normalized_messages` row.
   - `v_test_labels`, `v_test_threads` – scoped views for quick verification.
   - `test_cleanup` – removes seeded threads, leads, messages, and labels.

> These helpers are idempotent. `test_cleanup` only removes rows tied to the `QA Campaign` name or the generated `qa.<uuid>@example.com` leads.

## B. Seed and Trigger Classification

```
SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
tsx scripts/seed-reply-cases.ts
```

The script:
- Cleans existing QA data (`test_cleanup`).
- Creates four threads (OOO, Human, Positive, Bounce).
- Inserts representative inbound messages.
- Waits for the Edge Function classification pipeline.
- Prints latest labels and snooze states.

Expect:
- OOO thread snoozed near the detected return date.
- Labels present for all four threads.

## C. Playwright Smoke Tests (UI)

1. Ensure the database is populated via `pnpm qa:seed`.
2. Run the UI check:

```
pnpm qa:ui
```

The spec `tests/inbox-ooo.spec.ts` verifies:
- OOO chip is visible with label badges rendered.
- Human, Positive, and Bounce badges appear.
- Filter clear/reset path surfaces the empty state.
- Selecting Out of Office restores the OOO thread.

Local runs launch `pnpm dev` automatically; in CI the server should already be running.

## D. Manual QA Shortcuts

```
# Force reclassify latest inbound on a thread
curl -s -X POST "$SUPABASE_FUNCTION_URL/ai-reply-classifier" \
  -H "Content-Type: application/json" \
  -d '{"thread_id":"REPLACE-THREAD-UUID"}' | jq

# Inspect labels and OOO logs quickly
psql "$SUPABASE_DB_URL" -c "select label, confidence from public.reply_classes order by created_at desc limit 10;"
psql "$SUPABASE_DB_URL" -c "select thread_id, resume_after, active from public.out_of_office_logs order by created_at desc limit 10;"
```

Environment variables required:
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (seeding)
- `SUPABASE_FUNCTION_URL` (classify curl)
- `SUPABASE_DB_URL` (psql checks)

Populate them in `.env.local`, `.env.test`, or CI secrets.

## E. Pass / Fail Criteria

- **OOO case:** `reply_classes.label = 'out_of_office'` (confidence ≥ 0.75), active log in `out_of_office_logs`, thread snoozed until parsed date.
- **Human case:** label `human_reply` or `question`, no OOO log, no snooze.
- **Positive case:** label `positive` (confidence ≥ 0.6), no snooze.
- **Bounce case:** label `bounce`, no snooze (optionally low priority later).
- **UI:** OOO chip shows date, filter buttons respond, labeled timestamp and confidence render.

Document results (console output, screenshots) before sign-off.

## F. Teardown

```
psql "$SUPABASE_DB_URL" -c "select public.test_cleanup();"
```

Confirm all QA threads and labels are removed before closing the session.


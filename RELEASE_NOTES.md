# SmartSend 0.8.0 — Inbox Intelligence & Auto-Pause

**Why**: Reduce manual triage. Automatically label replies (Human, OOO, Question, Positive, Neutral, Routing, Bounce) and pause follow-ups if the lead is out of office.

## What’s new

- **AI Reply Classifier** (OpenAI + heuristics) writing to `reply_classes`
- **OOO Auto-Pause** using `out_of_office_logs` + `snoozed_until`
- **Guarded Send Queue** skips paused threads
- **Inbox UI** shows badges + OOO resume date
- **Cron Resume** clears pause when `resume_after` passes
- **End-to-end QA** seed + Playwright tests
- **Safety**: Feature flag, rate cap, audit logs, RLS

## How to enable

1. Deploy function: `supabase functions deploy ai-reply-classifier --no-verify-jwt`
2. Run SQL from Blocks 1–6 (idempotent)
3. Set envs: `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
4. Ensure `app_settings.functions_base_url` is set
5. Turn on flag:  
   `insert into public.feature_flags(key,enabled) values ('reply_classifier_enabled', true) on conflict (key) do update set enabled=true;`

## Verify in 5 minutes

- `pnpm qa:seed` → check `reply_classes` rows and OOO snooze set
- Open Inbox → see **OOO** chip with date
- Confirm sender reads `v_send_queue_guarded` (paused thread absent)
- Health row shows **OK** in `public.health_flags`

## Rollback

- `update public.feature_flags set enabled=false where key='reply_classifier_enabled';`
- (Optional) point scheduler back to non-guarded queue

## Known limitations

- OOO date parser = heuristic v1 (improves next sprint)
- Manual label override UI is stubbed (next)
- OpenAI model: `gpt-4o-mini` (upgrade path open)

🗒️ RELEASE_NOTES.md (for Notion / GitHub Release)

🧭 Owner checklist (copy into Notion)

- Feature flag ON in prod
- pg_cron visible job: smartsend_resume_from_ooo
- Logs show event=classified within last hour
- v_send_queue_guarded used by scheduler
- Playwright run passed (tests/inbox-ooo.spec.ts)
- One live inbound marked OOO → auto-pause verified
- One live inbound Human/Positive → not paused

📚 Mini API doc (internal)

POST /ai-reply-classifier

Body: {"message_id": "<uuid>"} or {"thread_id":"<uuid>"}

Response:

```
{
  "ok": true,
  "thread_id": "...",
  "message_id": "...",
  "label": "out_of_office|human_reply|question|positive|neutral|routing|bounce",
  "confidence": 0.0,
  "resume_after": "2025-11-28T09:00:00.000Z",
  "ooo_log_id": "..."
}
```

Side effects:

- Inserts into reply_classes
- If out_of_office: inserts into out_of_office_logs, sets inbox_threads.snoozed_until

🎯 Metrics to watch this week

- OOO detection precision (manual spot-check 50 OOO emails → target ≥95%)
- False-pause rate (non-OOO paused) → target ≤1%
- Mean time to classification (inbound → label) → target < 5s p95
- Follow-up suppression saves (# sends avoided during OOO)



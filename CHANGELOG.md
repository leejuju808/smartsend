## [0.8.0] - 2025-11-09

### Added

- AI Reply Classifier Edge Function (`/functions/ai-reply-classifier`) with OpenAI + OOO heuristics.
- `reply_classes` table + `v_inbox_labels` view for latest label per thread.
- `out_of_office_logs` table with `resume_after` and `active` flags.
- Auto-pause via `inbox_threads.snoozed_until` when OOO detected.
- DB automation:
  - `fn_queue_reply_classify` (pg_net HTTP → function)
  - trigger on `normalized_messages (AFTER INSERT, direction='inbound')`
  - scheduler guard `fn_can_send` + `v_send_queue_guarded`
  - `fn_resume_from_ooo` + pg_cron hourly job
- UI Inbox wiring:
  - Label badges, OOO chip (resume date tooltip)
  - Filters bar + search
  - Thread header badges (optional)
- QA harness:
  - SQL test helpers (`test_make_thread`, `test_inbound`, `test_cleanup`)
  - `scripts/seed-reply-cases.ts`
  - Playwright smoke test `tests/inbox-ooo.spec.ts`
- RLS, feature flag (`reply_classifier_enabled`), rate limiter, health checks.

### Changed

- `inbox` list API now hydrates label + OOO state (or use `v_inbox_state` view).

### Notes

- Rollback is instant by disabling the feature flag:  
  `update public.feature_flags set enabled=false where key='reply_classifier_enabled';`



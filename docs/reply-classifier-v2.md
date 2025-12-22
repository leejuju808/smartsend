# Reply Classifier v2 Notes

## Row-Level Security

- Tables `message_labels`, `ooo_patterns`, and `label_actions` are created without RLS policies. Add `account_id` or `workspace_id` columns before enabling RLS if per-tenant isolation is required.
- API routes under `/api/thread/[threadId]/labels` rely on the authenticated Supabase session, so row visibility must be enforced via policies when RLS is enabled.
- The edge function uses the service-role key and bypasses any policies. Ensure only trusted workflows can trigger `public.on_inbound_message_classify`.

## Operations

- The classifier edge function requires environment variables:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
- pg_net trigger posts to `current_setting('app.supabase_edge_base') || '/reply-classify-v2'`. Set `app.supabase_edge_base` (excluding trailing slash) and `app.service_jwt` in Postgres config.
- `ooo_patterns` are editable via the admin UI or SQL. Invalid regex entries are skipped at runtime to prevent crashes.
- The action runner assumes supporting tables exist (`ooo_schedules`, `followup_state`, `suppressions_email`, `tasks`, `send_queue`). Backfill or create them before enabling actions.
- Apply feature flag `reply_classifier_v2_enabled` at the campaign level before executing automation actions globally.

## Rollout

1. Seed the migration, deploy the Edge function, and run Supabase migrations.
2. Verify `/api/thread/:id/labels` returns expected payloads after inbound messages are processed.
3. Enable the campaign-level feature flag incrementally and monitor actions triggered by label matches.
4. Once stabilized, migrate legacy reply classification flows (if any) to use the new label tables.




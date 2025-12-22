# Deliverability Guard – Smoke Tests

Run these checks after deploying schema, edge function, API, and UI updates for the Deliverability Guard.

1. **Aggressive rule evaluation (simulate)**
   - Seed a test campaign with at least one step/variant/account.
   - Configure guard settings (`/api/campaign/:id/guard`) with strict thresholds:
     - `max_bounce_rate = 0.01`
     - `min_open_rate = 0.50`
     - `min_sends = 5`
   - Insert ≥6 send logs for the step/variant with `status='bounced'` or no opens.
   - Call `POST /functions/v1/deliverability-guard?campaignId=...&simulate=1`.
   - Expect JSON `actions` listing variant/step/account pauses.

2. **Live enforcement**
   - Re-run the guard without `simulate=1`.
   - Verify `step_variants.active = false`, `campaign_steps.paused = true`, and `accounts.paused = true` as applicable.
   - Confirm `deliverability_events` rows inserted with `level` of `paused` or `warn`.
   - UI shows “Paused by Guard” badge and recent events panel reflects actions.

3. **Scheduler + worker honoring pauses**
   - Attempt to enqueue follow-up sends for the paused variant/step.
   - Composer should refuse to enqueue (`409 step_paused`), and `vw_sendable_items` should exclude paused rows.
   - Sender worker skips any existing queued messages, updating `send_queue.status = 'skipped'` with `last_error='guard_*'`.

4. **Manual resume**
   - Use the Variant “Resume” button or `POST /api/variant/:id/resume` to reactivate.
   - Use `POST /api/step/:id/resume` for steps.
   - Verify flags cleared, `deliverability_events` contains `level='resume'`, and UI refreshes guard status.

5. **Recovering after threshold changes**
   - Relax guard thresholds (e.g., `max_bounce_rate=0.2`, `min_open_rate=0.05`).
   - Run the guard (simulate) and confirm `actions` array is empty.

6. **Cooldown behaviour**
   - Trigger a pause event, then re-run guard within the configured `cool_hours`.
   - Expect no additional actions/events until cooldown window expires.

Document results (screenshots/logs) before sign-off.


## Warm-Up Network Smoke Tests

1. **Schema deploy sanity**
   - Validate `warmup_settings`, `warmup_logs`, and `v_warmup_metrics` exist (e.g. `select count(*) from warmup_settings`).
   - Confirm `warmup_logs` has new `account_id` / `peer_account_id` columns (no legacy `session_id`).

2. **Enable two accounts**
   - Insert or identify two `public.accounts` rows for testing.
   - Call `POST /api/account/:id/warmup` with `{ "enabled": true }` for both.
   - Check `warmup_settings` rows are created with defaults.

3. **Scheduled runner**
   - Trigger the edge function manually: `curl -H "Authorization: Bearer <service-key>" https://<project>.functions.supabase.co/warmup-runner`.
   - Verify `warmup_logs` now contains `status='sent'` records for both accounts and that `last_run` timestamps updated.

4. **Auto opens / replies**
   - After a run, ensure at least some `status='opened'` and `status='replied'` rows exist when `auto_reply=true`.
   - Toggle `auto_reply=false` for one account and re-run; subsequent logs for that account should omit `opened/replied`.

5. **Ramp-up enforcement**
   - Set `daily_limit=40`, `ramp_days=14`, `start_date=today`.
   - Capture send counts across three consecutive runs (or edit `start_date` backwards).
   - Expect approx pattern 5 → 10 → 20 → 40 sends/day as ramp progresses.

6. **Disable path**
   - POST with `{ "enabled": false }` for one account.
   - Re-run the runner; verify no new `warmup_logs` rows for the disabled account and `last_run` is unchanged.

7. **Dashboard verification**
   - Load Deliverability → Smart Warm-Up card.
   - Confirm toggles reflect DB state and updating controls persists changes.
   - Warm-Up Metrics table should summarize latest `v_warmup_metrics` data with sensible % columns.

8. **Data hygiene**
   - Ensure logs are capped with valid statuses (`sent`, `opened`, `replied`, `failed`).
   - Run a quick aggregate check: `select d, sum(sent), sum(opened), sum(replied) from v_warmup_metrics group by 1 order by 1 desc limit 5;`.



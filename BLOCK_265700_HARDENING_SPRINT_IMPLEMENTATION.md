 # Block 265700 — SmartSend Hardening Sprint v1

 **Objective:** Remove every meaningful failure point before scale. No new features. No UI sugar. Just boring, enterprise‑grade reliability across send, automation, data, user actions, performance, and monitoring.

 This block pulls together and hardens:

 - `send_queue` + sender worker + deliverability shield
 - automation engine + followup engine + queue system caps
 - activity logs v2 + lead audit logs + email/SMS events
 - destructive UX patterns, dangerous toggles, and misconfigurable flows
 - performance under load for queue/AI/automation heavy paths
 - silent monitoring, alerting, and auto‑recovery circuits

 **Non‑goals:** No net‑new “features”, no visual redesigns, no new configuration panels. Every change must either:
 - Reduce the chance of a bad event happening, **or**
 - Detect a bad event faster and limit blast radius, **or**
 - Make recovery from a bad event trivial.

 ---

 ## 📦 Pillar 1 — Send Reliability & Deliverability Lock

 **Rule:** SmartSend never “keeps sending blindly.” Every outbound send goes through a hardened queue + safety stack, or it does not go at all.

 ### 1.1 Database & Queue Hardening

 **New migration (spec):** `supabase/migrations/20251215000000_block265700_send_reliability_lock.sql`

 **Goals:**
 - Make `send_queue` and `send_logs` fully traceable, idempotent, and safe to retry.
 - Add first‑class “deliverability health” signals into the queue, not just analytics.

 **Changes (spec level):**
 - **`send_queue`**
   - Add `failure_category` (`transient`, `permanent`, `policy`, `unknown`)
   - Add `max_attempts` with sane default (e.g. 6–8) and check constraint
   - Add `lock_token` (uuid) and `locked_at` for safer worker leasing on future scale
   - Add `safety_state` JSONB snapshot at enqueue time (domain health, caps, warmup stage)
 - **`send_logs`**
   - Enforce uniqueness on `(workspace_id, provider_message_id)` where not null
   - Add `delivery_outcome` (`accepted`, `delivered`, `deferred`, `bounced`, `complaint`)
   - Add `failure_category` mirror field to post‑send analysis
 - **Metrics / rollup tables**
   - `send_metrics_daily` (by workspace, account, provider, and domain)
   - `send_failure_summary` (aggregated by failure_category, campaign, automation step)
 - **Views**
   - `vw_send_queue_health` — exposes:
     - queue depth by workspace/account
     - average lag (now - scheduled_at) for due items
     - error rate over last 1h / 24h

 ### 1.2 Safety‑First Enqueue Path

 **Goal:** No code path should bypass deliverability and safety checks when enqueuing.

 **Spec:**
 - Introduce a single server helper: `lib/sender/guardedEnqueue.ts`
   - Wraps:
     - `checkDeliverabilitySafety()` from `lib/deliverability/block14900-safety.ts`
     - Safety Net rules (`should_send_email` RPC + sendGuard)
     - plan / billing send caps
   - Writes enriched `safety_state` into `send_queue`
   - Returns structured error with machine reason codes (`domain_paused`, `safety_net_block`, `cap_exceeded`, etc.)
 - **Refactor requirement:** all enqueue call sites (campaign sends, followups, manual one‑offs, proposal sender, automation steps) must:
   - Call `guardedEnqueue` instead of writing directly into `send_queue`
   - Log “blocked send” events via Activity Log v2 + Safety Net events

 ### 1.3 Retry Logic & Backoff Guarantees

 We already have exponential backoff on the sender worker. This block:

 - Codifies backoff into a DB function: `calculate_next_attempt(status, attempts, failure_category)`
 - Ensures:
   - Transient errors (timeouts, 5xx) retry up to `max_attempts`
   - Policy/permanent errors (`user_unknown`, `suppressed`, `domain_paused`) **do not** retry
 - Adds guardrail:
   - If a single workspace generates more than N failed sends in 15 minutes:
     - Auto‑pause that workspace’s queued sends (set `status = 'paused'`)
     - Log deliverability + safety events

 ### 1.4 Domain Warm‑Up & Deliverability Enforcement

 This block **ties Deliverability Shield + Safety Net directly into the queue:**

 - `vw_sendable_items` must filter by:
   - domain warmup limits (from `domain_warmup_state`)
   - domain health thresholds (from `domain_health`)
 - Add a DB function: `check_queue_sending_safety(p_queue_id)` that:
   - Asserts domain health above minimum
   - Asserts warmup limits not exceeded
   - Asserts Safety Net suppression rules pass
   - Raises an exception + marks queue row `failed` with `failure_category = 'policy'` if violated.

 ### 1.5 Bounce / Spam Detection Alerts & Auto‑Pause

 Build on:
 - Block 14900 (Deliverability Shield)
 - Block 13700 (Safety Net)
 - Email events tracking migrations

 **Spec:**
 - Nightly + rolling 15‑minute jobs that:
   - Compute bounce and complaint rates per:
     - workspace
     - domain
     - campaign
     - automation
   - If thresholds exceeded:
     - Auto‑pause offending campaign/automation/workspace sending
     - Write `deliverability_events` + `activity_logs_v2`
     - Raise an internal “Deliverability Alert” for the team (see Pillar 6)

 **Roofers outcome:** sends either **go out safely** or are **blocked with a clear reason**. No silent burns.

 ---

 ## 📦 Pillar 2 — Automation Guardrails & Failsafes

 **Rule:** Automations cannot run wild. If anything looks off, they pause themselves.

 ### 2.1 Automation Safety Model

 **New migration (spec):** `supabase/migrations/20251215000001_block265700_automation_guardrails.sql`

 **Goals:**
 - Cap how aggressive any automation can be.
 - Make “stop on reply” non‑optional and provable.

 **Changes (spec level):**
 - **`automations` / `automation_flows` tables (or equivalent):**
   - `max_followups_per_lead` (default: 6–8, hard upper bound)
   - `min_cooldown_hours` between messages (default: ≥24h for cold leads)
   - `stop_on_reply_required` (boolean, default true, cannot be false for external sends)
   - `safety_status` (`safe`, `limited`, `paused`, `blocked`)
 - **`automation_runs` / `automation_lead_state`:**
   - `messages_sent_count`
   - `last_sent_at`
   - `last_reply_at`

 ### 2.2 Global Stop‑On‑Reply Enforcement

 **Goal:** “Stop on reply” is not a UI toggle; it’s a protocol.

 **Spec:**
 - Shared DB function: `should_schedule_followup(p_lead_id, p_automation_id)`:
   - Denies scheduling if:
     - reply exists after last send in that automation
     - `messages_sent_count >= max_followups_per_lead`
     - automation `safety_status` ≠ `safe`
 - Every followup enqueue path (followup engine, sequences, campaigns configured as automations) must call this function before inserting into `send_queue` or actions queue.

 ### 2.3 Cooldown Timers & Volume Caps

 - Define per‑lead + per‑workspace cooldown logic:
   - For each lead, ensure minimum `min_cooldown_hours` between automation messages.
   - At workspace level, cap total automated sends per day per lead and per channel.
 - Expose cooldown violation as explicit error codes surfaced to:
   - internal logs
   - `activity_logs_v2`

 ### 2.4 Manual Override & Safe Rollback

 **Goal:** Humans can always yank the cord without breaking the system.

 **Spec:**
 - New table: `automation_overrides`
   - Records:
     - who paused/resumed
     - reason
     - scope (automation, campaign, workspace)
     - previous `safety_status`
 - New helper: `pauseAutomationWithAudit(automationId, scope, reason)`:
   - Updates automation status
   - Cancels unsent future followups (sets queue to `cancelled`)
   - Logs `user_action` + `pipeline` / `messaging` events into Activity Log v2

 ### 2.5 Anomaly‑Based Auto‑Pause

 **Goal:** If something looks off, the automation quietly stops itself instead of escalating the damage.

 **Spec job:** `automation_anomaly_guard` (cron or Supabase function)
 - Watches metrics over rolling windows for each automation:
   - abnormal spike in sends
   - unusual bounce/complaint rates relative to baseline
   - high rate of “blocked by Safety Net / Deliverability Shield” events
 - If triggered:
   - Set `safety_status = 'paused'`
   - Stop new enqueues for that automation
   - Log urgent activity event and internal alert

 **Roofers outcome:** No AI/autopilot flow can machine‑gun homeowners. It cuts itself off fast.

 ---

 ## 📦 Pillar 3 — Data Integrity & Audit Protection

 **Rule:** If it happened, SmartSend remembers it. Nothing “mysteriously disappears.”

 ### 3.1 Immutable Job & Message Timelines

 Build on:
 - Block 16600 `activity_logs_v2`
 - Block 21947 `lead_audit_log_v1`
 - Email/SMS events tracking migrations

 **Spec:**
 - Mark core audit tables as **append‑only**:
   - disallow `UPDATE` and `DELETE` via RLS + triggers
   - only allow `INSERT` and controlled soft‑delete (`deleted_at`) on non‑audit tables
 - Ensure:
   - Every send, reply, followup, pipeline move, automation action, and manual change:
     - writes at least one row to `activity_logs_v2` or `lead_audit_log`
     - includes `source` (`ai`, `user`, `system`) and `summary`.

 ### 3.2 Soft‑Deletes for Critical Entities

 **New migration (spec):** `supabase/migrations/20251215000002_block265700_soft_delete_protection.sql`

 - For critical tables: `leads`, `jobs`, `campaigns`, `automations`, `tasks`, etc.:
   - Add `deleted_at` and `deleted_by`
   - Replace hard deletes with soft deletes via DB functions:
     - `soft_delete_lead(...)`
     - `soft_delete_campaign(...)`
   - UI must filter out soft‑deleted rows by default, but allow audit exports.

 ### 3.3 Nightly Integrity Checks

 **New table:** `data_integrity_checks`
 - Fields: `id`, `created_at`, `scope`, `status`, `summary`, `details_json`

 **Job:** `run_data_integrity_checks` (cron or Supabase function)
 - Verifies:
   - counts between `send_queue` and `send_logs` (no orphaned sends)
   - referential integrity for key foreign keys (leads, campaigns, tasks)
   - no negative or impossible metrics
 - On failure:
   - mark `status = 'failed'`
   - log `activity_logs_v2` “system” events
   - create internal alert (Pillar 6)

 ### 3.4 Exportable History

 - API endpoints:
   - `GET /api/audit/export` — export events by date range, workspace, lead
   - `GET /api/jobs/[id]/timeline` — job‑level timeline combining activity logs, send logs, pipeline moves, tasks

 **Roofers outcome:** In disputes, insurance fights, or “what happened here?” moments, there is a clean, provable record.

 ---

 ## 📦 Pillar 4 — User Error Immunity

 **Rule:** Assume mistakes. Design so normal human errors cannot blow up operations.

 ### 4.1 Protected Entities & Safe Defaults

 **Spec:**
 - Mark critical objects as `protected`:
   - baseline pipelines
   - default automations
   - core sequences used by scheduler/dispatch
 - Rules:
   - Protected items cannot be deleted, only disabled/archived with explicit confirmation and impact summary.
   - Safe defaults for:
     - followup counts
     - cooldowns
     - “stop on reply” always on

 ### 4.2 Destructive Action Confirmations

 - Centralized component: `ConfirmDestructiveActionDialog` used across app for:
   - deleting jobs/leads
   - stopping campaigns/automations
   - wiping sequences, templates, or pipeline stages
 - Each destructive action must:
   - show **plain‑language impact** (“This will stop followups for 143 homeowners in the ‘Warm’ stage.”)
   - log an Activity Log v2 `user_action` event with snapshot of previous state.

 ### 4.3 “This Will Stop X” Warnings

 - For toggles and settings that disable:
   - critical automations
   - send queue
   - domain sending
 - Spec:
   - banner + inline text summarizing impact (“This will pause all new sends from SmartSend until you re‑enable.”)
   - link to a small “What will happen?” explainer modal with specific examples (no marketing fluff).

 ### 4.4 Misconfiguration Guards

 - Validation at save‑time for:
   - automations without exit conditions
   - followup chains that exceed policy caps
   - sequences that can send on same day multiple times without explicit override
 - Any invalid configuration:
   - blocked from saving
   - returns specific error with fix instructions.

 **Roofers outcome:** They can click around, change settings, even misread a label — and still not be able to accidentally nuke their jobs or spam homeowners.

 ---

 ## 📦 Pillar 5 — Performance Under Load

 **Rule:** Busy day, storm surge, or marketing blast — SmartSend stays responsive and useful.

 ### 5.1 Background Processing for Heavy Tasks

 - Confirm and enforce background processing for:
   - AI content generation for campaigns and replies
   - list imports and enrichment
   - bulk updates (pipeline moves, task creation)
 - UI pattern:
   - enqueue work to queues / jobs tables
   - show non‑blocking “working” toasts + progress indicators
   - rely on realtime or polling to update status.

 ### 5.2 Rate Limits & Throttling

 **Spec:**
 - Simple `rate_limits` table:
   - per workspace and per user caps for heavy endpoints (AI, imports, queue enqueue)
 - Middleware/utility:
   - `enforceRateLimit(key, limit, window)` used by API handlers
 - Behavior under throttle:
   - return 429 with clear, non‑technical explanation
   - never block the entire app — just the noisy path.

 ### 5.3 Graceful Degradation / Feature Kill Switches

 **New table:** `system_feature_flags`
 - Fields: `key`, `enabled`, `scope`, `reason`, `updated_at`

 **Usage:**
 - Non‑critical features (A/B testing, heavy analytics refresh, AI extras) must check a feature flag before doing heavy work.
 - Under load or incident:
   - internal team can flip flags to disable non‑critical features without redeploy.

 ### 5.4 Queue & Worker Health SLOs

 - Define target SLOs:
   - send queue: 95% of due items processed within 5 minutes
   - automation queue: 95% of due actions processed within 5 minutes
 - Implement monitoring queries (Pillar 6) tracking:
   - queue depth
   - max lag
   - error rates

 **Roofers outcome:** During storms and peak weeks, the app still feels alive, not frozen. Critical paths respond; nice‑to‑have features yield.

 ---

 ## 📦 Pillar 6 — Silent Monitoring & Instant Recovery

 **Rule:** Fix issues before roofers notice. If something breaks, contain and recover fast.

 ### 6.1 Health & Telemetry Schema

 **New migration (spec):** `supabase/migrations/20251215000003_block265700_monitoring_and_recovery.sql`

 **Tables (spec level):**
 - `system_health_snapshots`
   - queue depths, lag, error rates, send success rates, automation anomalies
 - `system_alerts`
   - `id`, `created_at`, `severity`, `source`, `category`, `summary`, `details_json`, `resolved_at`, `resolved_by`
 - `job_heartbeats`
   - track last successful run for key workers and crons (`sender-worker`, `followup-engine`, `tasks-cron`, etc.)

 ### 6.2 Uptime & Worker Monitoring

 - Heartbeat pattern:
   - each critical worker/cron calls a small RPC or inserts into `job_heartbeats` on success
 - Monitoring job `monitor_heartbeats`:
   - if a heartbeat is stale (e.g. > 5–10 minutes for minute‑level jobs):
     - create `system_alert`
     - log urgent Activity Log v2 event

 ### 6.3 Send Success & Automation Anomaly Detection

 - Scheduled job `monitor_send_success`:
   - tracks:
     - send success rate per provider/domain/workspace
     - bounce/complaint spikes
     - queue processing lag
 - Scheduled job `monitor_automation_anomalies`:
   - ties into Pillar 2 anomaly guard

 On threshold breach:
 - auto‑disable affected component:
   - pause offending campaigns/automations/workspace send
   - flip relevant `system_feature_flags`
 - notify internal team via:
   - email / Slack / internal notification sink (implementation detail)

 ### 6.4 Last Known Good State & Rollback

 **Spec (minimal viable rollback):**
 - For configuration objects (campaigns, automations, pipelines, key settings):
   - maintain `config_version` and snapshot table (`*_config_versions`)
   - any change creates a new version row
 - Recovery helpers:
   - `restoreAutomationConfigVersion(automationId, versionId)`
   - `restoreCampaignConfigVersion(campaignId, versionId)`

 **Roofers outcome:** Instead of “it’s broken, we’re looking into it,” issues are usually fixed or contained **before** they notice. When something does regress, we can roll back configuration quickly.

 ---

 ## ✅ Hardening Sprint Success Criteria (First 30 Days)

 This block is considered successful if, over the first 30 days in production:

 - **Zero missed sends reported** that are not explained in send logs and activity logs.
 - **Zero automation complaints** from roofers about “too many messages” or “AI went crazy.”
 - **Zero unexplained data loss incidents** (all disputed events can be reconstructed from logs).
 - **Support tickets for “is it working?” trend down** compared to prior 30‑day baseline.
 - Roofers and internal team both converge on the same description:
   - “It just works.”
   - “We don’t even think about it anymore.”
   - “You’d be stupid not to use the system that never breaks.”













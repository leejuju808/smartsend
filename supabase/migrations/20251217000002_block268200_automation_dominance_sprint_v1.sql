-- ============================================================================
-- Block 268200 — SmartSend Automation Dominance Sprint v1
-- Goal: Remove human error completely (guardrail + time-of-day + follow-up chain)
--
-- Key ideas:
-- - Track automation idempotently per `inbox_threads`
-- - Tag automated outbound messages in `inbox_messages` for analytics + “proof”
-- - No user-facing settings required; defaults are always-on and safe
-- ============================================================================

-- 1) Track guardrail + follow-up state on inbox_threads
ALTER TABLE public.inbox_threads
  ADD COLUMN IF NOT EXISTS autoguardrail_last_inbound_at timestamptz,
  ADD COLUMN IF NOT EXISTS autoguardrail_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS autoguardrail_channel text,
  ADD COLUMN IF NOT EXISTS autofollowup_anchor_at timestamptz,
  ADD COLUMN IF NOT EXISTS autofollowup_step int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS autofollowup_last_sent_at timestamptz;

-- Keep values sane (best-effort; don't break drift)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inbox_threads_autofollowup_step_check') THEN
    ALTER TABLE public.inbox_threads DROP CONSTRAINT inbox_threads_autofollowup_step_check;
  END IF;
  ALTER TABLE public.inbox_threads
    ADD CONSTRAINT inbox_threads_autofollowup_step_check
    CHECK (autofollowup_step >= 0 AND autofollowup_step <= 3);
EXCEPTION WHEN others THEN
  NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_inbox_threads_autoguardrail_due
  ON public.inbox_threads (autoguardrail_sent_at, autoguardrail_last_inbound_at);

CREATE INDEX IF NOT EXISTS idx_inbox_threads_autofollowup_due
  ON public.inbox_threads (autofollowup_anchor_at, autofollowup_step, autofollowup_last_sent_at)
  WHERE autofollowup_anchor_at IS NOT NULL;

-- 2) Tag automated messages for proof + reporting
ALTER TABLE public.inbox_messages
  ADD COLUMN IF NOT EXISTS automation_tag text,
  ADD COLUMN IF NOT EXISTS automation_meta jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_inbox_messages_automation_tag
  ON public.inbox_messages (automation_tag)
  WHERE automation_tag IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inbox_messages_thread_automation
  ON public.inbox_messages (thread_id, received_at DESC)
  WHERE automation_tag IS NOT NULL;

COMMENT ON COLUMN public.inbox_threads.autoguardrail_last_inbound_at IS
  'Block 268200: Last inbound timestamp we considered for the 15-minute holding-reply guardrail.';
COMMENT ON COLUMN public.inbox_threads.autoguardrail_sent_at IS
  'Block 268200: When SmartSend sent the holding reply for the most recent guardrail.';
COMMENT ON COLUMN public.inbox_threads.autofollowup_anchor_at IS
  'Block 268200: Anchor timestamp for the no-response follow-up chain (Day 2/4/7).';
COMMENT ON COLUMN public.inbox_threads.autofollowup_step IS
  'Block 268200: Follow-up chain step sent (0=none, 1=day2, 2=day4, 3=day7).';
COMMENT ON COLUMN public.inbox_messages.automation_tag IS
  'Block 268200: Non-null when message was sent automatically (guardrail_hold, followup_day2, followup_day4, followup_day7).';









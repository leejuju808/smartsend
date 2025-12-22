-- ============================================================================
-- BLOCK 268300 — SmartSend Replacement Sprint: "Kill the Office Manager" v1
--
-- Product goal:
-- - Make inbound replies feel like they land in SmartSend first (front desk)
-- - Auto-generate “call notes” (address, issue type, urgency) on the thread
-- - Support subtle “Handled by SmartSend” attribution in the UI
--
-- This migration is intentionally small + additive:
-- - Adds call-notes fields to `public.inbox_threads`
-- - Uses existing `inbox_messages.automation_tag` (Block 268200) for attribution
-- ============================================================================

-- 1) Auto-generated call notes (structured + UI-friendly)
ALTER TABLE public.inbox_threads
  ADD COLUMN IF NOT EXISTS call_notes_address text,
  ADD COLUMN IF NOT EXISTS call_notes_issue_type text,
  ADD COLUMN IF NOT EXISTS call_notes_urgency text,
  ADD COLUMN IF NOT EXISTS call_notes_generated_at timestamptz;

COMMENT ON COLUMN public.inbox_threads.call_notes_address IS
  'Block 268300: AI-extracted address from homeowner replies (if present).';
COMMENT ON COLUMN public.inbox_threads.call_notes_issue_type IS
  'Block 268300: AI-extracted issue type (e.g. leak, storm damage, replacement, repair, insurance claim, other).';
COMMENT ON COLUMN public.inbox_threads.call_notes_urgency IS
  'Block 268300: AI-extracted urgency (critical/high/medium/low).';
COMMENT ON COLUMN public.inbox_threads.call_notes_generated_at IS
  'Block 268300: When SmartSend last generated call notes for this thread.';

-- Helpful index for dashboards that surface “new info captured”
CREATE INDEX IF NOT EXISTS idx_inbox_threads_call_notes_generated_at
  ON public.inbox_threads (call_notes_generated_at DESC)
  WHERE call_notes_generated_at IS NOT NULL;


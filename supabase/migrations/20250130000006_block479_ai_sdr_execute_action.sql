-- Block 479 — Next Best Action Executor (Run NBM from Console)
-- When you click "Execute Primary Action", SmartSend actually does the thing

-- ============================================================================
-- 1️⃣ Update ai_sdr_events.event_type constraint to include nbm_wait and nbm_pause
-- ============================================================================

do $$
begin
  -- Drop old constraint if it exists
  alter table public.ai_sdr_events drop constraint if exists ai_sdr_events_event_type_check;
  
  -- Add new constraint with all event types including NBM actions
  alter table public.ai_sdr_events 
    add constraint ai_sdr_events_event_type_check 
    check (event_type in (
      'send_followup',
      'reply_interest',
      'revive_lead',
      'close_won',
      'close_lost',
      'ai_sdr_disabled',
      'throttled_daily_limit',
      'queued_for_review',
      'review_rejected',
      'manual_reply',
      'nbm_wait',
      'nbm_pause'
    ));
exception
  when others then null;
end $$;



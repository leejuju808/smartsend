-- Block 371 — Meeting Outcome & Value v1
-- Add deal tracking fields to reply_logs for meeting-intent replies

alter table public.reply_logs
  add column if not exists meeting_stage text, -- 'lead' | 'qualified' | 'proposal' | 'closed_won' | 'closed_lost'
  add column if not exists deal_value_cents integer,
  add column if not exists meeting_note text;

-- Optional: simple enum-like constraint
alter table public.reply_logs
  drop constraint if exists reply_logs_meeting_stage_check;

alter table public.reply_logs
  add constraint reply_logs_meeting_stage_check
  check (
    meeting_stage is null
    or meeting_stage in ('lead', 'qualified', 'proposal', 'closed_won', 'closed_lost')
  );

-- Indexes for filtering and sorting
create index if not exists reply_logs_meeting_stage_idx
  on public.reply_logs (workspace_id, meeting_stage)
  where meeting_stage is not null;

create index if not exists reply_logs_deal_value_idx
  on public.reply_logs (workspace_id, deal_value_cents desc)
  where deal_value_cents is not null;






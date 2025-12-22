-- Block 391 — AI Reply Classifier v1
-- Add AI classification fields to reply_logs table

alter table public.reply_logs
  add column if not exists ai_label text,
  add column if not exists ai_intent_summary text,
  add column if not exists ai_meeting_intent text,
  add column if not exists ai_confidence numeric,
  add column if not exists ai_raw jsonb,
  add column if not exists ai_classified_at timestamptz;

create index if not exists idx_reply_logs_ai_label
  on public.reply_logs (ai_label);

create index if not exists idx_reply_logs_ai_classified_at
  on public.reply_logs (ai_classified_at);





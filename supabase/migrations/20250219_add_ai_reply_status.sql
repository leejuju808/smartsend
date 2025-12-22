-- Add AI reply detection status to email_replies table
alter table public.email_replies
  add column if not exists ai_reply_status text default 'pending';

create index if not exists idx_email_replies_ai_status on public.email_replies(ai_reply_status);


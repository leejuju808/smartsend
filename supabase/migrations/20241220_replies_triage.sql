-- Faster loading/sorting
create index if not exists idx_replies_ws_time on public.email_replies(workspace_id, received_at desc);
create index if not exists idx_replies_lead on public.email_replies(lead_id);

-- Optional: track processing state
alter table public.email_replies
  add column if not exists handled boolean not null default false,
  add column if not exists snooze_until timestamptz;

create index if not exists idx_replies_actionable
  on public.email_replies (handled, snooze_until nulls first, received_at desc);
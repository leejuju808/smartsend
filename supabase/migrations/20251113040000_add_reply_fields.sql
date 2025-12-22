-- Block 167 — Replies Inbox: Add handled and qualified fields to email_replies

alter table public.email_replies
  add column if not exists handled boolean default false,
  add column if not exists qualified text
    check (qualified in ('hot','warm','cold','not_interested'))
    default null;

create index if not exists idx_replies_handled
  on public.email_replies (handled);

create index if not exists idx_replies_qualified
  on public.email_replies (qualified);













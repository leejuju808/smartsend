-- Email Reply Tracking Migration
-- Extends email_logs with provider message-id + reply metadata
-- Creates email_replies table for storing inbound replies

-- Extend email_logs with provider message-id + reply metadata
alter table public.email_logs
  add column if not exists provider_message_id text, -- set when sending via Gmail/Outlook/SMTP
  add column if not exists replied_at timestamptz,
  add column if not exists reply_intent text check (reply_intent in ('interested','booked','not_interested','unsubscribe','ooo','ambiguous')),
  add column if not exists reply_confidence numeric,
  add column if not exists reply_excerpt text;

create index if not exists idx_email_logs_provider_msg on public.email_logs(provider_message_id);

-- Store raw replies (thread)
create table if not exists public.email_replies (
  id uuid primary key default gen_random_uuid(),
  email_log_id uuid not null references public.email_logs(id) on delete cascade,
  provider text not null, -- 'gmail' | 'outlook' | 'smtp'
  provider_message_id text, -- id of the reply message
  in_reply_to text, -- provider msg-id the reply references
  from_email text not null,
  to_email text not null,
  subject text,
  body_text text,
  body_html text,
  intent text check (intent in ('interested','booked','not_interested','unsubscribe','ooo','ambiguous')) not null,
  confidence numeric,
  created_at timestamptz not null default now()
);

-- Indexes for email_replies
create index if not exists idx_email_replies_email_log on public.email_replies(email_log_id);
create index if not exists idx_email_replies_provider_msg on public.email_replies(provider_message_id);
create index if not exists idx_email_replies_in_reply_to on public.email_replies(in_reply_to);
create index if not exists idx_email_replies_from_email on public.email_replies(from_email);
create index if not exists idx_email_replies_created_at on public.email_replies(created_at desc);

alter table public.email_replies enable row level security;

-- RLS: owner can see their own
create policy "replies_select_own" on public.email_replies for select
  using (exists (
    select 1 from public.email_logs el where el.id = email_replies.email_log_id and el.user_id = auth.uid()
  ));

create policy "replies_insert_via_edge" on public.email_replies for insert
  with check (true); -- insert via service role from your API route

-- Helpful function: find the originating log by in-reply-to header
create or replace function public.find_log_by_inreplyto(p_in_reply_to text)
returns uuid
language sql
stable
as $$
  select id
  from public.email_logs
  where provider_message_id = p_in_reply_to
  limit 1
$$;

-- Reply counts per campaign view
create or replace view public.campaign_replies as
select el.campaign_id, count(*) as replies
from public.email_replies er
join public.email_logs el on el.id = er.email_log_id
group by el.campaign_id; 
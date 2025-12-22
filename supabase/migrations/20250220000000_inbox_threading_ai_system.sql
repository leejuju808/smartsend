-- A) Ensure inbox tables (lightweight, if not already present)

create table if not exists public.inbox_threads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  campaign_id uuid references public.campaigns(id) on delete set null,
  account_id uuid references public.connected_accounts(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,

  provider text,                      -- 'gmail' | 'outlook'
  provider_thread_id text,            -- Gmail threadId / Outlook conversationId
  subject text,
  replied_at timestamptz,
  stopped_by_reply boolean default false,

  unique (account_id, provider_thread_id)
);

create table if not exists public.inbox_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  direction text not null check (direction in ('outbound','inbound')),
  from_email text,
  to_email text,
  subject text,
  body_html text,
  received_at timestamptz,

  provider_message_id text,           -- Gmail id / Outlook id
  in_reply_to text,                   -- Message-Id it replied to (if any)

  -- AI
  ai_label text check (ai_label in ('positive','neutral','negative','unsubscribe','ooo','bounce','other')),
  ai_intent text,
  ai_confidence numeric,
  classified_at timestamptz
);

create index if not exists idx_inbox_messages_thread on public.inbox_messages(thread_id);
create index if not exists idx_inbox_threads_account_provider on public.inbox_threads(account_id, provider_thread_id);
create index if not exists idx_inbox_threads_campaign_lead on public.inbox_threads(campaign_id, lead_id);

-- B) Sent logs carry provider ids to make reply linkage trivial

alter table public.send_logs
  add column if not exists provider_message_id text,
  add column if not exists provider_thread_id text;

create index if not exists idx_send_logs_provider_msg on public.send_logs(provider_message_id);
create index if not exists idx_send_logs_provider_thread on public.send_logs(provider_thread_id);

-- C) Quick finder: thread by (campaign, lead) fallback

create or replace view public.v_thread_by_campaign_lead as
select distinct on (campaign_id, lead_id)
  id as thread_id, campaign_id, lead_id, provider_thread_id, replied_at
from public.inbox_threads
where campaign_id is not null and lead_id is not null
order by campaign_id, lead_id, coalesce(replied_at, 'epoch'::timestamptz) desc, created_at desc;

-- D) Simple labeler (heuristics)

create or replace function public.heuristic_label(p_html text)
returns text language plpgsql immutable as $$
begin
  if p_html is null then return 'other'; end if;
  if p_html ~* 'out of office|ooo|vacation' then return 'ooo'; end if;
  if p_html ~* 'unsubscribe|remove me' then return 'unsubscribe'; end if;
  if p_html ~* 'stop emailing|do not contact' then return 'unsubscribe'; end if;
  if p_html ~* 'thank|sounds good|let.*s talk|schedule|book' then return 'positive'; end if;
  if p_html ~* 'not interested|no thanks' then return 'negative'; end if;
  return 'neutral';
end $$;

-- E) RPC: classify newest unclassified inbound messages

create or replace function public.classify_recent_inbound(p_limit int default 100)
returns int language plpgsql security definer as $$
declare r record; v int := 0; lbl text; begin
  for r in
    select id, body_html
    from public.inbox_messages
    where direction='inbound' and ai_label is null
    order by created_at desc
    limit p_limit
  loop
    lbl := public.heuristic_label(r.body_html);
    update public.inbox_messages
       set ai_label = lbl, ai_confidence = case when lbl in ('ooo','unsubscribe') then 0.95 when lbl in ('positive','negative') then 0.8 else 0.6 end,
           classified_at = now()
     where id = r.id;
    v := v + 1;
  end loop;
  return v;
end $$;

-- F) RLS policies for inbox tables

alter table public.inbox_threads enable row level security;
alter table public.inbox_messages enable row level security;

-- Allow service role full access
grant all on public.inbox_threads to service_role;
grant all on public.inbox_messages to service_role;

-- Basic RLS: users can see threads for their campaigns
drop policy if exists inbox_threads_select on public.inbox_threads;
create policy inbox_threads_select on public.inbox_threads
  for select using (
    exists (
      select 1 from public.campaigns c
      where c.id = inbox_threads.campaign_id
      and c.user_id = auth.uid()
    ) or account_id in (
      select id from public.connected_accounts where user_id = auth.uid()
    )
  );

drop policy if exists inbox_messages_select on public.inbox_messages;
create policy inbox_messages_select on public.inbox_messages
  for select using (
    exists (
      select 1 from public.inbox_threads t
      join public.campaigns c on c.id = t.campaign_id
      where t.id = inbox_messages.thread_id
      and c.user_id = auth.uid()
    ) or exists (
      select 1 from public.inbox_threads t
      join public.connected_accounts ca on ca.id = t.account_id
      where t.id = inbox_messages.thread_id
      and ca.user_id = auth.uid()
    )
  );


-- 1) SQL — flags, labels, and an AI jobs queue (idempotent)

-- A) Add labels/flags on normalized + threads (safe if exists)
alter table public.normalized_messages
  add column if not exists ai_label text,
  add column if not exists ai_confidence numeric;

alter table public.normalized_messages
  drop constraint if exists normalized_messages_ai_label_check;

alter table public.normalized_messages
  add constraint normalized_messages_ai_label_check
  check (
    ai_label is null
    or ai_label in (
      'human_reply','question','positive','neutral','negative','ooo','unsubscribe','spam','bounce','other'
    )
  );

alter table public.normalized_messages
  drop constraint if exists normalized_messages_ai_confidence_check;

alter table public.normalized_messages
  add constraint normalized_messages_ai_confidence_check
  check (
    ai_confidence is null
    or (ai_confidence >= 0 and ai_confidence <= 1)
  );

alter table public.inbox_threads
  add column if not exists replied_at timestamptz,
  add column if not exists needs_reply boolean;

update public.inbox_threads
  set needs_reply = false
  where needs_reply is null;

alter table public.inbox_threads
  alter column needs_reply set default false;

alter table public.inbox_threads
  alter column needs_reply set not null;

-- B) (Optional) store per-message human flag for canonical table too
alter table public.inbox_messages
  add column if not exists ai_label text,
  add column if not exists ai_confidence numeric;

alter table public.inbox_messages
  drop constraint if exists inbox_messages_ai_label_check;

alter table public.inbox_messages
  add constraint inbox_messages_ai_label_check
  check (
    ai_label is null
    or ai_label in (
      'human_reply','question','positive','neutral','negative','ooo','unsubscribe','spam','bounce','other'
    )
  );

alter table public.inbox_messages
  drop constraint if exists inbox_messages_ai_confidence_check;

alter table public.inbox_messages
  add constraint inbox_messages_ai_confidence_check
  check (
    ai_confidence is null
    or (ai_confidence >= 0 and ai_confidence <= 1)
  );

-- C) AI jobs queue (service-only)
create table if not exists public.ai_reply_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  run_at timestamptz not null default now(),
  status text not null default 'queued'
    check (status in ('queued','working','done','failed','dead')),
  attempts int not null default 0,
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  provider text not null check (provider in ('gmail','outlook')),
  provider_message_id text not null,
  normalized_id uuid references public.normalized_messages(id) on delete cascade,
  error text
);

create unique index if not exists idx_aiq_unique_message
  on public.ai_reply_jobs(account_id, provider, provider_message_id);

create index if not exists idx_aiq_status_run
  on public.ai_reply_jobs(status, run_at);

create index if not exists idx_aiq_account
  on public.ai_reply_jobs(account_id, status);

alter table public.ai_reply_jobs
  enable row level security;

drop policy if exists "aiq_ro" on public.ai_reply_jobs;

create policy "aiq_ro" on public.ai_reply_jobs
  for select
  to authenticated
  using (false);

-- D) Enqueue on link (only inbound)
create or replace function public.tg_nm_enqueue_ai()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if  NEW.link_status = 'linked'
      and (OLD.link_status is distinct from 'linked')
      and NEW.direction = 'inbound' then
    insert into public.ai_reply_jobs (account_id, provider, provider_message_id, normalized_id, run_at)
    values (NEW.account_id, NEW.provider, NEW.provider_message_id, NEW.id, now())
    on conflict do nothing;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_nm_enqueue_ai on public.normalized_messages;

create trigger trg_nm_enqueue_ai
after update of link_status on public.normalized_messages
for each row execute procedure public.tg_nm_enqueue_ai();

-- E) Helper to set thread reply + needs_reply (centralized)
create or replace function public.mark_thread_reply(
  p_thread uuid,
  p_when timestamptz default now(),
  p_needs_reply boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.inbox_threads
     set replied_at = coalesce(replied_at, p_when),
         needs_reply = coalesce(needs_reply, false) or p_needs_reply
   where id = p_thread;
end;
$$;

revoke all on function public.mark_thread_reply(uuid, timestamptz, boolean) from public;
grant execute on function public.mark_thread_reply(uuid, timestamptz, boolean) to authenticated;

-- Refresh v_thread_status to incorporate normalized message labels
create or replace view public.v_thread_status as
with inbound as (
  select
    m.thread_id,
    m.created_at as occurred_at,
    m.id as message_id,
    m.ai_label,
    m.ai_confidence
  from public.inbox_messages m
  where m.direction in ('inbound', 'in')

  union all

  select
    nm.linked_thread_id as thread_id,
    coalesce(nm.sent_at, nm.created_at) as occurred_at,
    nm.id as message_id,
    nm.ai_label,
    nm.ai_confidence
  from public.normalized_messages nm
  where nm.direction = 'inbound'
    and nm.link_status = 'linked'
    and nm.linked_thread_id is not null
),
last_inbound as (
  select distinct on (thread_id)
    thread_id,
    occurred_at as last_in_at,
    message_id as last_in_id,
    ai_label as last_inbound_ai_label,
    ai_confidence as last_inbound_ai_score
  from inbound
  where thread_id is not null
  order by thread_id, occurred_at desc
),
last_human_out as (
  select
    m.thread_id,
    max(m.created_at) as last_human_out_at
  from public.inbox_messages m
  where m.direction = 'outbound'
    and coalesce((m.meta ->> 'sent_by'), 'ai') <> 'ai'
  group by m.thread_id
)
select
  t.id as thread_id,
  t.campaign_id,
  t.lead_id,
  t.needs_reply,
  t.replied_at,
  t.updated_at,
  li.last_in_at,
  li.last_in_id,
  li.last_inbound_ai_label,
  li.last_inbound_ai_label as last_in_label,
  li.last_inbound_ai_score,
  li.last_inbound_ai_score as last_in_score,
  lho.last_human_out_at
from public.inbox_threads t
left join last_inbound li on li.thread_id = t.id
left join last_human_out lho on lho.thread_id = t.id;



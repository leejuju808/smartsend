-- Email Threads System: Fast search, indexes, and threading
-- Creates email_threads table, triggers, functions, views, and indexes for inbox management

-- Thread table (1 row per external thread_id per account)
create table if not exists public.email_threads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references auth.users(id) on delete cascade, -- Using auth.users directly for simplicity
  thread_key text not null, -- provider thread id or fallback `${lead_id}:${campaign_id}`
  lead_id uuid references public.leads(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  last_message_at timestamptz not null default now(),
  last_direction text not null check (last_direction in ('inbound','outbound')),
  replied boolean not null default false,
  unread_count int not null default 0,
  subject text,
  archived boolean not null default false
);

create unique index if not exists email_threads_unique on public.email_threads(account_id, thread_key);

-- Connect emails -> thread
alter table public.emails
  add column if not exists thread_id uuid references public.email_threads(id) on delete set null;

-- Ensure emails table has required columns
alter table public.emails
  add column if not exists direction text check (direction in ('inbound','outbound')),
  add column if not exists body_plain text,
  add column if not exists provider_thread_id text;

-- Upsert/attach trigger on email insert
create or replace function public.attach_email_to_thread()
returns trigger language plpgsql as $$
declare 
  v_key text; 
  v_tid uuid;
  v_account_id uuid;
begin
  -- Build thread_key: prefer provider_thread_id, fallback to lead:campaign
  v_key := coalesce(
    new.provider_thread_id,
    new.thread_id::text,
    coalesce(new.lead_id::text, 'none') || ':' || coalesce(new.campaign_id::text, 'none')
  );
  
  -- Use user_id as account_id (emails.user_id -> email_threads.account_id)
  v_account_id := new.user_id;
  
  if v_account_id is null then
    return new; -- Skip if no user_id
  end if;
  
  -- Find or create thread
  select id into v_tid 
  from public.email_threads 
  where account_id = v_account_id and thread_key = v_key;
  
  if v_tid is null then
    insert into public.email_threads (
      account_id, thread_key, lead_id, campaign_id, subject, 
      last_message_at, last_direction, replied, unread_count
    )
    values (
      v_account_id, v_key, new.lead_id, new.campaign_id, new.subject, 
      coalesce(new.created_at, now()), 
      coalesce(new.direction, 'outbound'), 
      false, 
      case when new.direction = 'inbound' then 1 else 0 end
    )
    returning id into v_tid;
  else
    update public.email_threads
    set 
      last_message_at = greatest(last_message_at, coalesce(new.created_at, now())),
      last_direction = coalesce(new.direction, last_direction),
      subject = coalesce(subject, new.subject)
    where id = v_tid;
    
    if new.direction = 'inbound' then
      update public.email_threads 
      set unread_count = unread_count + 1 
      where id = v_tid;
    end if;
  end if;
  
  new.thread_id := v_tid;
  return new;
end$$;

drop trigger if exists trg_attach_email_to_thread on public.emails;
create trigger trg_attach_email_to_thread
before insert on public.emails
for each row execute function public.attach_email_to_thread();

-- Sync replied flag when we auto-mark (via reply_brain_inferences)
create or replace function public.sync_thread_replied()
returns trigger language plpgsql as $$
declare v_thread uuid;
begin
  select thread_id into v_thread 
  from public.emails 
  where id = new.email_id;
  
  if v_thread is not null then
    update public.email_threads 
    set replied = true 
    where id = v_thread;
  end if;
  
  return new;
end$$;

drop trigger if exists trg_sync_thread_replied on public.reply_brain_inferences;
create trigger trg_sync_thread_replied
after insert on public.reply_brain_inferences
for each row execute function public.sync_thread_replied();

-- Mark thread read/unread helpers
create or replace function public.thread_mark_read(p_thread_id uuid)
returns void language plpgsql security definer as $$
begin
  update public.email_threads 
  set unread_count = 0 
  where id = p_thread_id;
end$$;

create or replace function public.thread_mark_unread(p_thread_id uuid)
returns void language plpgsql security definer as $$
begin
  update public.email_threads 
  set unread_count = greatest(unread_count, 1) 
  where id = p_thread_id;
end$$;

grant execute on function public.thread_mark_read(uuid) to authenticated;
grant execute on function public.thread_mark_unread(uuid) to authenticated;

-- Search view (subject, lead, company, last msg text)
create or replace view public.inbox_search as
select
  t.id as thread_id,
  t.account_id,
  t.last_message_at,
  t.replied,
  t.unread_count,
  t.subject,
  t.campaign_id,
  l.email as lead_email,
  coalesce(
    nullif(trim(l.first_name || ' ' || l.last_name), ''),
    l.email
  ) as lead_name,
  l.company,
  coalesce(e.body_plain, e.body_text, e.body) as last_body
from public.email_threads t
left join public.leads l on l.id = t.lead_id
left join lateral (
  select body_plain, body_text, body 
  from public.emails
  where thread_id = t.id
  order by created_at desc
  limit 1
) e on true;

-- RLS
alter table public.email_threads enable row level security;
drop policy if exists "acct owns thread" on public.email_threads;
create policy "acct owns thread" on public.email_threads
  using (account_id = auth.uid()) 
  with check (account_id = auth.uid());

-- Indexes for speed
create index if not exists email_threads_account_last on public.email_threads(account_id, last_message_at desc);
create index if not exists email_threads_campaign on public.email_threads(campaign_id);
create index if not exists email_threads_lead on public.email_threads(lead_id);
create index if not exists email_threads_arch on public.email_threads(archived);
create index if not exists email_threads_replied on public.email_threads(replied);
create index if not exists email_threads_unread on public.email_threads(unread_count) where unread_count > 0;


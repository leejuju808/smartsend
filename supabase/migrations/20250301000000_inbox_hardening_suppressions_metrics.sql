-- =====================================================
-- 1) SQL — inbox message hardening + helpful indexes (idempotent)
-- =====================================================

-- A) Add missing cols used by inbound handler
-- Note: direction may already exist with different constraint; we add if not exists
alter table public.inbox_messages
  add column if not exists direction text,
  add column if not exists from_email citext,
  add column if not exists to_email citext,
  add column if not exists provider text,                    -- 'gmail' | 'outlook'
  add column if not exists provider_message_id text,
  add column if not exists provider_thread_id text;

-- Update direction constraint to support both 'in'/'out' and 'inbound'/'outbound' for compatibility
-- Drop existing constraint if it exists (may have different values)
alter table public.inbox_messages drop constraint if exists inbox_messages_direction_check;
-- Add new constraint that supports both formats
alter table public.inbox_messages add constraint inbox_messages_direction_check 
  check (direction in ('in','out','inbound','outbound'));

-- B) Indexes for fast inbox screens / joins
create index if not exists idx_inbox_msg_thread_created
  on public.inbox_messages(thread_id, created_at desc);

create index if not exists idx_inbox_msg_provider_mid
  on public.inbox_messages(provider, provider_message_id);

create index if not exists idx_inbox_msg_from_email
  on public.inbox_messages(from_email);

-- C) Keep threads fresh for 7-day reply-rate calc
alter table public.inbox_threads
  add column if not exists updated_at timestamptz not null default now();

create or replace function public._touch_thread()
returns trigger language plpgsql as $$
begin
  update public.inbox_threads set updated_at = now() where id = NEW.thread_id;
  return NEW;
end; $$;

drop trigger if exists trg_touch_thread_on_inbox_messages on public.inbox_messages;
create trigger trg_touch_thread_on_inbox_messages
after insert on public.inbox_messages
for each row execute function public._touch_thread();

-- =====================================================
-- 2) SQL — suppressions (user-level + campaign-level) + RLS
-- =====================================================

-- A) User-level suppressions
create table if not exists public.suppressions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email citext not null,
  reason text,                           -- 'unsubscribe','bounce','manual'
  unique (user_id, email)
);

-- B) Campaign-level suppressions
create table if not exists public.campaign_suppressions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  email citext not null,
  reason text,
  unique (campaign_id, email)
);

-- C) RLS
alter table public.suppressions enable row level security;
alter table public.campaign_suppressions enable row level security;

drop policy if exists sup_view on public.suppressions;
create policy sup_view on public.suppressions
for select using (
  exists (select 1 from public.campaigns c
          where c.user_id = user_id and c.user_id = auth.uid())
);

drop policy if exists csup_view on public.campaign_suppressions;
create policy csup_view on public.campaign_suppressions
for select using ( public.can_view_campaign(campaign_id) );

-- Writes via service role (your APIs); optional owner-writes:
drop policy if exists sup_ins_owner on public.suppressions;
create policy sup_ins_owner on public.suppressions
for insert with check (auth.uid() = user_id);

drop policy if exists csup_ins_owner on public.campaign_suppressions;
create policy csup_ins_owner on public.campaign_suppressions
for insert with check ( public.can_edit_campaign(campaign_id) );

-- =====================================================
-- 3) SQL — helper to upsert suppression from unsubscribe
-- =====================================================

create or replace function public.add_unsubscribe(
  p_campaign uuid,
  p_email citext
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid;
begin
  select user_id into v_user from public.campaigns where id = p_campaign;
  if v_user is null then return; end if;

  insert into public.campaign_suppressions(campaign_id, email, reason)
  values (p_campaign, p_email, 'unsubscribe')
  on conflict (campaign_id, email) do nothing;

  insert into public.suppressions(user_id, email, reason)
  values (v_user, p_email, 'unsubscribe')
  on conflict (user_id, email) do update set reason = excluded.reason;
end;
$$;

grant execute on function public.add_unsubscribe(uuid, citext) to service_role;

-- =====================================================
-- 6) SQL — lightweight correlation for "reply to last send"
-- =====================================================

-- Link last outbound send to a thread for reply analytics
alter table public.send_logs
  add column if not exists thread_id uuid references public.inbox_threads(id) on delete set null;

create index if not exists idx_logs_thread_created on public.send_logs(thread_id, created_at desc);

-- View: last outbound per thread
create or replace view public.v_thread_last_outbound as
select
  t.id as thread_id,
  max(l.created_at) as last_out_at,
  (array_agg(l.id order by l.created_at desc))[1] as last_send_log_id
from public.inbox_threads t
left join public.send_logs l on l.thread_id = t.id
group by t.id;

-- =====================================================
-- 7) Minimal metrics objects (materialized daily rollups)
-- =====================================================

create table if not exists public.campaign_metrics_daily (
  id bigserial primary key,
  day date not null,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  sent int not null default 0,
  opens int not null default 0,
  clicks int not null default 0,
  unsubscribes int not null default 0,
  replies int not null default 0,
  unique (campaign_id, day)
);

-- Recompute (run nightly via cron / Supabase scheduled function)
create or replace function public.rebuild_campaign_metrics_daily(p_campaign uuid, p_from date, p_to date)
returns void language sql as $$
  delete from public.campaign_metrics_daily
   where campaign_id = p_campaign and day between p_from and p_to;

  insert into public.campaign_metrics_daily(day, campaign_id, sent, opens, clicks, unsubscribes, replies)
  select d::date as day, p_campaign,
         coalesce( (select count(*) from public.send_logs l where l.campaign_id=p_campaign and l.created_at::date=d), 0) as sent,
         coalesce( (select count(*) from public.tracking_events te where te.campaign_id=p_campaign and te.kind='open' and te.created_at::date=d), 0) as opens,
         coalesce( (select count(*) from public.tracking_events te where te.campaign_id=p_campaign and te.kind='click' and te.created_at::date=d), 0) as clicks,
         coalesce( (select count(*) from public.tracking_events te where te.campaign_id=p_campaign and te.kind='unsubscribe' and te.created_at::date=d), 0) as unsubscribes,
         coalesce( (select count(*) from public.inbox_threads th where th.campaign_id=p_campaign and th.replied_at is not null and th.replied_at::date=d), 0) as replies
  from generate_series(p_from, p_to, interval '1 day') d;
$$;

grant execute on function public.rebuild_campaign_metrics_daily(uuid, date, date) to service_role;


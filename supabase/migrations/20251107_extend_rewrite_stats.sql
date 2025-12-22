-- Extend rewrite events and stats with preset support, idempotent

-- A) Link rewrite_events → rewrite_presets (nullable)
alter table public.rewrite_events
  add column if not exists preset_id uuid references public.rewrite_presets(id) on delete set null;

create index if not exists idx_rewrite_events_preset on public.rewrite_events(preset_id);

-- B) Ensure stats table baseline exists with preset support
create table if not exists public.rewrite_variant_stats (
  id uuid primary key default gen_random_uuid(),
  window text not null check (window in ('7d', '30d')),
  user_id uuid references auth.users(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  preset_id uuid references public.rewrite_presets(id) on delete set null,
  tone text check (tone in ('friendly', 'professional', 'concise', 'assertive', 'warm')),
  goal text check (goal in ('book_meeting', 'nudge', 'qualify', 'followup', 'intro')),
  length text check (length in ('short', 'medium', 'long')),
  source text check (source in ('composer', 'variant', 'followup_engine')),
  presets_used int not null default 0,
  sends int not null default 0,
  opens int not null default 0,
  replies int not null default 0,
  open_rate numeric not null default 0,
  reply_rate numeric not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.rewrite_variant_stats
  add column if not exists preset_id uuid references public.rewrite_presets(id) on delete set null;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'rewrite_variant_stats'
      and column_name = 'id'
      and is_nullable = 'YES'
  ) then
    execute 'alter table public.rewrite_variant_stats alter column id set not null';
  end if;
exception when duplicate_column then
  null;
end$$;

do $$
begin
  if exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'rewrite_variant_stats_unique_old'
  ) then
    execute 'drop index public.rewrite_variant_stats_unique_old';
  end if;

  begin
    alter table public.rewrite_variant_stats
      drop constraint rewrite_variant_stats_window_user_campaign_tone_goal_length_source_key;
  exception when undefined_object then
    null;
  end;
end$$;

create unique index if not exists rewrite_variant_stats_unique
on public.rewrite_variant_stats (
  window,
  user_id,
  coalesce(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(preset_id, '00000000-0000-0000-0000-000000000000'::uuid),
  tone,
  goal,
  length,
  source
);

do $$
begin
  begin
    alter table public.rewrite_variant_stats
      add constraint rewrite_variant_stats_unique
      unique using index rewrite_variant_stats_unique;
  exception when duplicate_object then
    null;
  end;
end$$;

create index if not exists idx_rvs_user_window on public.rewrite_variant_stats(user_id, window);
create index if not exists idx_rvs_campaign_window on public.rewrite_variant_stats(campaign_id, window);

alter table public.rewrite_variant_stats enable row level security;

drop policy if exists "rvs_read" on public.rewrite_variant_stats;
create policy "rvs_read" on public.rewrite_variant_stats
for select to authenticated
using (
  user_id = auth.uid()
  or (
    campaign_id is not null
    and public.is_campaign_viewer(campaign_id)
  )
);

-- C) Rewrite sends linkage (first send after pick within configurable window)
create or replace function public.rewrite_link_hours()
returns int
language sql
stable
as $$
  select 36;
$$;

create or replace view public.v_rewrite_sends as
select
  e.id         as rewrite_event_id,
  e.created_at as picked_at,
  e.user_id,
  e.campaign_id,
  e.thread_id,
  e.preset_id,
  e.tone,
  e.goal,
  e.length,
  e.source,
  s.id         as send_log_id,
  s.created_at as sent_at,
  s.subject_snapshot,
  s.provider,
  s.provider_message_id,
  s.provider_thread_id
from public.rewrite_events e
join lateral (
  select
    sl.id,
    sl.created_at,
    sl.subject_snapshot,
    sl.provider,
    sl.provider_message_id,
    sl.provider_thread_id
  from public.send_logs sl
  where sl.thread_id = e.thread_id
    and sl.created_at >= e.created_at
    and sl.created_at <= e.created_at + (public.rewrite_link_hours() || ' hours')::interval
  order by sl.created_at asc
  limit 1
) s on true;

-- D) Outcomes per send (opens / replies)
create or replace view public.v_send_outcomes as
with opens as (
  select
    l.id as send_log_id,
    min(ev.created_at) as first_open_at,
    count(*) as open_count
  from public.send_logs l
  join public.delivery_events ev
    on ev.send_log_id = l.id
   and ev.event = 'open'
  group by 1
),
replies as (
  select
    t.id as thread_id,
    min(m.created_at) as first_reply_at
  from public.inbox_threads t
  join public.inbox_messages m
    on m.thread_id = t.id
   and m.direction = 'inbound'
  group by 1
)
select
  s.id as send_log_id,
  s.thread_id,
  (o.first_open_at is not null) as opened,
  coalesce(o.open_count, 0) as open_count,
  (r.first_reply_at is not null and r.first_reply_at >= s.created_at) as replied,
  r.first_reply_at
from public.send_logs s
left join opens o on o.send_log_id = s.id
left join replies r on r.thread_id = s.thread_id;

-- E) Recompute with preset support
create or replace function public.rewrite_variant_stats_recompute(
  p_window text default '7d'
) returns void
language plpgsql
security definer
as $$
declare
  v_since timestamptz;
begin
  if p_window not in ('7d', '30d') then
    raise exception 'window must be 7d or 30d';
  end if;

  v_since := now() - case when p_window = '7d' then interval '7 days' else interval '30 days' end;

  with base as (
    select
      e.user_id,
      e.campaign_id,
      e.preset_id,
      e.tone,
      e.goal,
      e.length,
      e.source,
      count(*) filter (where e.picked)::int  as presets_used,
      count(s.send_log_id)::int              as sends,
      count(*) filter (where so.opened)::int as opens,
      count(*) filter (where so.replied)::int as replies
    from public.rewrite_events e
    left join public.v_rewrite_sends s on s.rewrite_event_id = e.id
    left join public.v_send_outcomes so on so.send_log_id = s.send_log_id
    where e.created_at >= v_since
    group by 1,2,3,4,5,6,7
  )
  insert into public.rewrite_variant_stats as t (
    window,
    user_id,
    campaign_id,
    preset_id,
    tone,
    goal,
    length,
    source,
    presets_used,
    sends,
    opens,
    replies,
    open_rate,
    reply_rate,
    updated_at
  )
  select
    p_window,
    user_id,
    campaign_id,
    preset_id,
    tone,
    goal,
    length,
    source,
    coalesce(presets_used, 0),
    coalesce(sends, 0),
    coalesce(opens, 0),
    coalesce(replies, 0),
    case when coalesce(sends, 0) > 0 then round(opens::numeric * 100.0 / sends, 2) else 0 end,
    case when coalesce(sends, 0) > 0 then round(replies::numeric * 100.0 / sends, 2) else 0 end,
    now()
  from base
  on conflict on constraint rewrite_variant_stats_unique
  do update set
    presets_used = excluded.presets_used,
    sends        = excluded.sends,
    opens        = excluded.opens,
    replies      = excluded.replies,
    open_rate    = excluded.open_rate,
    reply_rate   = excluded.reply_rate,
    updated_at   = now();
end
$$;


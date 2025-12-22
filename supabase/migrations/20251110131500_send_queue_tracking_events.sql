-- Queue-based tracking events & KPI views

create table if not exists public.tracking_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.tracking_events
  add column if not exists event text,
  add column if not exists campaign_id uuid references public.campaigns(id) on delete cascade,
  add column if not exists step_id uuid references public.campaign_steps(id) on delete set null,
  add column if not exists variant_id uuid references public.step_variants(id) on delete set null,
  add column if not exists lead_id uuid references public.leads(id) on delete set null,
  add column if not exists thread_id uuid references public.inbox_threads(id) on delete set null,
  add column if not exists queue_id uuid references public.send_queue(id) on delete cascade,
  add column if not exists url text,
  add column if not exists user_agent text,
  add column if not exists ip_hash text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tracking_events'
      and column_name = 'kind'
  ) then
    execute $sql$
      update public.tracking_events
         set event = case
           when event is not null then event
           when kind in ('open','opened') then 'open'
           when kind in ('click','clicked') then 'click'
           else event
         end
       where event is null;
    $sql$;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tracking_events'
      and column_name = 'event'
  ) then
    begin
      alter table public.tracking_events
        alter column event set not null;
    exception
      when others then
        -- ignore if existing data prevents immediate enforcement
        null;
    end;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tracking_events_event_check'
      and conrelid = 'public.tracking_events'::regclass
  ) then
    alter table public.tracking_events
      add constraint tracking_events_event_check
      check (event in ('open','click'));
  end if;
end $$;

create index if not exists idx_track_evt_campaign on public.tracking_events(campaign_id, created_at);
create index if not exists idx_track_evt_variant on public.tracking_events(variant_id, created_at);
create index if not exists idx_track_evt_queue on public.tracking_events(queue_id);

alter table public.send_queue
  add column if not exists tracking_token uuid;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'send_queue'
      and column_name = 'tracking_token'
  ) then
    begin
      alter table public.send_queue
        alter column tracking_token set default gen_random_uuid();
    exception
      when others then null;
    end;
  end if;
end $$;

create index if not exists idx_sq_token on public.send_queue(tracking_token);

alter table public.send_logs
  add column if not exists tracking_token uuid;

create index if not exists idx_sl_token on public.send_logs(tracking_token);

alter table public.tracking_events enable row level security;

drop policy if exists sel_tracking_events on public.tracking_events;
create policy sel_tracking_events
  on public.tracking_events
  for select
  to authenticated
  using ( public.is_campaign_viewer(campaign_id) );

create or replace view public.v_variant_opens as
select variant_id, count(*) as opens
from public.tracking_events
where event = 'open'
group by 1;

create or replace view public.v_variant_clicks as
select variant_id, count(*) as clicks
from public.tracking_events
where event = 'click'
group by 1;

create or replace view public.v_variant_metrics_ext as
select
  m.variant_id,
  m.step_id,
  m.name,
  m.weight,
  m.active,
  m.sends,
  m.replies,
  m.reply_rate,
  coalesce(o.opens, 0) as opens,
  coalesce(c.clicks, 0) as clicks,
  case when m.sends > 0 then round(100.0 * coalesce(o.opens, 0) / m.sends, 2) else 0 end as open_rate,
  case when m.sends > 0 then round(100.0 * coalesce(c.clicks, 0) / m.sends, 2) else 0 end as click_rate
from public.v_variant_metrics m
left join public.v_variant_opens o on o.variant_id = m.variant_id
left join public.v_variant_clicks c on c.variant_id = m.variant_id;



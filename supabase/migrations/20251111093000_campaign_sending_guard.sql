-- Campaign sending guard preferences and helper RPCs

-- A) Campaign sending prefs (simple, explicit)
create table if not exists public.campaign_sending_prefs (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  ooo_hold_days int not null default 14,
  honor_snooze boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.campaign_sending_prefs enable row level security;

drop policy if exists campaign_sending_prefs_select on public.campaign_sending_prefs;
create policy campaign_sending_prefs_select
  on public.campaign_sending_prefs
  for select
  to authenticated
  using (public.is_campaign_viewer(campaign_id));

drop policy if exists campaign_sending_prefs_insert on public.campaign_sending_prefs;
create policy campaign_sending_prefs_insert
  on public.campaign_sending_prefs
  for insert
  with check (public.is_campaign_editor(campaign_id));

drop policy if exists campaign_sending_prefs_update on public.campaign_sending_prefs;
create policy campaign_sending_prefs_update
  on public.campaign_sending_prefs
  for update
  using (public.is_campaign_editor(campaign_id))
  with check (public.is_campaign_editor(campaign_id));

create or replace function public.tg_touch_campaign_sending_prefs()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_campaign_sending_prefs on public.campaign_sending_prefs;
create trigger trg_touch_campaign_sending_prefs
before update on public.campaign_sending_prefs
for each row
execute function public.tg_touch_campaign_sending_prefs();

-- Seed prefs for existing campaigns if missing (idempotent)
insert into public.campaign_sending_prefs (campaign_id)
select c.id
from public.campaigns c
where not exists (
  select 1
  from public.campaign_sending_prefs p
  where p.campaign_id = c.id
);


alter table public.delivery_events
  add column if not exists type text;

-- B) Latest OOO & Resume per (campaign, lead)
create or replace view public.v_latest_ooo as
select
  d.campaign_id,
  d.lead_id,
  max(d.created_at) filter (where d.type = 'ooo_auto_pause') as last_ooo_at,
  max((d.meta ->> 'snooze_until')::timestamptz) as last_ooo_snooze_until
from public.delivery_events d
group by d.campaign_id, d.lead_id;

create or replace view public.v_latest_resume as
select
  d.campaign_id,
  d.lead_id,
  max(d.created_at) filter (where d.type = 'ooo_auto_resume') as last_resume_at
from public.delivery_events d
group by d.campaign_id, d.lead_id;


-- C) RPC: should we allow an outbound send right now?
create or replace function public.should_send_to_lead(
  p_campaign_id uuid,
  p_lead_id uuid
) returns table (
  allowed boolean,
  reason text,
  snooze_until timestamptz
)
language plpgsql
stable
as $$
declare
  v_days int;
  v_honor boolean;
  v_last_ooo timestamptz;
  v_snooze timestamptz;
  v_last_resume timestamptz;
  v_cutoff timestamptz;
begin
  select ooo_hold_days, honor_snooze
  into v_days, v_honor
  from public.campaign_sending_prefs
  where campaign_id = p_campaign_id;

  if v_days is null then
    v_days := 14;
    v_honor := true;
  end if;

  if v_days <= 0 then
    allowed := true;
    reason := null;
    snooze_until := null;
    return next;
    return;
  end if;

  select l.last_ooo_at, l.last_ooo_snooze_until
  into v_last_ooo, v_snooze
  from public.v_latest_ooo l
  where l.campaign_id = p_campaign_id
    and l.lead_id = p_lead_id;

  if v_last_ooo is null then
    allowed := true;
    reason := null;
    snooze_until := null;
    return next;
    return;
  end if;

  select r.last_resume_at
  into v_last_resume
  from public.v_latest_resume r
  where r.campaign_id = p_campaign_id
    and r.lead_id = p_lead_id;

  if v_last_resume is not null and v_last_resume >= v_last_ooo then
    allowed := true;
    reason := null;
    snooze_until := null;
    return next;
    return;
  end if;

  v_cutoff := now() - make_interval(days => v_days);

  if v_last_ooo >= v_cutoff then
    allowed := false;
    reason := 'ooo_recent_outbound_guard';
    if v_honor and v_snooze is not null and v_snooze > now() then
      snooze_until := v_snooze;
    else
      snooze_until := null;
    end if;
    return next;
    return;
  end if;

  allowed := true;
  reason := null;
  snooze_until := null;
  return next;
end;
$$;

grant execute on function public.should_send_to_lead(uuid, uuid) to authenticated, service_role;


-- Helpful indexes
create index if not exists idx_delivery_events_type_time
  on public.delivery_events (type, campaign_id, lead_id, created_at desc);


-- Optional — Bulk “Recheck Guard” action
create or replace function public.enqueue_guard_recheck(p_campaign_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.delivery_events (campaign_id, lead_id, type, meta)
  select
    p_campaign_id,
    l.id,
    'guard_recheck',
    jsonb_build_object('source', 'manual')
  from public.campaign_leads l
  where l.campaign_id = p_campaign_id;
end;
$$;

grant execute on function public.enqueue_guard_recheck(uuid) to authenticated, service_role;

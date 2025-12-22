-- BLOCK 270700 — SmartSend Market Ownership Sprint
-- Zip-Code Heat Presence (rows) + Zip Rotation Control (toggles)
--
-- Ships:
-- - campaign_zip_controls: per-campaign per-zip active/pause state
-- - v_campaign_zip_presence_30d: simple counts by ZIP (contacted/replies/jobs booked)
-- - ss_campaign_set_zip_active: toggles ZIP + immediately skips pending sends in paused ZIP

-- =========================================================
-- 1) Per-campaign ZIP controls
-- =========================================================

create table if not exists public.campaign_zip_controls (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  zip text not null,
  is_active boolean not null default true,
  paused_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (campaign_id, zip)
);

create index if not exists idx_campaign_zip_controls_campaign
  on public.campaign_zip_controls(campaign_id);

create or replace function public.set_campaign_zip_controls_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_campaign_zip_controls_updated_at on public.campaign_zip_controls;
create trigger trg_campaign_zip_controls_updated_at
before update on public.campaign_zip_controls
for each row
execute function public.set_campaign_zip_controls_updated_at();

alter table public.campaign_zip_controls enable row level security;

drop policy if exists "campaign_zip_controls_select_workspace_members" on public.campaign_zip_controls;
create policy "campaign_zip_controls_select_workspace_members" on public.campaign_zip_controls
for select
to authenticated
using (
  exists (
    select 1
    from public.campaigns c
    join public.workspace_members wm
      on wm.workspace_id = c.workspace_id
     and wm.user_id = auth.uid()
    where c.id = campaign_zip_controls.campaign_id
  )
);

drop policy if exists "campaign_zip_controls_write_workspace_members" on public.campaign_zip_controls;
create policy "campaign_zip_controls_write_workspace_members" on public.campaign_zip_controls
for all
to authenticated
using (
  exists (
    select 1
    from public.campaigns c
    join public.workspace_members wm
      on wm.workspace_id = c.workspace_id
     and wm.user_id = auth.uid()
    where c.id = campaign_zip_controls.campaign_id
  )
)
with check (
  exists (
    select 1
    from public.campaigns c
    join public.workspace_members wm
      on wm.workspace_id = c.workspace_id
     and wm.user_id = auth.uid()
    where c.id = campaign_zip_controls.campaign_id
  )
);

drop policy if exists "campaign_zip_controls_service_role_all" on public.campaign_zip_controls;
create policy "campaign_zip_controls_service_role_all" on public.campaign_zip_controls
for all
to service_role
using (true)
with check (true);

grant select on public.campaign_zip_controls to authenticated;
grant all on public.campaign_zip_controls to service_role;

comment on table public.campaign_zip_controls is
  'Block 270700: Per-campaign ZIP toggles. is_active=false means pause sends in that ZIP (capacity control).';

-- =========================================================
-- 2) ZIP heat presence (simple rows; rolling 30 days)
-- =========================================================

create or replace view public.v_campaign_zip_presence_30d as
with w as (
  select now() - interval '30 days' as since
)
select
  sq.campaign_id,
  sq.workspace_id,
  coalesce(
    nullif(trim(coalesce(l.zip_code, l.zip, ll.zipcode)), ''),
    'unknown'
  ) as zip,
  count(distinct sq.lead_id) filter (
    where sq.status in ('sent','delivered')
      and sq.updated_at >= w.since
  )::int as homeowners_contacted,
  count(distinct sq.lead_id) filter (
    where l.replied_at is not null
      and l.replied_at >= w.since
  )::int as replies,
  count(distinct sq.lead_id) filter (
    where l.appointment_booked_at is not null
      and l.appointment_booked_at >= w.since
  )::int as jobs_booked
from public.send_queue sq
join public.campaigns c
  on c.id = sq.campaign_id
left join public.leads l
  on l.id = sq.lead_id
left join public.lead_locations ll
  on ll.lead_id = sq.lead_id
cross join w
where sq.campaign_id is not null
group by sq.campaign_id, sq.workspace_id, zip;

grant select on public.v_campaign_zip_presence_30d to authenticated;

comment on view public.v_campaign_zip_presence_30d is
  'Block 270700: Rolling 30-day ZIP presence per campaign (contacted/replies/jobs booked).';

-- =========================================================
-- 3) RPC: toggle ZIP active + skip pending sends if paused
-- =========================================================

create or replace function public.ss_campaign_set_zip_active(
  p_campaign_id uuid,
  p_zip text,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_zip text := nullif(trim(coalesce(p_zip, '')), '');
  v_reason text := 'zip_paused';
begin
  if p_campaign_id is null or v_zip is null then
    raise exception 'campaign_id and zip required' using errcode = '22004';
  end if;

  -- Enforce membership for authenticated callers (service role is allowed too).
  if auth.uid() is not null then
    if not exists (
      select 1
      from public.campaigns c
      join public.workspace_members wm
        on wm.workspace_id = c.workspace_id
       and wm.user_id = auth.uid()
      where c.id = p_campaign_id
    ) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;

  insert into public.campaign_zip_controls(
    campaign_id,
    zip,
    is_active,
    paused_at,
    created_at,
    updated_at
  )
  values (
    p_campaign_id,
    v_zip,
    p_is_active,
    case when p_is_active then null else now() end,
    now(),
    now()
  )
  on conflict (campaign_id, zip) do update
  set
    is_active = excluded.is_active,
    paused_at = excluded.paused_at,
    updated_at = now();

  -- If pausing: immediately skip pending jobs in that ZIP.
  if p_is_active is distinct from true then
    update public.send_queue sq
    set
      status = 'skipped',
      last_error = case
        when sq.last_error is null or sq.last_error = '' then v_reason
        else sq.last_error || ' | ' || v_reason
      end
    from public.leads l
    left join public.lead_locations ll
      on ll.lead_id = l.id
    where sq.campaign_id = p_campaign_id
      and sq.lead_id = l.id
      and sq.status = 'pending'
      and coalesce(nullif(trim(coalesce(l.zip_code, l.zip, ll.zipcode)), ''), '') = v_zip;
  end if;
end;
$$;

revoke all on function public.ss_campaign_set_zip_active(uuid, text, boolean) from public;
grant execute on function public.ss_campaign_set_zip_active(uuid, text, boolean) to authenticated, service_role;

comment on function public.ss_campaign_set_zip_active(uuid, text, boolean) is
  'Block 270700: Sets per-campaign ZIP active state and (when pausing) skips pending send_queue jobs for that ZIP.';





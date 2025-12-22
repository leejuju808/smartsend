-- 1) SQL — presets + RLS (idempotent)

-- Global or per-campaign scenarios
create table if not exists public.nudge_scenario_presets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid references public.campaigns(id) on delete cascade, -- null = global
  key text not null,    -- e.g., 'no_reply','question','positive','neutral','routing'
  label text not null,  -- human label
  sort int not null default 100,
  is_active boolean not null default true,
  unique(campaign_id, key)
);

create index if not exists idx_nsp_campaign on public.nudge_scenario_presets(campaign_id);

-- Global or per-campaign tones
create table if not exists public.nudge_tone_presets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid references public.campaigns(id) on delete cascade, -- null = global
  key text not null,   -- 'professional','friendly','concise','assertive', ...
  label text not null,
  sort int not null default 100,
  is_active boolean not null default true,
  unique(campaign_id, key)
);

create index if not exists idx_ntp_campaign on public.nudge_tone_presets(campaign_id);

-- Effective presets (campaign overrides global)
create or replace view public.v_nudge_presets as
with s as (
  select coalesce(s.campaign_id, '00000000-0000-0000-0000-000000000000'::uuid) as cid,
         'scenario'::text as kind, s.key, s.label, s.sort, s.is_active, s.campaign_id
  from public.nudge_scenario_presets s
  union all
  select coalesce(t.campaign_id, '00000000-0000-0000-0000-000000000000'::uuid) as cid,
         'tone'::text, t.key, t.label, t.sort, t.is_active, t.campaign_id
  from public.nudge_tone_presets t
)
select * from s;

-- Seed globals (safe upserts)
insert into public.nudge_scenario_presets(campaign_id,key,label,sort)
select null,'no_reply','No reply',10
where not exists (select 1 from public.nudge_scenario_presets where campaign_id is null and key='no_reply');

insert into public.nudge_scenario_presets(campaign_id,key,label,sort)
select null,'question','Question',20
where not exists (select 1 from public.nudge_scenario_presets where campaign_id is null and key='question');

insert into public.nudge_scenario_presets(campaign_id,key,label,sort)
select null,'positive','Positive',30
where not exists (select 1 from public.nudge_scenario_presets where campaign_id is null and key='positive');

insert into public.nudge_scenario_presets(campaign_id,key,label,sort)
select null,'neutral','Neutral',40
where not exists (select 1 from public.nudge_scenario_presets where campaign_id is null and key='neutral');

insert into public.nudge_scenario_presets(campaign_id,key,label,sort)
select null,'routing','Routing',50
where not exists (select 1 from public.nudge_scenario_presets where campaign_id is null and key='routing');

insert into public.nudge_tone_presets(campaign_id,key,label,sort)
select null,'professional','Professional',10
where not exists (select 1 from public.nudge_tone_presets where campaign_id is null and key='professional');

insert into public.nudge_tone_presets(campaign_id,key,label,sort)
select null,'friendly','Friendly',20
where not exists (select 1 from public.nudge_tone_presets where campaign_id is null and key='friendly');

insert into public.nudge_tone_presets(campaign_id,key,label,sort)
select null,'concise','Concise',30
where not exists (select 1 from public.nudge_tone_presets where campaign_id is null and key='concise');

insert into public.nudge_tone_presets(campaign_id,key,label,sort)
select null,'assertive','Assertive',40
where not exists (select 1 from public.nudge_tone_presets where campaign_id is null and key='assertive');

-- RLS
alter table public.nudge_scenario_presets enable row level security;
alter table public.nudge_tone_presets enable row level security;

drop policy if exists sel_nsp on public.nudge_scenario_presets;
create policy sel_nsp on public.nudge_scenario_presets
  for select using ( campaign_id is null or public.is_campaign_viewer(campaign_id) );

drop policy if exists ins_upd_nsp on public.nudge_scenario_presets;
create policy ins_upd_nsp on public.nudge_scenario_presets
  for all using ( campaign_id is null or public.is_campaign_editor(campaign_id) )
  with check ( campaign_id is null or public.is_campaign_editor(campaign_id) );

drop policy if exists sel_ntp on public.nudge_tone_presets;
create policy sel_ntp on public.nudge_tone_presets
  for select using ( campaign_id is null or public.is_campaign_viewer(campaign_id) );

drop policy if exists ins_upd_ntp on public.nudge_tone_presets;
create policy ins_upd_ntp on public.nudge_tone_presets
  for all using ( campaign_id is null or public.is_campaign_editor(campaign_id) )
  with check ( campaign_id is null or public.is_campaign_editor(campaign_id) );

-- 2) SQL — pure render helper (no writes)
create or replace function public.render_nudge(
  p_campaign uuid,
  p_lead uuid,
  p_subject text,
  p_body text
) returns table(subject text, body text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lead record;
  v_pref record;
  v_sub text;
  v_body text;
begin
  if not public.is_campaign_viewer(p_campaign) then
    return; -- no rows
  end if;

  select first_name, company
    into v_lead
  from public.leads
  where id = p_lead;

  select duration_min, booking_link
    into v_pref
  from public.meeting_prefs
  where campaign_id = p_campaign;

  v_sub := coalesce(p_subject,'');
  v_body := coalesce(p_body,'');

  v_body := replace(v_body, '{lead_first}', coalesce(v_lead.first_name,''));
  v_body := replace(v_body, '{company}',    coalesce(v_lead.company,''));
  v_body := replace(v_body, '{me}',         'SmartSend');
  v_body := replace(v_body, '{duration}',   coalesce(v_pref.duration_min::text,'30'));
  v_body := replace(v_body, '{booking_link}', coalesce(v_pref.booking_link,''));
  v_body := replace(v_body, '{last_msg}',   '');
  v_body := replace(v_body, '{cta}',        'Open to a quick intro?');

  return query select v_sub, v_body;
end
$$;

revoke all on function public.render_nudge(uuid,uuid,text,text) from public;
grant execute on function public.render_nudge(uuid,uuid,text,text) to authenticated;


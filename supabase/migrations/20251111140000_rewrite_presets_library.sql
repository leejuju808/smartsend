-- Rewrite presets library, variable mappings, job logs, helpers, and weighted picker

-- A) Presets library (per campaign)
create table if not exists public.rewrite_presets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  scenario text not null,
  tone text not null,
  name text not null,
  weight real not null default 1.0,
  base_subject text not null default 'Quick question',
  base_body text not null,
  guidelines text,
  is_active boolean not null default true,
  unique (campaign_id, scenario, tone, name)
);

alter table public.rewrite_presets
  add column if not exists scenario text,
  add column if not exists weight real,
  add column if not exists base_subject text,
  add column if not exists base_body text,
  add column if not exists guidelines text,
  add column if not exists is_active boolean;

update public.rewrite_presets
  set scenario = coalesce(scenario, 'cold_intro'),
      tone = coalesce(tone, 'concise'),
      weight = coalesce(weight, 1.0),
      base_subject = coalesce(base_subject, 'Quick question'),
      base_body = coalesce(base_body, ''),
      is_active = coalesce(is_active, true);

alter table public.rewrite_presets
  alter column scenario set not null,
  alter column tone set not null,
  alter column name set not null,
  alter column weight set default 1.0,
  alter column weight set not null,
  alter column base_subject set default 'Quick question',
  alter column base_subject set not null,
  alter column base_body set default '',
  alter column base_body set not null,
  alter column is_active set default true,
  alter column is_active set not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'rewrite_presets_user_campaign_name_key'
      and conrelid = 'public.rewrite_presets'::regclass
  ) then
    alter table public.rewrite_presets
      drop constraint rewrite_presets_user_campaign_name_key;
  end if;
exception
  when undefined_object then
    null;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'rewrite_presets'
      and indexname = 'idx_rewrite_presets_campaign'
  ) then
    create index idx_rewrite_presets_campaign on public.rewrite_presets(campaign_id);
  end if;
exception
  when duplicate_table then
    null;
end $$;

-- B) Variable mappings (preset → lead path)
create table if not exists public.rewrite_var_mappings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  preset_id uuid not null references public.rewrite_presets(id) on delete cascade,
  var_name text not null,
  lead_path text not null,
  fallback text,
  unique (preset_id, var_name)
);

create index if not exists idx_rvm_preset on public.rewrite_var_mappings(preset_id);

-- C) Jobs / outputs for audit
create table if not exists public.rewrite_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  preset_id uuid not null references public.rewrite_presets(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  prompt jsonb,
  output jsonb,
  model text,
  status text not null default 'ok'
);

create index if not exists idx_rewrite_jobs_preset_lead on public.rewrite_jobs(preset_id, lead_id);

-- D) Row Level Security (members only)
alter table public.rewrite_presets enable row level security;
alter table public.rewrite_var_mappings enable row level security;
alter table public.rewrite_jobs enable row level security;

drop policy if exists "rewrite_presets_select" on public.rewrite_presets;
drop policy if exists "rewrite_presets_insert" on public.rewrite_presets;
drop policy if exists "presets_rw" on public.rewrite_presets;
create policy "presets_rw" on public.rewrite_presets
  for all using (public.is_member(campaign_id))
  with check (public.is_member(campaign_id));

drop policy if exists "rvm_read" on public.rewrite_var_mappings;
drop policy if exists "rvm_write" on public.rewrite_var_mappings;
drop policy if exists "rvm_update" on public.rewrite_var_mappings;
drop policy if exists "rvm_delete" on public.rewrite_var_mappings;
drop policy if exists "rvm_rw" on public.rewrite_var_mappings;
create policy "rvm_rw" on public.rewrite_var_mappings
  for all using (
    exists (
      select 1
      from public.rewrite_presets p
      where p.id = preset_id
        and public.is_member(p.campaign_id)
    )
  )
  with check (
    exists (
      select 1
      from public.rewrite_presets p
      where p.id = preset_id
        and public.is_member(p.campaign_id)
    )
  );

drop policy if exists "rjobs_rw" on public.rewrite_jobs;
drop policy if exists "rewrite_jobs_select" on public.rewrite_jobs;
create policy "rjobs_rw" on public.rewrite_jobs
  for select using (public.is_member(campaign_id));

-- Helper functions
create or replace function public.lead_value(p_lead uuid, p_path text)
returns text
language sql
stable
as $$
  with l as (
    select *
    from public.leads
    where id = p_lead
  )
  select case
    when p_path like 'meta->>%' then (
      select l.meta ->> replace(p_path, 'meta->>', '')
      from l
    )
    when p_path = 'first_name' then (select l.first_name from l)
    when p_path = 'last_name' then (select l.last_name from l)
    when p_path = 'company' then (select l.company from l)
    when p_path = 'email' then (select l.email from l)
    when p_path = 'title' then (select l.title from l)
    when p_path = 'city' then (select l.city from l)
    when p_path = 'state' then (select l.state from l)
    when p_path = 'country' then (select l.country from l)
    when p_path = 'website' then (select l.website from l)
    else null
  end;
$$;

create or replace function public.hydrate_with_lead(p_preset uuid, p_lead uuid, p_text text)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  r record;
  v text;
  out_text text := coalesce(p_text, '');
begin
  for r in
    select var_name, lead_path, fallback
    from public.rewrite_var_mappings
    where preset_id = p_preset
  loop
    v := public.lead_value(p_lead, r.lead_path);
    out_text := replace(out_text, '{{' || r.var_name || '}}', coalesce(nullif(v, ''), r.fallback, ''));
  end loop;

  -- Remove any remaining tokens that were not replaced
  out_text := regexp_replace(out_text, '{{[^}]+}}', '', 'g');
  return out_text;
end;
$$;

-- Weighted preset picker
create or replace function public.pick_rewrite_preset(p_campaign uuid, p_scenario text)
returns uuid
language plpgsql
stable
set search_path = public
as $$
declare
  v_id uuid;
  total real;
  r real;
begin
  select sum(weight) into total
  from public.rewrite_presets
  where campaign_id = p_campaign
    and scenario = p_scenario
    and is_active = true;

  if total is null or total <= 0 then
    return null;
  end if;

  r := random() * total;

  select id
  into v_id
  from (
    select id,
           sum(weight) over (order by created_at, id) as bucket
    from public.rewrite_presets
    where campaign_id = p_campaign
      and scenario = p_scenario
      and is_active = true
  ) t
  where bucket >= r
  order by bucket
  limit 1;

  return v_id;
end;
$$;



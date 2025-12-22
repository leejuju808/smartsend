-- 1) SQL — preset ↔ lead mappings + hydrator RPC (idempotent)

-- A) Map a preset's variable → a lead column (or JSON path in lead.meta)
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
create index if not exists idx_rvm_var on public.rewrite_var_mappings(preset_id, var_name);

alter table public.rewrite_var_mappings enable row level security;

drop policy if exists "rvm_read" on public.rewrite_var_mappings;
create policy "rvm_read" on public.rewrite_var_mappings
  for select to authenticated
  using (
    exists (
      select 1 from public.rewrite_presets p
      where p.id = preset_id
        and (p.campaign_id is null or public.is_campaign_viewer(p.campaign_id))
    )
  );

drop policy if exists "rvm_write" on public.rewrite_var_mappings;
create policy "rvm_write" on public.rewrite_var_mappings
  for insert to authenticated
  with check (
    exists (
      select 1 from public.rewrite_presets p
      where p.id = preset_id
        and (p.user_id = auth.uid())
        and (p.campaign_id is null or public.is_campaign_editor(p.campaign_id) or public.is_campaign_owner(p.campaign_id))
    )
  );

drop policy if exists "rvm_update" on public.rewrite_var_mappings;
create policy "rvm_update" on public.rewrite_var_mappings
  for update to authenticated
  using (
    exists (
      select 1 from public.rewrite_presets p
      where p.id = preset_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.rewrite_presets p
      where p.id = preset_id
        and p.user_id = auth.uid()
    )
  );

drop policy if exists "rvm_delete" on public.rewrite_var_mappings;
create policy "rvm_delete" on public.rewrite_var_mappings
  for delete to authenticated
  using (
    exists (
      select 1 from public.rewrite_presets p
      where p.id = preset_id
        and p.user_id = auth.uid()
    )
  );

-- B) Safe extractor for allowed lead paths
create or replace function public.lead_value_by_path(p_lead uuid, p_path text)
returns text
language sql
stable
as $$
  with l as (select * from public.leads where id = p_lead)
  select case
    when p_path = 'first_name' then l.first_name
    when p_path = 'last_name'  then l.last_name
    when p_path = 'company'    then l.company
    when p_path = 'title'      then l.title
    when p_path = 'email'      then l.email
    when p_path = 'city'       then l.city
    when p_path = 'state'      then l.state
    when p_path = 'country'    then l.country
    when p_path = 'website'    then l.website
    when p_path like 'meta->>%' then (l.meta ->> split_part(p_path, 'meta->>', 2))
    else null
  end
  from l;
$$;

-- C) Hydrate a preset's variables for a given lead
drop function if exists public.hydrate_preset_vars(uuid, uuid);
create or replace function public.hydrate_preset_vars(p_preset uuid, p_lead uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  base jsonb := '{}'::jsonb;
  out  jsonb := '{}'::jsonb;
  r record;
  v text;
  _campaign uuid;
begin
  -- Ensure caller can at least view this preset (via campaign membership RLS on rewrite_presets)
  select coalesce(variables, '{}'::jsonb), campaign_id
  into base, _campaign
  from public.rewrite_presets
  where id = p_preset;

  if base is null then
    return '{}'::jsonb;
  end if;

  if _campaign is not null and not public.is_campaign_viewer(_campaign) then
    -- deny if not viewer
    return '{}'::jsonb;
  end if;

  out := base;

  for r in
    select var_name, lead_path, fallback
    from public.rewrite_var_mappings
    where preset_id = p_preset
  loop
    select public.lead_value_by_path(p_lead, r.lead_path) into v;
    if v is null or btrim(v) = '' then
      v := r.fallback;
    end if;
    if v is not null then
      out := jsonb_set(out, array[r.var_name], to_jsonb(v), true);
    end if;
  end loop;

  return out;
end;
$$;

grant execute on function public.hydrate_preset_vars(uuid, uuid) to authenticated;

-- D) Campaign-level convenience: pick first preset by created_at and hydrate
drop function if exists public.hydrate_campaign_vars(uuid, uuid);
create or replace function public.hydrate_campaign_vars(p_campaign uuid, p_lead uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_preset uuid;
begin
  -- viewer check
  if not public.is_campaign_viewer(p_campaign) then
    return '{}'::jsonb;
  end if;

  select id into v_preset
  from public.rewrite_presets
  where campaign_id = p_campaign
  order by created_at asc
  limit 1;

  if v_preset is null then
    return '{}'::jsonb;
  end if;

  return public.hydrate_preset_vars(v_preset, p_lead);
end;
$$;

grant execute on function public.hydrate_campaign_vars(uuid, uuid) to authenticated;




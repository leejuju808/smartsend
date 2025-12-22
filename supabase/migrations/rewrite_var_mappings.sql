-- Rewrite preset variable mappings + hydration helpers

create table if not exists public.rewrite_var_mappings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  preset_id uuid not null references public.rewrite_presets(id) on delete cascade,
  var_name text not null,
  lead_path text not null,
  fallback text,
  unique (preset_id, var_name)
);

alter table public.rewrite_var_mappings enable row level security;

drop policy if exists "rvm_read" on public.rewrite_var_mappings;
create policy "rvm_read" on public.rewrite_var_mappings
  for select to authenticated
  using (
    exists (
      select 1
      from public.rewrite_presets p
      where p.id = preset_id
        and (p.campaign_id is null or public.is_campaign_viewer(p.campaign_id))
    )
  );

drop policy if exists "rvm_write" on public.rewrite_var_mappings;
create policy "rvm_write" on public.rewrite_var_mappings
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.rewrite_presets p
      where p.id = preset_id
        and p.user_id = auth.uid()
        and (
          p.campaign_id is null
          or public.is_campaign_editor(p.campaign_id)
          or public.is_campaign_owner(p.campaign_id)
        )
    )
  );

create policy "rvm_update" on public.rewrite_var_mappings
  for update to authenticated
  using (
    exists (
      select 1
      from public.rewrite_presets p
      where p.id = preset_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.rewrite_presets p
      where p.id = preset_id
        and p.user_id = auth.uid()
    )
  );

create or replace function public.lead_value_by_path(p_lead uuid, p_path text)
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
    when p_path = 'first_name' then l.first_name
    when p_path = 'last_name' then l.last_name
    when p_path = 'company' then l.company
    when p_path = 'title' then l.title
    when p_path = 'email' then l.email
    when p_path = 'city' then l.city
    when p_path = 'state' then l.state
    when p_path = 'country' then l.country
    when p_path = 'website' then l.website
    when p_path like 'meta->>%' then l.meta ->> split_part(p_path, 'meta->>', 2)
    else null
  end
  from l;
$$;

create or replace function public.hydrate_preset_vars(p_preset uuid, p_lead uuid)
returns jsonb
language plpgsql
stable
as $$
declare
  base jsonb := '{}'::jsonb;
  out jsonb := '{}'::jsonb;
  r record;
  v text;
begin
  select coalesce(variables, '{}'::jsonb) into base
  from public.rewrite_presets
  where id = p_preset;

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

create or replace function public.hydrate_campaign_vars(p_campaign uuid, p_lead uuid)
returns jsonb
language plpgsql
stable
as $$
declare
  v_preset uuid;
begin
  select id
  into v_preset
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




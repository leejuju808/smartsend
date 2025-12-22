set search_path = public, pg_temp;

-- 1) Shared resources catalog -------------------------------------------------
create table if not exists public.shared_resources (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  scope text not null default 'account' check (scope in ('account','campaign')),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  kind text not null check (kind in ('nudge_preset','rewrite_preset','saved_view','preflight_preset')),
  name text not null,
  description text,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  current_version int not null default 1,
  tags text[] not null default '{}'
);

create index if not exists idx_shared_kind on public.shared_resources(kind, status);
create index if not exists idx_shared_campaign on public.shared_resources(campaign_id);

alter table public.shared_resources
  alter column current_version set default 0;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_shared_resources_updated_at'
  ) then
    create trigger trg_shared_resources_updated_at
      before update on public.shared_resources
      for each row
      execute function public.handle_updated_at();
  end if;
exception
  when undefined_function then
    -- backfill common timestamp helper if this environment is missing it
    execute $func$
      create or replace function public.handle_updated_at()
      returns trigger
      language plpgsql
      security definer
      set search_path = public
      as $$
      begin
        new.updated_at := now();
        return new;
      end;
      $$;
    $func$;

    create trigger trg_shared_resources_updated_at
      before update on public.shared_resources
      for each row
      execute function public.handle_updated_at();
end;
$$;

-- 2) Versioned content blobs ---------------------------------------------------
create table if not exists public.shared_versions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  resource_id uuid not null references public.shared_resources(id) on delete cascade,
  version int not null,
  content jsonb not null,
  changelog text,
  unique (resource_id, version)
);

-- 3) Permissions ---------------------------------------------------------------
create table if not exists public.shared_permissions (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.shared_resources(id) on delete cascade,
  subject_type text not null check (subject_type in ('user','campaign','role')),
  subject_id uuid,
  level text not null check (level in ('view','use','edit','admin'))
);

create index if not exists idx_shared_perm_resource on public.shared_permissions(resource_id);

-- 4) Adoptions -----------------------------------------------------------------
create table if not exists public.shared_adoptions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  resource_id uuid not null references public.shared_resources(id) on delete cascade,
  resource_version int not null,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  mode text not null default 'clone' check (mode in ('clone','inherit')),
  applied_to jsonb,
  unique (resource_id, campaign_id, mode)
);

-- 5) Supporting structures -----------------------------------------------------
alter table if exists public.shared_resources enable row level security;
alter table if exists public.shared_versions enable row level security;
alter table if exists public.shared_permissions enable row level security;
alter table if exists public.shared_adoptions enable row level security;

-- Ensure downstream campaign tables can capture adoption metadata payloads
alter table if exists public.rewrite_presets
  add column if not exists config jsonb default '{}'::jsonb;

-- 6) Permission helpers --------------------------------------------------------
create or replace function public.shared_permission_rank(p_level text)
returns int
language sql
immutable
as $$
  select case lower(p_level)
    when 'view' then 1
    when 'use' then 2
    when 'edit' then 3
    when 'admin' then 4
    else null
  end;
$$;

create or replace function public.has_shared_permission(
  p_resource uuid,
  p_required_level text default 'view'
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_required int;
  v_owner uuid;
  v_campaign uuid;
  v_scope text;
  v_workspace uuid;
  v_granted int;
begin
  v_required := public.shared_permission_rank(p_required_level);
  if v_required is null then
    raise exception 'invalid permission level %', p_required_level;
  end if;

  select owner_id, campaign_id, scope
  into v_owner, v_campaign, v_scope
  from public.shared_resources
  where id = p_resource;

  if not found then
    return false;
  end if;

  if v_owner = auth.uid() then
    return true;
  end if;

  if v_campaign is not null then
    select workspace_id into v_workspace
    from public.campaigns
    where id = v_campaign;
  end if;

  if v_workspace is null then
    select wm.workspace_id
    into v_workspace
    from public.workspace_members wm
    where wm.user_id = v_owner
    limit 1;
  end if;

  select max(public.shared_permission_rank(level))
  into v_granted
  from public.shared_permissions p
  where p.resource_id = p_resource
    and (
      (p.subject_type = 'user' and p.subject_id = auth.uid())
      or (
        p.subject_type = 'campaign'
        and p.subject_id is not null
        and exists (
          select 1
          from public.campaign_members cm
          where cm.campaign_id = p.subject_id
            and cm.user_id = auth.uid()
        )
      )
      or (
        p.subject_type = 'role'
        and v_workspace is not null
        and p.level in ('view','use','edit','admin')
        and case public.shared_permission_rank(p.level)
              when 4 then public.has_workspace_role(v_workspace, array['owner','admin'])
              when 3 then public.has_workspace_role(v_workspace, array['owner','admin'])
              when 2 then public.has_workspace_role(v_workspace, array['owner','admin','member'])
              else public.has_workspace_role(v_workspace, array['owner','admin','member','viewer'])
            end
      )
    );

  return coalesce(v_granted, 0) >= v_required;
end;
$$;

create or replace function public.can_view_resource(p_resource uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_shared_permission(p_resource, 'view');
$$;

-- 7) Row-level security policies ----------------------------------------------
drop policy if exists "shared_resources_ro" on public.shared_resources;
create policy "shared_resources_ro" on public.shared_resources
  for select using (public.can_view_resource(id));

drop policy if exists "shared_resources_insert" on public.shared_resources;
create policy "shared_resources_insert" on public.shared_resources
  for insert with check (auth.uid() = owner_id);

drop policy if exists "shared_resources_update" on public.shared_resources;
create policy "shared_resources_update" on public.shared_resources
  for update using (public.has_shared_permission(id, 'admin'))
  with check (public.has_shared_permission(id, 'admin'));

drop policy if exists "shared_resources_delete" on public.shared_resources;
create policy "shared_resources_delete" on public.shared_resources
  for delete using (public.has_shared_permission(id, 'admin'));

drop policy if exists "shared_versions_ro" on public.shared_versions;
create policy "shared_versions_ro" on public.shared_versions
  for select using (public.can_view_resource(resource_id));

drop policy if exists "shared_versions_insert" on public.shared_versions;
create policy "shared_versions_insert" on public.shared_versions
  for insert with check (public.has_shared_permission(resource_id, 'admin'));

drop policy if exists "shared_permissions_rw" on public.shared_permissions;
create policy "shared_permissions_rw" on public.shared_permissions
  for select using (public.can_view_resource(resource_id))
  for insert with check (
    exists (
      select 1
      from public.shared_resources r
      where r.id = resource_id
        and r.owner_id = auth.uid()
    )
  )
  for update using (
    exists (
      select 1
      from public.shared_resources r
      where r.id = resource_id
        and r.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.shared_resources r
      where r.id = resource_id
        and r.owner_id = auth.uid()
    )
  );

drop policy if exists "shared_adoptions_ro" on public.shared_adoptions;
create policy "shared_adoptions_ro" on public.shared_adoptions
  for select using (
    public.can_view_resource(resource_id)
    or public.is_member(campaign_id)
  );

drop policy if exists "shared_adoptions_insert" on public.shared_adoptions;
create policy "shared_adoptions_insert" on public.shared_adoptions
  for insert with check (
    public.has_shared_permission(resource_id, 'use')
    and public.is_member(campaign_id)
  );

-- 8) RPCs ---------------------------------------------------------------------
drop function if exists public.shared_publish(uuid, jsonb, text, text);
create or replace function public.shared_publish(
  p_resource uuid,
  p_content jsonb,
  p_changelog text default null,
  p_status text default 'published'
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next int;
  v_owner uuid;
  v_allowed boolean;
begin
  if p_status not in ('draft','published','archived') then
    raise exception 'invalid status %', p_status;
  end if;

  select current_version, owner_id
  into v_next, v_owner
  from public.shared_resources
  where id = p_resource
  for update;

  if not found then
    raise exception 'resource % not found', p_resource;
  end if;

  v_allowed := public.has_shared_permission(p_resource, 'admin');
  if not v_allowed then
    raise exception 'insufficient permissions to publish resource %', p_resource;
  end if;

  v_next := coalesce(v_next, 0) + 1;

  insert into public.shared_versions(resource_id, version, content, changelog)
  values (p_resource, v_next, p_content, p_changelog);

  update public.shared_resources
  set current_version = v_next,
      status = p_status,
      updated_at = now()
  where id = p_resource;

  return v_next;
end;
$$;

drop function if exists public.shared_fork(uuid, text, text);
create or replace function public.shared_fork(
  p_source uuid,
  p_name text,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_scope text;
  v_campaign uuid;
  v_latest jsonb;
  v_new uuid;
begin
  select r.kind, r.scope, r.campaign_id, v.content
  into v_kind, v_scope, v_campaign, v_latest
  from public.shared_resources r
  join public.shared_versions v
    on v.resource_id = r.id
   and v.version = r.current_version
  where r.id = p_source;

  if not found then
    raise exception 'source resource % not found', p_source;
  end if;

  if not public.can_view_resource(p_source) then
    raise exception 'insufficient permissions to fork resource %', p_source;
  end if;

  insert into public.shared_resources(owner_id, scope, campaign_id, kind, name, description, status)
  values (auth.uid(), v_scope, v_campaign, v_kind, p_name, p_description, 'draft')
  returning id into v_new;

  perform public.shared_publish(v_new, v_latest, 'forked from ' || p_source, 'draft');

  return v_new;
end;
$$;

drop function if exists public.shared_adopt(uuid, uuid, text);
create or replace function public.shared_adopt(
  p_resource uuid,
  p_campaign uuid,
  p_mode text default 'clone'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_version int;
  v_payload jsonb;
  v_summary jsonb := jsonb_build_object('mode', p_mode);
  v_adoption uuid;
  v_rows int;
  v_resource_name text;
  v_first_example jsonb;
begin
  if p_mode not in ('clone','inherit') then
    raise exception 'invalid adoption mode %', p_mode;
  end if;

  if not public.has_shared_permission(p_resource, 'use') then
    raise exception 'insufficient permissions to adopt resource %', p_resource;
  end if;

  if not public.is_member(p_campaign) then
    raise exception 'user is not a member of campaign %', p_campaign;
  end if;

  select current_version, kind, name
  into v_version, v_kind, v_resource_name
  from public.shared_resources
  where id = p_resource;

  if not found then
    raise exception 'resource % not found', p_resource;
  end if;

  select content
  into v_payload
  from public.shared_versions
  where resource_id = p_resource
    and version = v_version;

  if v_payload is null then
    raise exception 'resource % missing content for version %', p_resource, v_version;
  end if;

  v_summary := v_summary || jsonb_build_object('resource_version', v_version, 'kind', v_kind);

  if v_kind = 'nudge_preset' and p_mode = 'clone' then
    if to_regclass('public.nudge_variants') is not null then
      insert into public.nudge_variants(
        campaign_id, scenario, tone, name, subject, body, weight, is_active
      )
      select
        p_campaign,
        coalesce(v_payload->>'scenario', 'neutral'),
        coalesce(v_elem->>'tone', 'neutral'),
        v_elem->>'name',
        v_elem->>'subject',
        v_elem->>'body',
        coalesce((v_elem->>'weight')::real, 1.0),
        coalesce((v_elem->>'is_active')::boolean, true)
      from jsonb_array_elements(coalesce(v_payload->'variants', '[]'::jsonb)) as v_elem
      on conflict (campaign_id, scenario, tone, name) do nothing;

      get diagnostics v_rows = row_count;
      v_summary := v_summary || jsonb_build_object('variants_added', v_rows);
    end if;
  elsif v_kind = 'saved_view' then
    if p_mode = 'clone' and to_regclass('public.saved_views') is not null then
      insert into public.saved_views (campaign_id, area, name, filters, columns, sort)
      values (
        p_campaign,
        v_payload->>'area',
        v_resource_name,
        coalesce(v_payload->'filters', '{}'::jsonb),
        coalesce(v_payload->'columns', '[]'::jsonb),
        coalesce(v_payload->'sort', '{}'::jsonb)
      )
      on conflict do nothing;

      get diagnostics v_rows = row_count;
      v_summary := v_summary || jsonb_build_object('views_added', v_rows);
    end if;
  elsif v_kind = 'preflight_preset' then
    if p_mode = 'clone' and to_regclass('public.preflight_defaults') is not null then
      insert into public.preflight_defaults(campaign_id, fail, warn)
      values (
        p_campaign,
        coalesce(v_payload->'fail', '{}'::jsonb),
        coalesce(v_payload->'warn', '{}'::jsonb)
      )
      on conflict (campaign_id) do update
        set fail = excluded.fail,
            warn = excluded.warn;
      v_summary := v_summary || jsonb_build_object('preflight_updated', true);
    end if;
  elsif v_kind = 'rewrite_preset' then
    if p_mode = 'clone' and to_regclass('public.rewrite_presets') is not null then
      v_first_example := '{}'::jsonb;
      if jsonb_typeof(v_payload->'examples') = 'array' then
        v_first_example := coalesce((v_payload->'examples')->0, '{}'::jsonb);
      end if;

      insert into public.rewrite_presets(
        campaign_id,
        scenario,
        tone,
        name,
        weight,
        base_subject,
        base_body,
        guidelines,
        is_active,
        config
      )
      values (
        p_campaign,
        coalesce(v_payload->>'scenario', 'shared'),
        coalesce(v_payload->'style'->>'tone', 'concise'),
        v_resource_name,
        1.0,
        coalesce(v_payload->'style'->>'subject', v_first_example->>'subject', 'Shared preset'),
        coalesce(v_first_example->>'output', v_first_example->>'body', ''),
        v_payload->'style'->>'notes',
        true,
        v_payload
      )
      on conflict (campaign_id, scenario, tone, name)
      do update set
        base_subject = excluded.base_subject,
        base_body = excluded.base_body,
        config = excluded.config,
        guidelines = excluded.guidelines,
        is_active = excluded.is_active;

      get diagnostics v_rows = row_count;
      v_summary := v_summary || jsonb_build_object('rewrite_upserted', v_rows);
    end if;
  end if;

  insert into public.shared_adoptions(resource_id, resource_version, campaign_id, mode, applied_to)
  values (p_resource, v_version, p_campaign, p_mode, v_summary)
  on conflict (resource_id, campaign_id, mode) do update
    set resource_version = excluded.resource_version,
        applied_to = excluded.applied_to
  returning id into v_adoption;

  return v_adoption;
end;
$$;



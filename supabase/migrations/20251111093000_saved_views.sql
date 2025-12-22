-- Saved views & enrichment filters

-- A) Latest enrichment per lead -------------------------------------------------
create or replace view public.lead_enrichment_latest as
select distinct on (e.lead_id)
  e.lead_id,
  e.company_name,
  e.company_domain,
  e.company_employee_count,
  e.industry as company_industry,
  coalesce(
    e.extras->>'company_category',
    e.extras->>'category',
    null
  ) as company_category,
  to_jsonb(coalesce(e.tech_tags, '{}'::text[])) as tech_stack,
  e.title as role_title,
  e.seniority as role_seniority,
  jsonb_build_object(
    'vendor', e.vendor,
    'vendor_confidence', e.vendor_confidence,
    'extras', e.extras,
    'tech_stack', to_jsonb(coalesce(e.tech_tags, '{}'::text[])),
    'tech_tags', to_jsonb(coalesce(e.tech_tags, '{}'::text[])),
    'social_tags', to_jsonb(coalesce(e.social_tags, '{}'::text[]))
  ) as raw_enrichment,
  coalesce(e.updated_at, e.created_at) as enriched_at
from public.lead_enrichments e
order by e.lead_id, coalesce(e.updated_at, e.created_at) desc nulls last;


-- B) Saved views table ----------------------------------------------------------
create table if not exists public.saved_views (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete cascade,
  scope text not null default 'account' check (scope in ('account', 'campaign')),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  name text not null,
  description text,
  filters jsonb not null,
  visibility text not null default 'private' check (visibility in ('private','team','system')),
  is_system boolean not null default false,
  unique (owner_id, scope, coalesce(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid), name)
);

create index if not exists idx_saved_views_owner_scope
  on public.saved_views (owner_id, scope, is_system);

drop trigger if exists trg_saved_views_set_updated_at on public.saved_views;
create trigger trg_saved_views_set_updated_at
before update on public.saved_views
for each row
execute function public.set_updated_at();

alter table public.saved_views enable row level security;

alter table public.saved_views
  add column if not exists account_id uuid references public.accounts(id) on delete cascade,
  add column if not exists visibility text not null default 'private'
    check (visibility in ('private','team','system'));

with first_membership as (
  select distinct on (user_id)
    user_id,
    account_id
  from public.team_members
  order by user_id, created_at asc
)
update public.saved_views sv
set account_id = fm.account_id
from first_membership fm
where sv.account_id is null
  and fm.user_id = sv.owner_id;

update public.saved_views sv
set account_id = c.account_id
from public.campaigns c
where sv.scope = 'campaign'
  and sv.campaign_id = c.id
  and (sv.account_id is distinct from c.account_id or sv.account_id is null);

update public.saved_views
set visibility = 'system'
where visibility <> 'system'
  and is_system = true;

create or replace function public.account_role(
  p_account_id uuid,
  p_user uuid default auth.uid()
)
returns text
language sql
stable
as $$
  select coalesce((
    select tm.role::text
    from public.team_members tm
    where tm.account_id = p_account_id
      and tm.user_id = coalesce(p_user, auth.uid())
    order by tm.created_at asc
    limit 1
  ), 'viewer');
$$;

create or replace function public.saved_views_set_defaults()
returns trigger
language plpgsql
as $$
begin
  if new.owner_id is null then
    new.owner_id := auth.uid();
  end if;

  if new.account_id is null then
    select tm.account_id
    into new.account_id
    from public.team_members tm
    where tm.user_id = new.owner_id
    order by tm.created_at asc
    limit 1;
  end if;

  if new.visibility is null then
    new.visibility := 'private';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_saved_views_defaults on public.saved_views;
create trigger trg_saved_views_defaults
before insert on public.saved_views
for each row execute function public.saved_views_set_defaults();

drop policy if exists saved_views_select_owned_or_system on public.saved_views;
drop policy if exists saved_views_modify_owned on public.saved_views;
drop policy if exists saved_views_manage_service_role on public.saved_views;
drop policy if exists sv_select on public.saved_views;
drop policy if exists sv_insert on public.saved_views;
drop policy if exists sv_update on public.saved_views;
drop policy if exists sv_delete on public.saved_views;
drop policy if exists sv_service_role on public.saved_views;

create policy sv_select on public.saved_views
for select using (
  (
    case
      when visibility = 'private' then owner_id = auth.uid()
      when visibility in ('team','system') then public.is_account_member(auth.uid(), account_id)
      else false
    end
  )
  and (
    scope = 'account'
    or (
      scope = 'campaign'
      and exists (
        select 1
        from public.campaigns c
        where c.id = saved_views.campaign_id
          and c.account_id = saved_views.account_id
          and public.is_account_member(auth.uid(), c.account_id)
      )
    )
  )
);

create policy sv_insert on public.saved_views
for insert with check (
  account_id is not null
  and public.is_account_member(auth.uid(), account_id)
  and owner_id = auth.uid()
  and (
    scope = 'account'
    or (
      scope = 'campaign'
      and exists (
        select 1
        from public.campaigns c
        where c.id = saved_views.campaign_id
          and c.account_id = saved_views.account_id
      )
    )
  )
);

create policy sv_update on public.saved_views
for update
using (
  public.is_account_member(auth.uid(), account_id)
)
with check (
  public.is_account_member(auth.uid(), account_id)
  and (
    (visibility <> 'system' and (owner_id = auth.uid() or public.account_role(account_id) in ('owner','admin')))
    or (visibility = 'system' and public.account_role(account_id) in ('owner','admin'))
  )
);

create policy sv_delete on public.saved_views
for delete using (
  public.is_account_member(auth.uid(), account_id)
  and (
    (visibility <> 'system' and (owner_id = auth.uid() or public.account_role(account_id) in ('owner','admin')))
    or (visibility = 'system' and public.account_role(account_id) in ('owner','admin'))
  )
);

create policy sv_service_role on public.saved_views
for all using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');


-- C) Helpful indexes ------------------------------------------------------------
create index if not exists idx_lead_enrichments_company_industry
  on public.lead_enrichments (industry);

create index if not exists idx_lead_enrichments_company_category
  on public.lead_enrichments ((coalesce(extras->>'company_category', extras->>'category')));

create index if not exists idx_lead_enrichments_company_employee_count
  on public.lead_enrichments (company_employee_count);

create index if not exists idx_lead_enrichments_tech_stack_gin
  on public.lead_enrichments
  using gin ((to_jsonb(coalesce(tech_tags, '{}'::text[]))) jsonb_path_ops);

create index if not exists idx_saved_views_filters_gin
  on public.saved_views
  using gin (filters jsonb_path_ops);

create index if not exists idx_sv_account on public.saved_views(account_id);
create index if not exists idx_sv_owner on public.saved_views(owner_id);
create index if not exists idx_sv_scope on public.saved_views(scope, campaign_id);
create index if not exists idx_sv_visibility on public.saved_views(visibility);


insert into public.saved_views (
  account_id,
  owner_id,
  scope,
  name,
  description,
  filters,
  visibility,
  is_system
)
select
  tm.account_id,
  tm.user_id,
  'account',
  'ICP Fit (SaaS + HubSpot 50+)',
  'Shared ICP view for the team',
  '{
    "op":"AND",
    "nodes":[
      {"field":"company_category","op":"eq","value":"SaaS"},
      {"field":"tech_stack","op":"contains_any","value":["HubSpot"]},
      {"field":"company_employee_count","op":"gt","value":50}
    ]
  }'::jsonb,
  'system',
  true
from public.team_members tm
where tm.role in ('owner','admin')
on conflict do nothing;


-- E) RPC to apply saved view ----------------------------------------------------
create or replace function public.apply_saved_view(
  p_saved_view_id uuid,
  p_limit int default 100,
  p_offset int default 0
)
returns table (
  lead_id uuid,
  email text,
  first_name text,
  last_name text,
  company_name text,
  company_domain text,
  company_employee_count int,
  company_industry text,
  company_category text,
  tech_stack jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_filters jsonb;
begin
  select filters
  into v_filters
  from public.saved_views
  where id = p_saved_view_id;

  if v_filters is null then
    raise exception 'saved_view_not_found';
  end if;

  return query
    with le as (
      select
        l.id as lead_id,
        l.email,
        l.first_name,
        l.last_name,
        e.company_name,
        e.company_domain,
        e.company_employee_count,
        e.company_industry,
        e.company_category,
        coalesce(e.raw_enrichment->'tech_stack', e.tech_stack) as tech_stack
      from public.leads l
      join public.lead_enrichment_latest e on e.lead_id = l.id
    ),
    filtered as (
      select *
      from le
      where
        (
          (v_filters #>> '{nodes,0,field}' = 'company_category')
          is not false
          and (v_filters #>> '{nodes,0,value}') is not null
          and company_category = (v_filters #>> '{nodes,0,value}')
        )
        and (
          (v_filters #>> '{nodes,1,field}' = 'tech_stack')
          is not false
          and exists (
            select 1
            from jsonb_array_elements_text(coalesce(tech_stack, '[]'::jsonb)) as t(val)
            where lower(val) = lower((v_filters #>> '{nodes,1,value,0}'))
          )
        )
        and (
          (v_filters #>> '{nodes,2,field}' = 'company_employee_count')
          is not false
          and company_employee_count > ((v_filters #>> '{nodes,2,value}')::int)
        )
    )
  select *
  from filtered
  order by company_employee_count desc nulls last
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
end;
$$;

grant execute on function public.apply_saved_view(uuid, int, int) to authenticated;


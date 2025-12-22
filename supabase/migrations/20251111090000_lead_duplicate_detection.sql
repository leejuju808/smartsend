-- Lead duplicate detection and merge workflow

-- 1) Required extensions -------------------------------------------------------

create extension if not exists pg_trgm;
create extension if not exists fuzzystrmatch;


-- 2) Normalized lead columns ---------------------------------------------------

alter table public.leads
  add column if not exists email_norm text generated always as (
    nullif(lower(regexp_replace(coalesce(email, ''), '\s+', '', 'g')), '')
  ) stored,
  add column if not exists domain_norm text generated always as (
    case
      when coalesce(email, '') like '%@%' then
        nullif(lower(split_part(email, '@', 2)), '')
      else null
    end
  ) stored,
  add column if not exists name_norm text generated always as (
    nullif(
      lower(
        regexp_replace(
          regexp_replace(
            trim(
              coalesce(first_name, '') || ' ' || coalesce(last_name, '')
            ),
            '\s+',
            ' ',
            'g'
          ),
          '[^a-z0-9 ]',
          '',
          'g'
        )
      ),
      ''
    )
  ) stored,
  add column if not exists company_norm text generated always as (
    nullif(
      lower(
        regexp_replace(
          coalesce(company, ''),
          '[^a-z0-9 ]',
          '',
          'g'
        )
      ),
      ''
    )
  ) stored;

create index if not exists idx_leads_email_norm on public.leads (email_norm);
create index if not exists idx_leads_domain_norm on public.leads (domain_norm);
create index if not exists idx_leads_name_trgm on public.leads using gin (name_norm gin_trgm_ops);
create index if not exists idx_leads_company_trgm on public.leads using gin (company_norm gin_trgm_ops);


-- 3) Candidate pair store ------------------------------------------------------

create table if not exists public.lead_dupe_candidates (
  id bigserial primary key,
  lead_a uuid not null references public.leads(id) on delete cascade,
  lead_b uuid not null references public.leads(id) on delete cascade,
  reason text not null,
  name_sim real not null default 0,
  company_sim real not null default 0,
  email_exact boolean not null default false,
  created_at timestamptz not null default now(),
  unique (lead_a, lead_b)
);

create index if not exists idx_lead_dupe_candidates_pair on public.lead_dupe_candidates (lead_a, lead_b);
create index if not exists idx_lead_dupe_candidates_reason on public.lead_dupe_candidates (reason);


-- 4) Candidate refresh builder -------------------------------------------------

create or replace function public.refresh_lead_dupe_candidates(
  p_name_thresh real default 0.82,
  p_company_thresh real default 0.78,
  p_domain_bucket_size int default 500
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int := 0;
  v_rows int := 0;
begin
  delete from public.lead_dupe_candidates;

  -- Deterministic: exact normalized email
  insert into public.lead_dupe_candidates (lead_a, lead_b, reason, name_sim, company_sim, email_exact)
  select least(l1.id, l2.id),
         greatest(l1.id, l2.id),
         'email',
         1.0,
         1.0,
         true
  from public.leads l1
  join public.leads l2
    on l1.id < l2.id
   and l1.email_norm is not null
   and l1.email_norm = l2.email_norm
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  -- Deterministic: same domain + same last name token
  insert into public.lead_dupe_candidates (lead_a, lead_b, reason, name_sim, company_sim)
  select least(l1.id, l2.id),
         greatest(l1.id, l2.id),
         'domain_lastname',
         similarity(coalesce(l1.name_norm, ''), coalesce(l2.name_norm, '')),
         similarity(coalesce(l1.company_norm, ''), coalesce(l2.company_norm, ''))
  from public.leads l1
  join public.leads l2
    on l1.id < l2.id
   and l1.domain_norm is not null
   and l1.domain_norm = l2.domain_norm
   and nullif(split_part(coalesce(l1.last_name, ''), ' ', 1), '') is not null
   and split_part(coalesce(l1.last_name, ''), ' ', 1) = split_part(coalesce(l2.last_name, ''), ' ', 1)
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  -- Fuzzy: same domain bucket, trigram similarity on name + company
  insert into public.lead_dupe_candidates (lead_a, lead_b, reason, name_sim, company_sim)
  select least(l1.id, l2.id),
         greatest(l1.id, l2.id),
         'fuzzy_name_company',
         similarity(coalesce(l1.name_norm, ''), coalesce(l2.name_norm, '')) as name_sim,
         similarity(coalesce(l1.company_norm, ''), coalesce(l2.company_norm, '')) as company_sim
  from public.leads l1
  join public.leads l2
    on l1.id < l2.id
   and l1.domain_norm is not null
   and l1.domain_norm = l2.domain_norm
   and similarity(coalesce(l1.name_norm, ''), coalesce(l2.name_norm, '')) >= p_name_thresh
   and similarity(coalesce(l1.company_norm, ''), coalesce(l2.company_norm, '')) >= p_company_thresh
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  return v_total;
end;
$$;

grant execute on function public.refresh_lead_dupe_candidates(real, real, int) to authenticated;


-- 5) Merge audit + helpers -----------------------------------------------------

create table if not exists public.lead_merge_audit (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor uuid references auth.users(id),
  primary_lead uuid not null references public.leads(id) on delete cascade,
  secondary_lead uuid not null references public.leads(id) on delete cascade,
  strategy text not null check (strategy in ('primary_wins', 'secondary_wins', 'fieldwise')),
  field_map jsonb not null default '{}'::jsonb,
  moved_counts jsonb not null default '{}'::jsonb,
  snapshot jsonb
);

alter table public.leads
  add column if not exists merged_into uuid references public.leads(id) on delete set null;

create index if not exists idx_leads_merged_into on public.leads (merged_into);


create or replace function public.merge_leads(
  p_primary uuid,
  p_secondary uuid,
  p_strategy text default 'primary_wins',
  p_field_map jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r_primary public.leads%rowtype;
  r_secondary public.leads%rowtype;
  moved jsonb := '{}'::jsonb;
  v_actor uuid := auth.uid();
  v_rows int;
begin
  if p_primary = p_secondary then
    raise exception 'Primary and secondary cannot be the same';
  end if;

  select * into r_primary
  from public.leads
  where id = p_primary
  for update;
  if not found then
    raise exception 'Primary lead not found';
  end if;

  select * into r_secondary
  from public.leads
  where id = p_secondary
  for update;
  if not found then
    raise exception 'Secondary lead not found';
  end if;

  -- Repoint foreign keys (extend if additional tables depend on leads)
  with moved_campaigns as (
    update public.campaign_leads cl
       set lead_id = p_primary
     where cl.lead_id = p_secondary
     returning 1
  ), moved_logs as (
    update public.activity_logs al
       set lead_id = p_primary
     where al.lead_id = p_secondary
     returning 1
  ), moved_events as (
    update public.events e
       set lead_id = p_primary
     where e.lead_id = p_secondary
     returning 1
  ), moved_replies as (
    update public.replies r
       set lead_id = p_primary
     where r.lead_id = p_secondary
     returning 1
  )
  select jsonb_build_object(
           'campaign_leads', (select count(*) from moved_campaigns),
           'activity_logs', (select count(*) from moved_logs),
           'events', (select count(*) from moved_events),
           'replies', (select count(*) from moved_replies)
         )
    into moved;

  -- Resolve scalar fields based on strategy
  if p_strategy = 'secondary_wins' then
    update public.leads
       set email = coalesce(r_secondary.email, r_primary.email),
           first_name = coalesce(r_secondary.first_name, r_primary.first_name),
           last_name = coalesce(r_secondary.last_name, r_primary.last_name),
           company = coalesce(r_secondary.company, r_primary.company),
           phone = coalesce(r_secondary.phone, r_primary.phone),
           title = coalesce(r_secondary.title, r_primary.title),
           updated_at = now()
     where id = p_primary;

  elsif p_strategy = 'fieldwise' then
    update public.leads
       set email = case when p_field_map->>'email' = 'secondary' then r_secondary.email else r_primary.email end,
           first_name = case when p_field_map->>'first_name' = 'secondary' then r_secondary.first_name else r_primary.first_name end,
           last_name = case when p_field_map->>'last_name' = 'secondary' then r_secondary.last_name else r_primary.last_name end,
           company = case when p_field_map->>'company' = 'secondary' then r_secondary.company else r_primary.company end,
           phone = case when p_field_map->>'phone' = 'secondary' then r_secondary.phone else r_primary.phone end,
           title = case when p_field_map->>'title' = 'secondary' then r_secondary.title else r_primary.title end,
           updated_at = now()
     where id = p_primary;

  else
    update public.leads
       set updated_at = now()
     where id = p_primary;
  end if;

  -- Close the secondary lead
  update public.leads
     set merged_into = p_primary,
         updated_at = now()
   where id = p_secondary;

  insert into public.lead_merge_audit (
    actor,
    primary_lead,
    secondary_lead,
    strategy,
    field_map,
    moved_counts,
    snapshot
  )
  values (
    v_actor,
    p_primary,
    p_secondary,
    p_strategy,
    coalesce(p_field_map, '{}'::jsonb),
    coalesce(moved, '{}'::jsonb),
    jsonb_build_object(
      'primary', to_jsonb(r_primary),
      'secondary', to_jsonb(r_secondary)
    )
  );

  delete from public.lead_dupe_candidates
   where (lead_a = p_primary and lead_b = p_secondary)
      or (lead_a = p_secondary and lead_b = p_primary);

  return jsonb_build_object(
    'primary', p_primary,
    'secondary', p_secondary,
    'moved', moved
  );
end;
$$;

grant execute on function public.merge_leads(uuid, uuid, text, jsonb) to authenticated;


-- 6) RLS & policies ------------------------------------------------------------

alter table public.lead_dupe_candidates enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'lead_dupe_candidates'
      and policyname = 'lead_dupe_candidates_select'
  ) then
    create policy lead_dupe_candidates_select on public.lead_dupe_candidates
      for select
      using (true);
  end if;
end;
$$;

grant select on public.lead_dupe_candidates to authenticated;



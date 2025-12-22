-- Lead enrichment normalization, trust ranks, and merge helpers

-- A) Canonicalized enrichment snapshot per (lead, source, cache_key)
create table if not exists public.lead_enrichment_norm (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  source text not null,
  cache_key text not null,
  fetched_at timestamptz not null,
  company_name text,
  company_domain text,
  company_employee_count int,
  company_industry text,
  company_category text,
  role_title text,
  role_seniority text,
  tech_stack jsonb not null default '[]'::jsonb,
  trust jsonb not null default '{}'::jsonb,
  unique (lead_id, source, cache_key)
);

create index if not exists idx_lead_enrichment_norm_lead on public.lead_enrichment_norm (lead_id);
create index if not exists idx_lead_enrichment_norm_account on public.lead_enrichment_norm (account_id);
create index if not exists idx_lead_enrichment_norm_fetched on public.lead_enrichment_norm (fetched_at);


-- B) Source trust defaults
create table if not exists public.enrichment_trust (
  source text primary key,
  rank_base int not null default 50,
  rank_stack int not null default 60
);

insert into public.enrichment_trust (source, rank_base, rank_stack)
values
  ('vendor_a', 40, 45),
  ('vendor_b', 50, 55)
on conflict (source) do nothing;


-- C) Lead columns for locks, provenance, and normalized fields
alter table public.leads
  add column if not exists company_name text,
  add column if not exists company_domain text,
  add column if not exists company_employee_count int,
  add column if not exists company_industry text,
  add column if not exists company_category text,
  add column if not exists role_title text,
  add column if not exists role_seniority text,
  add column if not exists tech_stack jsonb not null default '[]'::jsonb,
  add column if not exists user_locked jsonb not null default '{}'::jsonb,
  add column if not exists enriched_from jsonb not null default '{}'::jsonb;


-- D) Normalize a single enrichment payload into canonical row
create or replace function public.normalize_enrichment_row(p_enrichment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  e record;
  v_trust_base int;
  v_trust_stack int;
  v_company_employee_count int;
  v_tech_stack jsonb := '[]'::jsonb;
  v_id uuid;
begin
  select le.*, et.rank_base, et.rank_stack
    into e
  from public.lead_enrichment le
  left join public.enrichment_trust et on et.source = le.source
  where le.id = p_enrichment_id
    and le.status = 'ok';

  if not found then
    raise exception 'Enrichment row not found or not OK: %', p_enrichment_id;
  end if;

  v_trust_base := coalesce(e.rank_base, 60);
  v_trust_stack := coalesce(e.rank_stack, 70);

  if coalesce(nullif(e.data->>'company_employee_count', ''), '') ~ '^[0-9]+$' then
    v_company_employee_count := (e.data->>'company_employee_count')::int;
  else
    v_company_employee_count := null;
  end if;

  if (e.data ? 'tech_stack') and jsonb_typeof(e.data->'tech_stack') = 'array' then
    v_tech_stack := coalesce(e.data->'tech_stack', '[]'::jsonb);
  else
    v_tech_stack := '[]'::jsonb;
  end if;

  insert into public.lead_enrichment_norm (
    lead_id,
    account_id,
    source,
    cache_key,
    fetched_at,
    company_name,
    company_domain,
    company_employee_count,
    company_industry,
    company_category,
    role_title,
    role_seniority,
    tech_stack,
    trust
  )
  values (
    e.lead_id,
    e.account_id,
    e.source,
    e.cache_key,
    e.fetched_at,
    nullif(e.data->>'company_name', ''),
    nullif(e.data->>'company_domain', ''),
    v_company_employee_count,
    nullif(e.data->>'company_industry', ''),
    nullif(e.data->>'company_category', ''),
    nullif(e.data->>'role_title', ''),
    nullif(e.data->>'role_seniority', ''),
    v_tech_stack,
    jsonb_build_object(
      'company_name', v_trust_base,
      'company_domain', v_trust_base,
      'company_employee_count', v_trust_base,
      'company_industry', v_trust_base,
      'company_category', v_trust_base,
      'role_title', v_trust_base,
      'role_seniority', v_trust_base,
      'tech_stack', v_trust_stack
    )
  )
  on conflict (lead_id, source, cache_key)
  do update set
    fetched_at = excluded.fetched_at,
    company_name = excluded.company_name,
    company_domain = excluded.company_domain,
    company_employee_count = excluded.company_employee_count,
    company_industry = excluded.company_industry,
    company_category = excluded.company_category,
    role_title = excluded.role_title,
    role_seniority = excluded.role_seniority,
    tech_stack = excluded.tech_stack,
    trust = excluded.trust
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.normalize_enrichment_row(uuid) to authenticated;
grant execute on function public.normalize_enrichment_row(uuid) to service_role;


-- E) Batch normalizer for rows fetched since timestamp
create or replace function public.normalize_enrichment_since(
  p_since timestamptz default now() - interval '1 day',
  p_limit int default 2000
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n int := 0;
  v_limit int := greatest(coalesce(p_limit, 2000), 0);
begin
  for r in
    select id
    from public.lead_enrichment
    where status = 'ok'
      and (p_since is null or fetched_at >= p_since)
    order by fetched_at asc
    limit v_limit
  loop
    perform public.normalize_enrichment_row(r.id);
    n := n + 1;
  end loop;

  return n;
end;
$$;

grant execute on function public.normalize_enrichment_since(timestamptz, int) to authenticated;
grant execute on function public.normalize_enrichment_since(timestamptz, int) to service_role;


-- F) Merge normalized enrichment into lead fields on a trust-aware basis
create or replace function public.merge_normalized_enrichment(p_lead uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  lead_row record;
  locked jsonb;
  provenance_existing jsonb;
  updates jsonb := '{}'::jsonb;
  provenance jsonb := '{}'::jsonb;
  prev_rank int;
  best_company_name record;
  best_company_domain record;
  best_company_employee_count record;
  best_company_industry record;
  best_company_category record;
  best_role_title record;
  best_role_seniority record;
  best_tech_stack record;
  merged_stack jsonb;
begin
  select *
    into lead_row
  from public.leads
  where id = p_lead
  for update;

  if not found then
    raise exception 'Lead not found: %', p_lead;
  end if;

  locked := coalesce(lead_row.user_locked, '{}'::jsonb);
  provenance_existing := coalesce(lead_row.enriched_from, '{}'::jsonb);

  -- helpers to fetch best candidates per field
  select n.source,
         n.fetched_at,
         coalesce((n.trust->>'company_name')::int, 2147483647) as rank,
         nullif(n.company_name, '') as val
    into best_company_name
  from public.lead_enrichment_norm n
  where n.lead_id = p_lead
    and nullif(n.company_name, '') is not null
  order by coalesce((n.trust->>'company_name')::int, 2147483647), n.fetched_at desc
  limit 1;

  select n.source,
         n.fetched_at,
         coalesce((n.trust->>'company_domain')::int, 2147483647) as rank,
         nullif(n.company_domain, '') as val
    into best_company_domain
  from public.lead_enrichment_norm n
  where n.lead_id = p_lead
    and nullif(n.company_domain, '') is not null
  order by coalesce((n.trust->>'company_domain')::int, 2147483647), n.fetched_at desc
  limit 1;

  select n.source,
         n.fetched_at,
         coalesce((n.trust->>'company_employee_count')::int, 2147483647) as rank,
         n.company_employee_count as val
    into best_company_employee_count
  from public.lead_enrichment_norm n
  where n.lead_id = p_lead
    and n.company_employee_count is not null
  order by coalesce((n.trust->>'company_employee_count')::int, 2147483647), n.fetched_at desc
  limit 1;

  select n.source,
         n.fetched_at,
         coalesce((n.trust->>'company_industry')::int, 2147483647) as rank,
         nullif(n.company_industry, '') as val
    into best_company_industry
  from public.lead_enrichment_norm n
  where n.lead_id = p_lead
    and nullif(n.company_industry, '') is not null
  order by coalesce((n.trust->>'company_industry')::int, 2147483647), n.fetched_at desc
  limit 1;

  select n.source,
         n.fetched_at,
         coalesce((n.trust->>'company_category')::int, 2147483647) as rank,
         nullif(n.company_category, '') as val
    into best_company_category
  from public.lead_enrichment_norm n
  where n.lead_id = p_lead
    and nullif(n.company_category, '') is not null
  order by coalesce((n.trust->>'company_category')::int, 2147483647), n.fetched_at desc
  limit 1;

  select n.source,
         n.fetched_at,
         coalesce((n.trust->>'role_title')::int, 2147483647) as rank,
         nullif(n.role_title, '') as val
    into best_role_title
  from public.lead_enrichment_norm n
  where n.lead_id = p_lead
    and nullif(n.role_title, '') is not null
  order by coalesce((n.trust->>'role_title')::int, 2147483647), n.fetched_at desc
  limit 1;

  select n.source,
         n.fetched_at,
         coalesce((n.trust->>'role_seniority')::int, 2147483647) as rank,
         nullif(n.role_seniority, '') as val
    into best_role_seniority
  from public.lead_enrichment_norm n
  where n.lead_id = p_lead
    and nullif(n.role_seniority, '') is not null
  order by coalesce((n.trust->>'role_seniority')::int, 2147483647), n.fetched_at desc
  limit 1;

  select n.source,
         n.fetched_at,
         coalesce((n.trust->>'tech_stack')::int, 2147483647) as rank,
         n.tech_stack as val
    into best_tech_stack
  from public.lead_enrichment_norm n
  where n.lead_id = p_lead
  order by coalesce((n.trust->>'tech_stack')::int, 2147483647), n.fetched_at desc
  limit 1;

  -- text helpers
  if best_company_name.source is not null
     and best_company_name.val is not null
     and coalesce(locked->>'company_name', 'false') <> 'true'
  then
    prev_rank := null;
    begin
      if provenance_existing ? 'company_name' then
        prev_rank := (provenance_existing->'company_name'->>'rank')::int;
      end if;
    exception when others then
      prev_rank := null;
    end;

    if coalesce(lead_row.company_name, '') = '' then
      updates := jsonb_set(updates, '{company_name}', to_jsonb(best_company_name.val), true);
      provenance := jsonb_set(
        provenance,
        '{company_name}',
        jsonb_build_object('source', best_company_name.source, 'rank', best_company_name.rank, 'at', best_company_name.fetched_at),
        true
      );
    elsif (prev_rank is null or prev_rank > best_company_name.rank)
      and coalesce(lead_row.company_name, '') <> best_company_name.val
    then
      updates := jsonb_set(updates, '{company_name}', to_jsonb(best_company_name.val), true);
      provenance := jsonb_set(
        provenance,
        '{company_name}',
        jsonb_build_object('source', best_company_name.source, 'rank', best_company_name.rank, 'at', best_company_name.fetched_at),
        true
      );
    end if;
  end if;

  if best_company_domain.source is not null
     and best_company_domain.val is not null
     and coalesce(locked->>'company_domain', 'false') <> 'true'
  then
    prev_rank := null;
    begin
      if provenance_existing ? 'company_domain' then
        prev_rank := (provenance_existing->'company_domain'->>'rank')::int;
      end if;
    exception when others then
      prev_rank := null;
    end;

    if coalesce(lead_row.company_domain, '') = '' then
      updates := jsonb_set(updates, '{company_domain}', to_jsonb(best_company_domain.val), true);
      provenance := jsonb_set(
        provenance,
        '{company_domain}',
        jsonb_build_object('source', best_company_domain.source, 'rank', best_company_domain.rank, 'at', best_company_domain.fetched_at),
        true
      );
    elsif (prev_rank is null or prev_rank > best_company_domain.rank)
      and coalesce(lead_row.company_domain, '') <> best_company_domain.val
    then
      updates := jsonb_set(updates, '{company_domain}', to_jsonb(best_company_domain.val), true);
      provenance := jsonb_set(
        provenance,
        '{company_domain}',
        jsonb_build_object('source', best_company_domain.source, 'rank', best_company_domain.rank, 'at', best_company_domain.fetched_at),
        true
      );
    end if;
  end if;

  if best_company_industry.source is not null
     and best_company_industry.val is not null
     and coalesce(locked->>'company_industry', 'false') <> 'true'
  then
    prev_rank := null;
    begin
      if provenance_existing ? 'company_industry' then
        prev_rank := (provenance_existing->'company_industry'->>'rank')::int;
      end if;
    exception when others then
      prev_rank := null;
    end;

    if coalesce(lead_row.company_industry, '') = '' then
      updates := jsonb_set(updates, '{company_industry}', to_jsonb(best_company_industry.val), true);
      provenance := jsonb_set(
        provenance,
        '{company_industry}',
        jsonb_build_object('source', best_company_industry.source, 'rank', best_company_industry.rank, 'at', best_company_industry.fetched_at),
        true
      );
    elsif (prev_rank is null or prev_rank > best_company_industry.rank)
      and coalesce(lead_row.company_industry, '') <> best_company_industry.val
    then
      updates := jsonb_set(updates, '{company_industry}', to_jsonb(best_company_industry.val), true);
      provenance := jsonb_set(
        provenance,
        '{company_industry}',
        jsonb_build_object('source', best_company_industry.source, 'rank', best_company_industry.rank, 'at', best_company_industry.fetched_at),
        true
      );
    end if;
  end if;

  if best_company_category.source is not null
     and best_company_category.val is not null
     and coalesce(locked->>'company_category', 'false') <> 'true'
  then
    prev_rank := null;
    begin
      if provenance_existing ? 'company_category' then
        prev_rank := (provenance_existing->'company_category'->>'rank')::int;
      end if;
    exception when others then
      prev_rank := null;
    end;

    if coalesce(lead_row.company_category, '') = '' then
      updates := jsonb_set(updates, '{company_category}', to_jsonb(best_company_category.val), true);
      provenance := jsonb_set(
        provenance,
        '{company_category}',
        jsonb_build_object('source', best_company_category.source, 'rank', best_company_category.rank, 'at', best_company_category.fetched_at),
        true
      );
    elsif (prev_rank is null or prev_rank > best_company_category.rank)
      and coalesce(lead_row.company_category, '') <> best_company_category.val
    then
      updates := jsonb_set(updates, '{company_category}', to_jsonb(best_company_category.val), true);
      provenance := jsonb_set(
        provenance,
        '{company_category}',
        jsonb_build_object('source', best_company_category.source, 'rank', best_company_category.rank, 'at', best_company_category.fetched_at),
        true
      );
    end if;
  end if;

  if best_role_title.source is not null
     and best_role_title.val is not null
     and coalesce(locked->>'role_title', 'false') <> 'true'
  then
    prev_rank := null;
    begin
      if provenance_existing ? 'role_title' then
        prev_rank := (provenance_existing->'role_title'->>'rank')::int;
      end if;
    exception when others then
      prev_rank := null;
    end;

    if coalesce(lead_row.role_title, '') = '' then
      updates := jsonb_set(updates, '{role_title}', to_jsonb(best_role_title.val), true);
      provenance := jsonb_set(
        provenance,
        '{role_title}',
        jsonb_build_object('source', best_role_title.source, 'rank', best_role_title.rank, 'at', best_role_title.fetched_at),
        true
      );
    elsif (prev_rank is null or prev_rank > best_role_title.rank)
      and coalesce(lead_row.role_title, '') <> best_role_title.val
    then
      updates := jsonb_set(updates, '{role_title}', to_jsonb(best_role_title.val), true);
      provenance := jsonb_set(
        provenance,
        '{role_title}',
        jsonb_build_object('source', best_role_title.source, 'rank', best_role_title.rank, 'at', best_role_title.fetched_at),
        true
      );
    end if;
  end if;

  if best_role_seniority.source is not null
     and best_role_seniority.val is not null
     and coalesce(locked->>'role_seniority', 'false') <> 'true'
  then
    prev_rank := null;
    begin
      if provenance_existing ? 'role_seniority' then
        prev_rank := (provenance_existing->'role_seniority'->>'rank')::int;
      end if;
    exception when others then
      prev_rank := null;
    end;

    if coalesce(lead_row.role_seniority, '') = '' then
      updates := jsonb_set(updates, '{role_seniority}', to_jsonb(best_role_seniority.val), true);
      provenance := jsonb_set(
        provenance,
        '{role_seniority}',
        jsonb_build_object('source', best_role_seniority.source, 'rank', best_role_seniority.rank, 'at', best_role_seniority.fetched_at),
        true
      );
    elsif (prev_rank is null or prev_rank > best_role_seniority.rank)
      and coalesce(lead_row.role_seniority, '') <> best_role_seniority.val
    then
      updates := jsonb_set(updates, '{role_seniority}', to_jsonb(best_role_seniority.val), true);
      provenance := jsonb_set(
        provenance,
        '{role_seniority}',
        jsonb_build_object('source', best_role_seniority.source, 'rank', best_role_seniority.rank, 'at', best_role_seniority.fetched_at),
        true
      );
    end if;
  end if;

  if best_company_employee_count.source is not null
     and best_company_employee_count.val is not null
     and coalesce(locked->>'company_employee_count', 'false') <> 'true'
  then
    prev_rank := null;
    begin
      if provenance_existing ? 'company_employee_count' then
        prev_rank := (provenance_existing->'company_employee_count'->>'rank')::int;
      end if;
    exception when others then
      prev_rank := null;
    end;

    if lead_row.company_employee_count is null then
      updates := jsonb_set(
        updates,
        '{company_employee_count}',
        to_jsonb(best_company_employee_count.val),
        true
      );
      provenance := jsonb_set(
        provenance,
        '{company_employee_count}',
        jsonb_build_object('source', best_company_employee_count.source, 'rank', best_company_employee_count.rank, 'at', best_company_employee_count.fetched_at),
        true
      );
    elsif (prev_rank is null or prev_rank > best_company_employee_count.rank)
      and lead_row.company_employee_count <> best_company_employee_count.val
    then
      updates := jsonb_set(
        updates,
        '{company_employee_count}',
        to_jsonb(best_company_employee_count.val),
        true
      );
      provenance := jsonb_set(
        provenance,
        '{company_employee_count}',
        jsonb_build_object('source', best_company_employee_count.source, 'rank', best_company_employee_count.rank, 'at', best_company_employee_count.fetched_at),
        true
      );
    end if;
  end if;

  if best_tech_stack.source is not null
     and coalesce(locked->>'tech_stack', 'false') <> 'true'
  then
    select coalesce(
             jsonb_agg(value order by lower(value)),
             '[]'::jsonb
           )
      into merged_stack
    from (
      select distinct trim(value) as value
      from (
        select jsonb_array_elements_text(coalesce(lead_row.tech_stack, '[]'::jsonb)) as value
        union all
        select jsonb_array_elements_text(coalesce(best_tech_stack.val, '[]'::jsonb)) as value
      ) unioned
      where trim(value) is not null and trim(value) <> ''
    ) dedup;

    if merged_stack is null then
      merged_stack := '[]'::jsonb;
    end if;

    if merged_stack <> coalesce(lead_row.tech_stack, '[]'::jsonb) then
      updates := jsonb_set(updates, '{tech_stack}', merged_stack, true);
      provenance := jsonb_set(
        provenance,
        '{tech_stack}',
        jsonb_build_object('source', best_tech_stack.source, 'rank', best_tech_stack.rank, 'at', best_tech_stack.fetched_at),
        true
      );
    end if;
  end if;

  if updates <> '{}'::jsonb then
    provenance_existing := provenance_existing || provenance;

    update public.leads
       set company_name = case when updates ? 'company_name' then updates->>'company_name' else lead_row.company_name end,
           company_domain = case when updates ? 'company_domain' then updates->>'company_domain' else lead_row.company_domain end,
           company_industry = case when updates ? 'company_industry' then updates->>'company_industry' else lead_row.company_industry end,
           company_category = case when updates ? 'company_category' then updates->>'company_category' else lead_row.company_category end,
           role_title = case when updates ? 'role_title' then updates->>'role_title' else lead_row.role_title end,
           role_seniority = case when updates ? 'role_seniority' then updates->>'role_seniority' else lead_row.role_seniority end,
           company_employee_count = case when updates ? 'company_employee_count' then (updates->>'company_employee_count')::int else lead_row.company_employee_count end,
           tech_stack = case when updates ? 'tech_stack' then updates->'tech_stack' else coalesce(lead_row.tech_stack, '[]'::jsonb) end,
           enriched_from = provenance_existing,
           updated_at = now()
     where id = p_lead;
  end if;

  return jsonb_build_object('updated', updates, 'provenance', provenance);
end;
$$;

grant execute on function public.merge_normalized_enrichment(uuid) to authenticated;
grant execute on function public.merge_normalized_enrichment(uuid) to service_role;


-- G) Batch merge helper for nightly jobs
create or replace function public.merge_enrichment_batch(p_limit int default 1000)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n int := 0;
  v_limit int := greatest(coalesce(p_limit, 1000), 0);
begin
  if v_limit = 0 then
    return 0;
  end if;

  for r in
    select lead_id
    from (
      select lead_id, max(fetched_at) as last_fetch
      from public.lead_enrichment_norm
      group by lead_id
      order by max(fetched_at) desc
      limit v_limit
    ) ranked
  loop
    perform public.merge_normalized_enrichment(r.lead_id);
    n := n + 1;
  end loop;

  return n;
end;
$$;

grant execute on function public.merge_enrichment_batch(int) to authenticated;
grant execute on function public.merge_enrichment_batch(int) to service_role;



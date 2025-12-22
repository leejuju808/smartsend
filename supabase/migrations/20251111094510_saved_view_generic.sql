-- Saved view evaluator helpers, generic RPC, and enrichment view reuse

-- A) jsonb helper utilities ----------------------------------------------------
create or replace function public.jsonb_to_text_array(j jsonb)
returns text[]
language sql
immutable
as $$
  select case
    when j is null or jsonb_typeof(j) = 'null' then array[]::text[]
    when jsonb_typeof(j) = 'array' then (
      select coalesce(array_agg(elem), array[]::text[])
      from jsonb_array_elements_text(j) as elem
    )
    when jsonb_typeof(j) in ('string', 'number', 'boolean') then (
      select array_agg(elem)
      from jsonb_array_elements_text(jsonb_build_array(j)) as elem
    )
    else array[]::text[]
  end;
$$;

create or replace function public.jsonb_text_contains_any(arr jsonb, needle text[])
returns boolean
language sql
immutable
as $$
  with lhs as (
    select public.jsonb_to_text_array(arr) as vals
  ),
  rhs as (
    select coalesce(needle, array[]::text[]) as vals
  )
  select exists (
    select 1
    from unnest((select vals from lhs)) as h(val)
    where h.val = any((select vals from rhs))
  );
$$;

create or replace function public.jsonb_text_contains_all(arr jsonb, needle text[])
returns boolean
language sql
immutable
as $$
  with rhs as (
    select coalesce(needle, array[]::text[]) as vals
  ),
  rhs_distinct as (
    select coalesce(array_agg(distinct val), array[]::text[]) as vals
    from unnest((select vals from rhs)) as val
  ),
  lhs as (
    select distinct val
    from unnest(public.jsonb_to_text_array(arr)) as val
  )
  select case
    when coalesce(cardinality((select vals from rhs_distinct)), 0) = 0 then true
    else coalesce((
      select count(*)
      from lhs
      where val = any((select vals from rhs_distinct))
    ), 0) = coalesce(cardinality((select vals from rhs_distinct)), 0)
  end;
$$;


-- B) Predicate helpers ---------------------------------------------------------
create or replace function public.eval_text_predicate(lhs text, op text, rhs jsonb)
returns boolean
language sql
immutable
as $$
  with vals as (
    select public.jsonb_to_text_array(rhs) as arr
  ),
  first_val as (
    select arr[1] as val
    from vals
  )
  select case
    when op = 'eq' then lhs is not distinct from (select val from first_val)
    when op = 'neq' then lhs is distinct from (select val from first_val)
    when op = 'like' then
      (select val from first_val) is not null
      and coalesce(lhs, '') like (select val from first_val)
    when op = 'ilike' then
      (select val from first_val) is not null
      and coalesce(lhs, '') ilike (select val from first_val)
    when op = 'in' then
      case
        when coalesce(cardinality((select arr from vals)), 0) = 0 then false
        else lhs = any(coalesce((select arr from vals), array[]::text[]))
      end
    when op = 'not_in' then
      case
        when coalesce(cardinality((select arr from vals)), 0) = 0 then true
        else not (lhs = any(coalesce((select arr from vals), array[]::text[])))
      end
    else true
  end;
$$;

create or replace function public.eval_num_predicate(lhs numeric, op text, rhs jsonb)
returns boolean
language sql
immutable
as $$
  with vals as (
    select public.jsonb_to_text_array(rhs) as arr
  ),
  first_val as (
    select case
      when arr[1] is null then null
      when btrim(arr[1]) ~ '^[+-]?\d+(\.\d+)?$' then btrim(arr[1])::numeric
      else null
    end as val
    from vals
  ),
  num_arr as (
    select coalesce(array_agg(btrim(val)::numeric), array[]::numeric[]) as arr
    from unnest(coalesce((select arr from vals), array[]::text[])) as val
    where btrim(val) <> ''
      and btrim(val) ~ '^[+-]?\d+(\.\d+)?$'
  )
  select case
    when op = 'eq' then lhs is not distinct from (select val from first_val)
    when op = 'neq' then lhs is distinct from (select val from first_val)
    when op = 'gt' then lhs is not null and (select val from first_val) is not null and lhs > (select val from first_val)
    when op = 'gte' then lhs is not null and (select val from first_val) is not null and lhs >= (select val from first_val)
    when op = 'lt' then lhs is not null and (select val from first_val) is not null and lhs < (select val from first_val)
    when op = 'lte' then lhs is not null and (select val from first_val) is not null and lhs <= (select val from first_val)
    when op = 'in' then
      case
        when coalesce(cardinality((select arr from num_arr)), 0) = 0 then false
        else lhs = any((select arr from num_arr))
      end
    when op = 'not_in' then
      case
        when coalesce(cardinality((select arr from num_arr)), 0) = 0 then true
        else not (lhs = any((select arr from num_arr)))
      end
    else true
  end;
$$;


-- C) Recursive evaluator -------------------------------------------------------
create or replace function public.eval_saved_view_filter(v jsonb, r record)
returns boolean
language plpgsql
immutable
as $$
declare
  v_op text;
  v_nodes jsonb;
  v_field text;
  v_pred_op text;
  v_val jsonb;
  result boolean;
  child boolean;
  i integer;
begin
  if v is null then
    return true;
  end if;

  if jsonb_typeof(v) = 'object' and v ? 'op' and v ? 'nodes' then
    v_op := upper(v->>'op');
    v_nodes := v->'nodes';

    if jsonb_typeof(v_nodes) <> 'array' then
      return true;
    end if;

    if v_op = 'AND' then
      result := true;
      for i in 0 .. coalesce(jsonb_array_length(v_nodes), 0) - 1 loop
        child := public.eval_saved_view_filter(v_nodes->i, r);
        result := result and child;
        exit when not result;
      end loop;
      return result;
    elsif v_op = 'OR' then
      result := false;
      for i in 0 .. coalesce(jsonb_array_length(v_nodes), 0) - 1 loop
        child := public.eval_saved_view_filter(v_nodes->i, r);
        result := result or child;
        exit when result;
      end loop;
      return result;
    else
      return true;
    end if;
  end if;

  -- leaf predicate
  if jsonb_typeof(v) <> 'object' then
    return true;
  end if;

  v_field := v->>'field';
  v_pred_op := lower(v->>'op');
  v_val := v->'value';

  if v_field is null or v_pred_op is null then
    return true;
  end if;

  if v_field = 'company_category' then
    if v_pred_op in ('eq', 'neq', 'like', 'ilike', 'in', 'not_in') then
      return public.eval_text_predicate(r.company_category, v_pred_op, v_val);
    end if;

  elsif v_field = 'company_industry' then
    return public.eval_text_predicate(r.company_industry, v_pred_op, v_val);

  elsif v_field = 'company_domain' then
    return public.eval_text_predicate(r.company_domain, v_pred_op, v_val);

  elsif v_field = 'role_title' then
    return public.eval_text_predicate(r.role_title, v_pred_op, v_val);

  elsif v_field = 'role_seniority' then
    return public.eval_text_predicate(r.role_seniority, v_pred_op, v_val);

  elsif v_field = 'company_employee_count' then
    return public.eval_num_predicate(r.company_employee_count, v_pred_op, v_val);

  elsif v_field = 'tech_stack' then
    if v_pred_op = 'contains_any' then
      return public.jsonb_text_contains_any(r.tech_stack, public.jsonb_to_text_array(v_val));
    elsif v_pred_op = 'contains_all' then
      return public.jsonb_text_contains_all(r.tech_stack, public.jsonb_to_text_array(v_val));
    else
      return public.eval_text_predicate(
        array_to_string(public.jsonb_to_text_array(r.tech_stack), ','),
        v_pred_op,
        v_val
      );
    end if;
  end if;

  return true;
end;
$$;


-- D) Latest enrichment view ----------------------------------------------------
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


-- E) Generic saved view RPC ----------------------------------------------------
create or replace function public.apply_saved_view_generic(
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
  tech_stack jsonb,
  role_title text,
  role_seniority text
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
  with base as (
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
      e.tech_stack,
      e.role_title,
      e.role_seniority
    from public.leads l
    join public.lead_enrichment_latest e on e.lead_id = l.id
  ),
  filtered as (
    select *
    from base b
    where public.eval_saved_view_filter(v_filters, b)
  )
  select *
  from filtered
  order by company_employee_count desc nulls last, company_domain nulls last
  limit greatest(0, coalesce(p_limit, 100))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

grant execute on function public.apply_saved_view_generic(uuid, int, int) to authenticated;


-- F) Legacy wrapper (compatibility) -------------------------------------------
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
begin
  return query
  select
    lead_id,
    email,
    first_name,
    last_name,
    company_name,
    company_domain,
    company_employee_count,
    company_industry,
    company_category,
    tech_stack
  from public.apply_saved_view_generic(p_saved_view_id, p_limit, p_offset);
end;
$$;

grant execute on function public.apply_saved_view(uuid, int, int) to authenticated;



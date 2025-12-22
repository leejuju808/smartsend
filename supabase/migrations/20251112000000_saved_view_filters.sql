-- Saved view filter compiler, registry, and performance instrumentation

create table if not exists public.view_fields (
  key text primary key,
  table_name text not null,
  column_name text not null,
  data_type text not null check (data_type in ('int', 'text', 'jsonb')),
  indexed boolean not null default false
);

insert into public.view_fields (key, table_name, column_name, data_type, indexed)
values
  ('company_employee_count', 'lead_enrichment_latest', 'company_employee_count', 'int', true),
  ('company_category', 'lead_enrichment_latest', 'company_category', 'text', true),
  ('company_industry', 'lead_enrichment_latest', 'company_industry', 'text', true),
  ('tech_stack', 'lead_enrichment_latest', 'tech_stack', 'jsonb', true),
  ('role_title', 'lead_enrichment_latest', 'role_title', 'text', true),
  ('company_domain', 'lead_enrichment_latest', 'company_domain', 'text', true)
on conflict (key) do update
set
  table_name = excluded.table_name,
  column_name = excluded.column_name,
  data_type = excluded.data_type,
  indexed = excluded.indexed;

create index if not exists idx_len_emp on public.lead_enrichment_latest(company_employee_count);
create index if not exists idx_len_category on public.lead_enrichment_latest(company_category);
create index if not exists idx_len_industry on public.lead_enrichment_latest(company_industry);
create index if not exists idx_len_domain on public.lead_enrichment_latest(company_domain);
create index if not exists idx_len_stack_gin on public.lead_enrichment_latest using gin (tech_stack jsonb_path_ops);

create extension if not exists pg_trgm;

create index if not exists idx_len_category_trgm on public.lead_enrichment_latest using gin (company_category gin_trgm_ops);
create index if not exists idx_len_industry_trgm on public.lead_enrichment_latest using gin (company_industry gin_trgm_ops);

create or replace function public._q_ident(t text)
returns text
language sql
immutable
as $$
  select quote_ident(t);
$$;

create or replace function public._q_literal(t text)
returns text
language sql
immutable
as $$
  select case when t is null then 'NULL' else quote_literal(t) end;
$$;

create or replace function public._typed_literal(p_value text, p_type text)
returns text
language plpgsql
immutable
as $$
begin
  if p_value is null then
    return 'NULL';
  end if;

  if p_type = 'int' then
    if p_value !~ '^-?\d+$' then
      raise exception 'Invalid integer literal: %', p_value;
    end if;
    return format('%s::int', public._q_literal(p_value));
  elsif p_type = 'text' then
    return format('%s::text', public._q_literal(p_value));
  elsif p_type = 'jsonb' then
    return format('%s::jsonb', public._q_literal(p_value));
  else
    raise exception 'Unsupported data type: %', p_type;
  end if;
end;
$$;

create or replace function public._typed_array_literal(p_values jsonb, p_type text)
returns text
language plpgsql
immutable
as $$
declare
  elem jsonb;
  elem_text text;
  body text := '';
  idx int := 0;
  cast_type text;
begin
  if p_values is null or jsonb_typeof(p_values) <> 'array' then
    raise exception 'Array value required';
  end if;

  for elem in select * from jsonb_array_elements(p_values) loop
    elem_text := elem #>> '{}';
    if elem_text is null then
      raise exception 'Null array element not allowed';
    end if;

    if p_type = 'int' then
      if elem_text !~ '^-?\d+$' then
        raise exception 'Invalid integer literal: %', elem_text;
      end if;
      cast_type := 'int';
    elsif p_type = 'text' then
      cast_type := 'text';
    else
      cast_type := 'text';
    end if;

    if body <> '' then
      body := body || ',';
    end if;
    body := body || public._q_literal(elem_text);
    idx := idx + 1;
  end loop;

  if idx = 0 then
    if p_type = 'int' then
      return 'array[]::int[]';
    else
      return 'array[]::text[]';
    end if;
  end if;

  if p_type = 'int' then
    return format('array[%s]::int[]', body);
  else
    return format('array[%s]::text[]', body);
  end if;
end;
$$;

create or replace function public._compile_predicate(p_field jsonb, p_op jsonb, p_value jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  f_key text := coalesce(p_field->>0, p_field #>> '{}');
  op text := lower(coalesce(p_op->>0, p_op #>> '{}'));
  vf record;
  col text;
  value_text text;
  value_count int := null;
  arr_literal text;
  clause text;
begin
  if f_key is null or f_key = '' then
    raise exception 'Field is required';
  end if;

  if op is null or op = '' then
    raise exception 'Operator is required for field %', f_key;
  end if;

  select * into vf from public.view_fields where key = f_key;
  if not found then
    raise exception 'Unsupported field: %', f_key;
  end if;

  col := public._q_ident(vf.table_name) || '.' || public._q_ident(vf.column_name);
  value_text := coalesce(p_value->>0, p_value #>> '{}');

  if op in ('eq', 'neq', 'ilike', 'not_ilike', 'gt', 'gte', 'lt', 'lte') then
    if op in ('ilike', 'not_ilike') and vf.data_type <> 'text' then
      raise exception 'Operator % not allowed for data type %', op, vf.data_type;
    end if;

    if op in ('gt', 'gte', 'lt', 'lte') and vf.data_type <> 'int' then
      raise exception 'Operator % not allowed for data type %', op, vf.data_type;
    end if;

    if value_text is null then
      if op = 'eq' then
        clause := format('%s IS NULL', col);
      elsif op = 'neq' then
        clause := format('%s IS NOT NULL', col);
      else
        raise exception 'Null value not allowed for operator %', op;
      end if;
    else
      if op = 'eq' then
        clause := format('%s = %s', col, public._typed_literal(value_text, vf.data_type));
      elsif op = 'neq' then
        clause := format('%s <> %s', col, public._typed_literal(value_text, vf.data_type));
      elsif op = 'ilike' then
        clause := format('%s ILIKE %s', col, public._typed_literal(value_text, 'text'));
      elsif op = 'not_ilike' then
        clause := format('NOT (%s ILIKE %s)', col, public._typed_literal(value_text, 'text'));
      elsif op = 'gt' then
        clause := format('%s > %s', col, public._typed_literal(value_text, vf.data_type));
      elsif op = 'gte' then
        clause := format('%s >= %s', col, public._typed_literal(value_text, vf.data_type));
      elsif op = 'lt' then
        clause := format('%s < %s', col, public._typed_literal(value_text, vf.data_type));
      elsif op = 'lte' then
        clause := format('%s <= %s', col, public._typed_literal(value_text, vf.data_type));
      end if;
    end if;

  elsif op = 'in' then
    if vf.data_type not in ('text', 'int') then
      raise exception 'Operator % not allowed for data type %', op, vf.data_type;
    end if;
    if jsonb_typeof(p_value) <> 'array' then
      raise exception 'Array value required for operator IN';
    end if;
    value_count := jsonb_array_length(p_value);
    if value_count = 0 then
      clause := 'false';
    else
      arr_literal := public._typed_array_literal(p_value, vf.data_type);
      clause := format('%s = ANY(%s)', col, arr_literal);
    end if;

  elsif op in ('contains_any', 'contains_all', 'not_contains') then
    if vf.data_type <> 'jsonb' then
      raise exception 'Operator % not allowed for data type %', op, vf.data_type;
    end if;
    if jsonb_typeof(p_value) <> 'array' then
      raise exception 'Array value required for operator %', op;
    end if;
    value_count := jsonb_array_length(p_value);
    if value_count = 0 then
      if op = 'contains_any' then
        clause := 'false';
      elsif op = 'contains_all' then
        clause := 'true';
      else
        clause := 'true';
      end if;
    else
      arr_literal := public._typed_array_literal(p_value, 'text');
      if op = 'contains_any' then
        clause := format('%s ?| %s', col, arr_literal);
      elsif op = 'contains_all' then
        clause := format('%s ?& %s', col, arr_literal);
      elsif op = 'not_contains' then
        clause := format('NOT (%s ?| %s)', col, arr_literal);
      end if;
    end if;

  else
    raise exception 'Unsupported operator: %', op;
  end if;

  return clause;
end;
$$;

create or replace function public.compile_filters(p_filters jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  j jsonb := coalesce(p_filters, '{}'::jsonb);
  op text := upper(coalesce(j->>'op', 'AND'));
  nodes jsonb := j->'nodes';
  clauses text[] := array[]::text[];
  n jsonb;
  clause text;
begin
  if nodes is null then
    return public._compile_predicate(
      to_jsonb(array[j->>'field']),
      to_jsonb(array[j->>'op']),
      coalesce(j->'value', 'null'::jsonb)
    );
  end if;

  if op not in ('AND', 'OR') then
    raise exception 'Unsupported logical operator: %', op;
  end if;

  for n in select value from jsonb_array_elements(nodes) as value loop
    if n ? 'nodes' then
      clause := public.compile_filters(n);
    else
      clause := public._compile_predicate(
        to_jsonb(array[n->>'field']),
        to_jsonb(array[n->>'op']),
        coalesce(n->'value', 'null'::jsonb)
      );
    end if;

    if clause is not null then
      clauses := array_append(clauses, clause);
    end if;
  end loop;

  if array_length(clauses, 1) is null then
    return 'true';
  end if;

  return '(' || array_to_string(clauses, format(' %s ', op)) || ')';
end;
$$;

create or replace function public.render_saved_view_sql(p_view_id uuid)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v jsonb;
  where_sql text;
  sql text;
begin
  select filters into v from public.saved_views where id = p_view_id;
  if v is null then
    raise exception 'Saved view % not found or has no filters', p_view_id;
  end if;

  where_sql := public.compile_filters(v);

  sql := format($SQL$
    select l.id,
           l.email,
           l.first_name,
           l.last_name,
           e.company_name,
           e.company_domain,
           e.company_employee_count,
           e.company_industry,
           e.company_category,
           e.role_title,
           e.tech_stack
    from public.leads l
    left join public.lead_enrichment_latest e on e.lead_id = l.id
    where l.account_id = current_setting('app.account_id', true)::uuid
      and %s
    order by coalesce(e.company_employee_count, 0) desc,
             l.created_at desc
  $SQL$, where_sql);

  return sql;
end;
$$;

create or replace function public.run_saved_view(p_view_id uuid, p_limit int default 1000)
returns table(
  id uuid,
  email text,
  first_name text,
  last_name text,
  company_name text,
  company_domain text,
  company_employee_count int,
  company_industry text,
  company_category text,
  role_title text,
  tech_stack jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  sql text;
  account_id text := current_setting('app.account_id', true);
begin
  if account_id is null or account_id = '' then
    raise exception 'Account context is not set';
  end if;

  sql := public.render_saved_view_sql(p_view_id) || format(' limit %s', greatest(1, coalesce(p_limit, 1000)));

  return query execute sql;
end;
$$;

create table if not exists public.saved_view_perf (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  view_id uuid not null,
  rows_returned int,
  total_ms numeric,
  plan text
);

create or replace function public.explain_saved_view(p_view_id uuid, p_limit int default 1000)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sql text;
  plan_line text;
  plan text := '';
  rows int := 0;
  t0 timestamptz := clock_timestamp();
  t1 timestamptz;
  account_id text := current_setting('app.account_id', true);
  elapsed_ms numeric;
begin
  if account_id is null or account_id = '' then
    raise exception 'Account context is not set';
  end if;

  sql := public.render_saved_view_sql(p_view_id) || format(' limit %s', greatest(1, coalesce(p_limit, 1000)));

  for plan_line in execute 'EXPLAIN ANALYZE ' || sql loop
    if plan <> '' then
      plan := plan || E'\n';
    end if;
    plan := plan || plan_line;
  end loop;

  execute 'select count(*) from (' || sql || ') t' into rows;
  t1 := clock_timestamp();
  elapsed_ms := extract(milliseconds from (t1 - t0));

  insert into public.saved_view_perf(account_id, view_id, rows_returned, total_ms, plan)
  values ((account_id)::uuid, p_view_id, rows, elapsed_ms, plan);

  return jsonb_build_object('rows', rows, 'ms', elapsed_ms, 'plan', plan);
end;
$$;

grant execute on function public.render_saved_view_sql(uuid) to authenticated, service_role;
grant execute on function public.run_saved_view(uuid, int) to authenticated, service_role;
grant execute on function public.explain_saved_view(uuid, int) to authenticated, service_role;



-- Saved View dynamic filter compiler helpers, evaluator, and compiled RPC

-- Map allowed JSON fields to concrete SQL expressions
create or replace function public._sv_field_sql(f text)
returns text
language sql
immutable
as $$
  select case f
    when 'company_category'       then 'e.company_category'
    when 'company_industry'       then 'e.company_industry'
    when 'company_domain'         then 'e.company_domain'
    when 'company_employee_count' then 'e.company_employee_count'
    when 'tech_stack'             then 'e.tech_stack'
    when 'role_title'             then 'e.role_title'
    when 'role_seniority'         then 'e.role_seniority'
    else null
  end;
$$;


-- Quote literals safely (NULL-aware)
create or replace function public._sv_q(v text)
returns text
language sql
immutable
as $$
  select quote_nullable(v);
$$;


-- Convert a jsonb array of scalars into ARRAY[...]::text[]
create or replace function public._sv_array_text(j jsonb)
returns text
language sql
immutable
as $$
  with elems as (
    select jsonb_array_elements_text(coalesce(j, '[]'::jsonb)) as val
  )
  select case
    when count(*) = 0 then 'ARRAY[]::text[]'
    else 'ARRAY[' || string_agg(public._sv_q(val), ',') || ']::text[]'
  end
  from elems;
$$;


-- Convert a jsonb array of numerics into ARRAY[...]::numeric[]
create or replace function public._sv_array_numeric(j jsonb)
returns text
language sql
immutable
as $$
  with elems as (
    select jsonb_array_elements_text(coalesce(j, '[]'::jsonb)) as val
  )
  select case
    when count(*) = 0 then 'ARRAY[]::numeric[]'
    else 'ARRAY[' || string_agg(public._sv_q(val), ',') || ']::numeric[]'
  end
  from elems;
$$;


-- Compile a single predicate into SQL
create or replace function public._sv_compile_predicate(node jsonb)
returns text
language plpgsql
immutable
as $$
declare
  f_sql text;
  op text := lower(coalesce(node->>'op', 'eq'));
  fld text := node->>'field';
  val jsonb := node->'value';
  lit text;
begin
  f_sql := public._sv_field_sql(fld);

  if f_sql is null then
    return 'TRUE';
  end if;

  if fld = 'company_employee_count' then
    if jsonb_typeof(val) in ('number', 'string') then
      lit := public._sv_q(val #>> '{}');
      return format(
        '%s %s %s::numeric',
        f_sql,
        case op
          when 'eq' then '='
          when 'neq' then '<>'
          when 'gt' then '>'
          when 'gte' then '>='
          when 'lt' then '<'
          when 'lte' then '<='
          else '='
        end,
        lit
      );
    elsif jsonb_typeof(val) = 'array' then
      return format(
        '%s %s any(%s)',
        f_sql,
        case op
          when 'in' then '='
          when 'not_in' then '<>'
          else '='
        end,
        public._sv_array_numeric(val)
      );
    else
      return 'TRUE';
    end if;

  elsif fld = 'tech_stack' then
    if jsonb_typeof(val) = 'array' then
      if op = 'contains_any' then
        return format('%s ?| %s', f_sql, public._sv_array_text(val));
      elsif op = 'contains_all' then
        return format('%s ?& %s', f_sql, public._sv_array_text(val));
      end if;
    end if;

    lit := case
      when jsonb_typeof(val) = 'array' then
        public._sv_q(
          array_to_string(
            (select array_agg(x) from jsonb_array_elements_text(val) t(x)),
            ','
          )
        )
      else
        public._sv_q(val #>> '{}')
    end;

    return format('(%s)::text like %s', f_sql, lit);

  else
    if jsonb_typeof(val) = 'array' then
      return format(
        '%s %s any(%s)',
        f_sql,
        case op
          when 'in' then '='
          when 'not_in' then '<>'
          else '='
        end,
        public._sv_array_text(val)
      );
    else
      lit := public._sv_q(val #>> '{}');

      return coalesce(
        case op
          when 'eq' then format('%s is not distinct from %s', f_sql, lit)
          when 'neq' then format('%s is distinct from %s', f_sql, lit)
          when 'like' then format('%s like %s', f_sql, lit)
          when 'ilike' then format('%s ilike %s', f_sql, lit)
          else format('%s = %s', f_sql, lit)
        end,
        format('%s = %s', f_sql, lit)
      );
    end if;
  end if;
end;
$$;


-- Recursively compile a group (AND/OR) into SQL
create or replace function public._sv_compile_group(v jsonb)
returns text
language plpgsql
immutable
as $$
declare
  v_op text := upper(coalesce(v->>'op', 'AND'));
  v_nodes jsonb := coalesce(v->'nodes', '[]'::jsonb);
  i int;
  n int := jsonb_array_length(v_nodes);
  node jsonb;
  piece text;
  parts text[] := array[]::text[];
begin
  if n = 0 then
    return 'TRUE';
  end if;

  for i in 0..n-1 loop
    node := v_nodes->i;

    if node ? 'op' and node ? 'nodes' then
      piece := public._sv_compile_group(node);
    else
      piece := public._sv_compile_predicate(node);
    end if;

    if piece is null or length(trim(piece)) = 0 then
      continue;
    end if;

    parts := array_append(parts, piece);
  end loop;

  if array_length(parts, 1) is null then
    return 'TRUE';
  end if;

  return '(' || array_to_string(parts, ' ' || v_op || ' ') || ')';
end;
$$;


-- Evaluate predicates directly on a row (for fallback / tests)
create or replace function public._sv_eval_predicate(node jsonb, row_json jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  op text := lower(coalesce(node->>'op', 'eq'));
  fld text := node->>'field';
  val jsonb := node->'value';
  row_text text;
  row_num numeric;
  target_text text;
  target_num numeric;
  text_vals text[];
  num_vals numeric[];
  stack_vals text[];
  current text;
  matches int := 0;
  total int := 0;
begin
  if fld is null then
    return true;
  end if;

  case fld
    when 'company_employee_count' then
      begin
        row_num := (row_json->>fld)::numeric;
      exception when others then
        row_num := null;
      end;

      if jsonb_typeof(val) = 'array' then
        select coalesce(array_agg((elem)::numeric), array[]::numeric[])
        into num_vals
        from jsonb_array_elements_text(coalesce(val, '[]'::jsonb)) as t(elem);

        if op = 'not_in' then
          if row_num is null then
            return true;
          end if;
          return not (row_num = any(num_vals));
        else
          if row_num is null then
            return false;
          end if;
          return row_num = any(num_vals);
        end if;

      elsif jsonb_typeof(val) in ('number', 'string') then
        begin
          target_num := (val #>> '{}')::numeric;
        exception when others then
          return true;
        end;

        case op
          when 'neq' then
            return row_num is distinct from target_num;
          when 'gt' then
            return row_num is not null and target_num is not null and row_num > target_num;
          when 'gte' then
            return row_num is not null and target_num is not null and row_num >= target_num;
          when 'lt' then
            return row_num is not null and target_num is not null and row_num < target_num;
          when 'lte' then
            return row_num is not null and target_num is not null and row_num <= target_num;
          else
            if row_num is null and target_num is null then
              return true;
            end if;
            return row_num is not distinct from target_num;
        end case;
      else
        return true;
      end if;

    when 'tech_stack' then
      select coalesce(array_agg(elem), array[]::text[])
      into stack_vals
      from jsonb_array_elements_text(coalesce(row_json->'tech_stack', '[]'::jsonb)) as t(elem);

      if jsonb_typeof(val) = 'array' then
        select coalesce(array_agg(elem), array[]::text[])
        into text_vals
        from jsonb_array_elements_text(coalesce(val, '[]'::jsonb)) as t(elem);

        if op = 'contains_all' then
          if array_length(text_vals, 1) is null then
            return true;
          end if;

          matches := 0;
          total := coalesce(array_length(text_vals, 1), 0);

          foreach current in array text_vals loop
            if stack_vals @> ARRAY[current] then
              matches := matches + 1;
            end if;
          end loop;

          return matches = total;

        elsif op = 'contains_any' then
          if array_length(text_vals, 1) is null then
            return false;
          end if;

          foreach current in array text_vals loop
            if stack_vals @> ARRAY[current] then
              return true;
            end if;
          end loop;
          return false;
        end if;
      end if;

      target_text := case
        when jsonb_typeof(val) = 'array' then
          array_to_string(
            (select array_agg(x) from jsonb_array_elements_text(val) t(x)),
            ','
          )
        else
          val #>> '{}'
      end;

      if target_text is null then
        return false;
      end if;

      return array_to_string(stack_vals, ',') like target_text;

    else
      row_text := row_json->>fld;

      if jsonb_typeof(val) = 'array' then
        select coalesce(array_agg(elem), array[]::text[])
        into text_vals
        from jsonb_array_elements_text(coalesce(val, '[]'::jsonb)) as t(elem);

        if op = 'not_in' then
          if row_text is null then
            return true;
          end if;
          return not (row_text = any(text_vals));
        else
          if row_text is null then
            return false;
          end if;
          return row_text = any(text_vals);
        end if;
      end if;

      target_text := val #>> '{}';

      case op
        when 'neq' then
          return row_text is distinct from target_text;
        when 'like' then
          return coalesce(row_text, '') like coalesce(target_text, '');
        when 'ilike' then
          return coalesce(row_text, '') ilike coalesce(target_text, '');
        when 'eq' then
          if row_text is null and target_text is null then
            return true;
          end if;
          return row_text is not distinct from target_text;
        else
          return row_text = target_text;
      end case;
  end case;

  return true;
end;
$$;


create or replace function public._sv_eval_group(v jsonb, row_json jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  v_op text := upper(coalesce(v->>'op', 'AND'));
  v_nodes jsonb := coalesce(v->'nodes', '[]'::jsonb);
  n int := jsonb_array_length(v_nodes);
  i int;
  node jsonb;
  result boolean;
  has_true boolean := false;
begin
  if n = 0 then
    return true;
  end if;

  for i in 0..n-1 loop
    node := v_nodes->i;

    if node ? 'op' and node ? 'nodes' then
      result := public._sv_eval_group(node, row_json);
    else
      result := public._sv_eval_predicate(node, row_json);
    end if;

    if v_op = 'AND' then
      if not result then
        return false;
      end if;
    elsif v_op = 'OR' then
      if result then
        has_true := true;
      end if;
    end if;
  end loop;

  if v_op = 'AND' then
    return true;
  else
    return has_true;
  end if;
end;
$$;


-- Public evaluator helper used for fallback comparisons
create or replace function public.eval_saved_view_filter(v jsonb, p_row anyelement)
returns boolean
language plpgsql
stable
as $$
declare
  row_json jsonb;
begin
  if v is null then
    return true;
  end if;

  row_json := to_jsonb(p_row);
  return public._sv_eval_group(v, row_json);
end;
$$;


-- Generic evaluator RPC (row-by-row evaluation, used for fallback/tests)
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
  v_limit int := greatest(0, coalesce(p_limit, 100));
  v_offset int := greatest(0, coalesce(p_offset, 0));
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
        coalesce(e.raw_enrichment->'tech_stack', e.tech_stack) as tech_stack,
        e.role_title,
        e.role_seniority
      from public.leads l
      join public.lead_enrichment_latest e on e.lead_id = l.id
    )
    select *
    from base
    where public.eval_saved_view_filter(v_filters, base)
    order by company_employee_count desc nulls last, company_domain nulls last
    limit v_limit
    offset v_offset;
end;
$$;

grant execute on function public.apply_saved_view_generic(uuid, int, int) to authenticated;


-- Compiled RPC that uses the compiled WHERE when possible
create or replace function public.apply_saved_view_compiled(
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
  v_where text;
  v_limit int := greatest(0, coalesce(p_limit, 100));
  v_offset int := greatest(0, coalesce(p_offset, 0));
begin
  select filters
  into v_filters
  from public.saved_views
  where id = p_saved_view_id;

  if v_filters is null then
    raise exception 'saved_view_not_found';
  end if;

  v_where := public._sv_compile_group(v_filters);

  if v_where is null or length(trim(v_where)) = 0 then
    return query
      select *
      from public.apply_saved_view_generic(p_saved_view_id, v_limit, v_offset);
  else
    return query
      execute format($SQL$
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
            coalesce(e.raw_enrichment->'tech_stack', e.tech_stack) as tech_stack,
            e.role_title,
            e.role_seniority
          from public.leads l
          join public.lead_enrichment_latest e on e.lead_id = l.id
        )
        select *
        from base
        where %s
        order by company_employee_count desc nulls last, company_domain nulls last
        limit %s offset %s
      $SQL$, v_where, v_limit, v_offset);
  end if;
end;
$$;

grant execute on function public.apply_saved_view_compiled(uuid, int, int) to authenticated;


-- Supporting indexes to take advantage of the compiled WHERE clause
create index if not exists idx_le_latest_empcount
  on public.lead_enrichment_latest (company_employee_count);

create index if not exists idx_le_latest_category
  on public.lead_enrichment_latest (company_category);

create index if not exists idx_le_latest_industry
  on public.lead_enrichment_latest (company_industry);

create index if not exists idx_le_latest_domain
  on public.lead_enrichment_latest (company_domain);

create index if not exists idx_le_latest_role_sen
  on public.lead_enrichment_latest (role_seniority);

create index if not exists idx_le_latest_role_tit
  on public.lead_enrichment_latest (role_title);

create index if not exists idx_le_latest_tech_gin
  on public.lead_enrichment_latest using gin (tech_stack jsonb_path_ops);


-- Block 84 — Saved Views system
-- Clean up legacy saved view artifacts if present
drop function if exists public.run_saved_view(uuid, int) cascade;
drop function if exists public.run_saved_view(uuid) cascade;
drop function if exists public.render_saved_view_sql(uuid) cascade;
drop function if exists public.compile_filters(jsonb) cascade;
drop function if exists public._compile_predicate(jsonb, jsonb, jsonb) cascade;
drop function if exists public._typed_array_literal(jsonb, text) cascade;
drop function if exists public._typed_literal(text, text) cascade;
drop function if exists public._q_literal(text) cascade;
drop function if exists public._q_ident(text) cascade;
drop table if exists public.saved_view_perf cascade;
drop table if exists public.view_fields cascade;

-- 1) Saved views (shareable)
drop table if exists public.saved_views cascade;
create table if not exists public.saved_views (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete set null,
  scope text not null default 'account' check (scope in ('account', 'campaign')),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  name text not null,
  description text,
  is_default boolean not null default false,
  visibility text not null default 'private' check (visibility in ('private', 'team', 'system')),
  is_system boolean not null default false,
  filters jsonb not null default '{}'::jsonb,
  filter jsonb not null default '{}'::jsonb,
  columns jsonb not null default '[]'::jsonb,
  sort jsonb not null default '{"key":"updated_at","dir":"desc"}'::jsonb,
  shared_with jsonb not null default '[]'::jsonb,
  unique (account_id, name)
);

comment on column public.saved_views.filter is 'Normalized filter grammar. See fn_build_where_from_filter.';
comment on column public.saved_views.columns is 'Array of column keys to render for this view.';
comment on column public.saved_views.sort is 'Default sort configuration { key, dir }.';
comment on column public.saved_views.filters is 'Legacy filters column (kept for compatibility). Mirrors filter.';

create or replace function public.saved_views_sync_filters()
returns trigger
language plpgsql
as $$
begin
  if new.filter is null and new.filters is not null then
    new.filter := new.filters;
  end if;
  if new.filters is null and new.filter is not null then
    new.filters := new.filter;
  end if;
  if new.filter is null then
    new.filter := '{}'::jsonb;
  end if;
  if new.filters is null then
    new.filters := '{}'::jsonb;
  end if;
  return new;
end
$$;

drop trigger if exists trg_saved_views_updated_at on public.saved_views;
create trigger trg_saved_views_updated_at
before update on public.saved_views
for each row execute function public.set_updated_at();

drop trigger if exists trg_saved_views_filter_sync on public.saved_views;
create trigger trg_saved_views_filter_sync
before insert or update on public.saved_views
for each row execute function public.saved_views_sync_filters();

-- 2) Enrichment fields used by filters
do $$
begin
  alter table public.leads add column if not exists company_domain text;
  alter table public.leads add column if not exists company_name text;
  alter table public.leads add column if not exists company_size int;
  alter table public.leads add column if not exists company_industry text;
  alter table public.leads add column if not exists company_tech jsonb;
  alter table public.leads add column if not exists tags text[];
exception
  when duplicate_column then
    null;
end
$$;

-- 3) Helper: build WHERE from filter JSON (recursive)
create or replace function public.fn_build_where_from_filter(p_filter jsonb, p_alias text)
returns text
language plpgsql
as $$
declare
  j jsonb := coalesce(p_filter, '{}'::jsonb);
  clauses text[] := array[]::text[];
  item jsonb;
  key text;
  op text;
  cond text;
  list text;
begin
  if j ? 'and' then
    for item in select value from jsonb_array_elements(j->'and') loop
      cond := public.fn_build_where_from_filter(item, p_alias);
      if cond is not null and cond <> '' and cond <> 'true' then
        clauses := array_append(clauses, cond);
      end if;
    end loop;
    if coalesce(array_length(clauses, 1), 0) = 0 then
      return 'true';
    end if;
    return '(' || array_to_string(clauses, ' and ') || ')';
  elsif j ? 'or' then
    for item in select value from jsonb_array_elements(j->'or') loop
      cond := public.fn_build_where_from_filter(item, p_alias);
      if cond is not null and cond <> '' and cond <> 'true' then
        clauses := array_append(clauses, cond);
      end if;
    end loop;
    if coalesce(array_length(clauses, 1), 0) = 0 then
      return 'true';
    end if;
    return '(' || array_to_string(clauses, ' or ') || ')';
  else
    key := nullif(trim(both from coalesce(j->>'k', '')), '');
    if key is null then
      return 'true';
    end if;

    op := lower(coalesce(j->>'op', '='));

    if (j ? 'is_null') and coalesce((j->>'is_null')::boolean, true) then
      return format('(%I.%I is null)', p_alias, key);
    elsif (j ? 'not_null') and coalesce((j->>'not_null')::boolean, true) then
      return format('(%I.%I is not null)', p_alias, key);
    end if;

    case op
      when '=' then
        cond := format('%I.%I = %L', p_alias, key, j->>'v');
      when '!=' then
        cond := format('%I.%I <> %L', p_alias, key, j->>'v');
      when '<' then
        cond := format('%I.%I < %L::numeric', p_alias, key, j->>'v');
      when '>' then
        cond := format('%I.%I > %L::numeric', p_alias, key, j->>'v');
      when '<=' then
        cond := format('%I.%I <= %L::numeric', p_alias, key, j->>'v');
      when '>=' then
        cond := format('%I.%I >= %L::numeric', p_alias, key, j->>'v');
      when 'ilike' then
        cond := format('%I.%I ilike %L', p_alias, key, j->>'v');
      when 'not_ilike' then
        cond := format('not (%I.%I ilike %L)', p_alias, key, j->>'v');
      when 'in' then
        select string_agg(quote_literal(value::text), ',')
          into list
        from jsonb_array_elements_text(coalesce(j->'v', '[]'::jsonb));
        if list is null or list = '' then
          return 'false';
        end if;
        cond := format('%I.%I in (%s)', p_alias, key, list);
      when 'not_in' then
        select string_agg(quote_literal(value::text), ',')
          into list
        from jsonb_array_elements_text(coalesce(j->'v', '[]'::jsonb));
        if list is null or list = '' then
          return 'true';
        end if;
        cond := format('%I.%I not in (%s)', p_alias, key, list);
      when '@>' then
        if j ? 'v' then
          cond := format('%I.%I @> %L::jsonb', p_alias, key, (j->'v')::text);
        else
          return 'true';
        end if;
      when 'has' then
        cond := format(
          'exists (select 1 from jsonb_array_elements_text(coalesce(%I.%I, ''[]''::jsonb)) as t(v) where t.v ilike %L)',
          p_alias,
          key,
          coalesce(j->>'v', '')
        );
      when 'exists' then
        cond := format('%I.%I is not null', p_alias, key);
      when 'is_null' then
        cond := format('%I.%I is null', p_alias, key);
      when 'not_null' then
        cond := format('%I.%I is not null', p_alias, key);
      else
        cond := 'true';
    end case;

    return '(' || cond || ')';
  end if;
end
$$;

-- 4) RPC: evaluate a filter JSON into a WHERE clause and return matching lead ids
create or replace function public.rpc_lead_ids_for_filter(p_account_id uuid, p_filter jsonb)
returns table(lead_id uuid)
language plpgsql
as $$
declare
  where_clause text := public.fn_build_where_from_filter(p_filter, 'l');
  sql text := 'select l.id from public.leads l where l.account_id = $1';
begin
  if where_clause is not null and where_clause <> '' and where_clause <> 'true' then
    sql := sql || ' and ' || where_clause;
  end if;
  return query execute sql using p_account_id;
end
$$;

-- 5) Convenience view for list rendering (computed columns)
create or replace view public.v_leads_for_views as
select
  l.*,
  coalesce(l.full_name, l.first_name || ' ' || l.last_name) as display_name,
  lower(split_part(l.email, '@', 2)) as email_domain
from public.leads l;

-- 6) RLS
alter table public.saved_views enable row level security;
drop policy if exists saved_views_isolation on public.saved_views;
create policy saved_views_isolation on public.saved_views
  for all using (account_id = auth.uid())
  with check (account_id = auth.uid());

-- 7) Performance indexes
create index if not exists idx_leads_company_size on public.leads(company_size);
create index if not exists idx_leads_company_industry on public.leads(lower(company_industry));
create index if not exists idx_leads_company_tech on public.leads using gin (company_tech jsonb_path_ops);
create index if not exists idx_leads_tags on public.leads using gin (tags);


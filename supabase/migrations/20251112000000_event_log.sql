-- Event logging infrastructure, rollups, and instrumentation hooks

-- 1) Event enums ---------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'event_kind'
      and n.nspname = 'public'
  ) then
    execute $enum$
      create type public.event_kind as enum (
        'dupes_refresh',
        'dupes_auto_merge',
        'merge',
        'undo_merge',
        'saved_view_query',
        'saved_view_export'
      )
    $enum$;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'event_status'
      and n.nspname = 'public'
  ) then
    execute $enum$
      create type public.event_status as enum ('ok', 'error')
    $enum$;
  end if;
end;
$$;


-- 2) Event log table -----------------------------------------------------------
create table if not exists public.event_log (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid references auth.users(id),
  kind public.event_kind not null,
  status public.event_status not null default 'ok',
  latency_ms integer,
  count_int integer,
  ref_id uuid,
  message text,
  context jsonb
);

create index if not exists idx_event_log_account_date on public.event_log(account_id, created_at);
create index if not exists idx_event_log_kind on public.event_log(kind);
create index if not exists idx_event_log_status on public.event_log(status);


-- 3) Rollup views --------------------------------------------------------------
create or replace view public.event_rollup_daily as
select
  account_id,
  date_trunc('day', created_at) as day,
  kind,
  count(*) as events,
  sum(case when status = 'ok' then 1 else 0 end) as ok,
  sum(case when status = 'error' then 1 else 0 end) as errors,
  avg(latency_ms)::int as avg_latency_ms,
  sum(coalesce(count_int, 0)) as total_count
from public.event_log
group by 1, 2, 3;

create or replace view public.dupe_quality_daily as
select
  r.account_id,
  r.day,
  sum(case when r.kind = 'dupes_refresh' then r.total_count else 0 end) as candidates,
  sum(case when r.kind = 'dupes_auto_merge' then r.total_count else 0 end) as auto_merged,
  sum(case when r.kind = 'merge' then r.events else 0 end) as manual_merges,
  sum(case when r.kind = 'undo_merge' then r.events else 0 end) as undos,
  sum(coalesce(r.errors, 0)) as errors,
  sum(coalesce(r.ok, 0) + coalesce(r.errors, 0)) as total_events
from public.event_rollup_daily r
group by 1, 2;


-- 4) RLS -----------------------------------------------------------------------
alter table public.event_log enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'event_log'
      and policyname = 'event_log_all'
  ) then
    create policy event_log_all on public.event_log
      for all
      using (public.is_account_member(account_id))
      with check (public.is_account_member(account_id));
  end if;
end;
$$;


-- 5) Log helper ----------------------------------------------------------------
create or replace function public.log_event(
  p_kind public.event_kind,
  p_status public.event_status default 'ok',
  p_latency_ms int default null,
  p_count_int int default null,
  p_ref_id uuid default null,
  p_message text default null,
  p_context jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_text text := current_setting('app.account_id', true);
  v_account uuid;
begin
  if v_account_text is null or v_account_text = '' then
    raise exception 'app.account_id not set';
  end if;

  v_account := v_account_text::uuid;

  insert into public.event_log (
    account_id,
    user_id,
    kind,
    status,
    latency_ms,
    count_int,
    ref_id,
    message,
    context
  )
  values (
    v_account,
    auth.uid(),
    p_kind,
    p_status,
    p_latency_ms,
    p_count_int,
    p_ref_id,
    p_message,
    coalesce(p_context, '{}'::jsonb)
  );
end;
$$;

grant execute on function public.log_event(
  public.event_kind,
  public.event_status,
  int,
  int,
  uuid,
  text,
  jsonb
) to authenticated;


-- 6) Instrumented duplicate refresh --------------------------------------------
create or replace function public.refresh_lead_dupe_candidates(
  p_name_thresh real default 0.82,
  p_company_thresh real default 0.78
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account uuid := current_setting('app.account_id', true)::uuid;
  v_total int := 0;
  v_rows int := 0;
begin
  if v_account is null then
    raise exception 'app.account_id not set';
  end if;

  delete from public.lead_dupe_candidates where account_id = v_account;

  insert into public.lead_dupe_candidates (
    account_id,
    lead_a,
    lead_b,
    reason,
    name_sim,
    company_sim,
    email_exact
  )
  select
    v_account,
    least(l1.id, l2.id),
    greatest(l1.id, l2.id),
    'email',
    1.0,
    1.0,
    true
  from public.leads l1
  join public.leads l2
    on l1.account_id = v_account
   and l2.account_id = v_account
   and l1.id < l2.id
   and l1.email_norm is not null
   and l1.email_norm = l2.email_norm
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  insert into public.lead_dupe_candidates (
    account_id,
    lead_a,
    lead_b,
    reason,
    name_sim,
    company_sim
  )
  select
    v_account,
    least(l1.id, l2.id),
    greatest(l1.id, l2.id),
    'domain_lastname',
    similarity(coalesce(l1.name_norm, ''), coalesce(l2.name_norm, '')),
    similarity(coalesce(l1.company_norm, ''), coalesce(l2.company_norm, ''))
  from public.leads l1
  join public.leads l2
    on l1.account_id = v_account
   and l2.account_id = v_account
   and l1.id < l2.id
   and l1.domain_norm is not null
   and l1.domain_norm = l2.domain_norm
   and nullif(split_part(coalesce(l1.last_name, ''), ' ', 1), '') is not null
   and split_part(coalesce(l1.last_name, ''), ' ', 1) = split_part(coalesce(l2.last_name, ''), ' ', 1)
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  insert into public.lead_dupe_candidates (
    account_id,
    lead_a,
    lead_b,
    reason,
    name_sim,
    company_sim
  )
  select
    v_account,
    least(l1.id, l2.id),
    greatest(l1.id, l2.id),
    'fuzzy_name_company',
    similarity(coalesce(l1.name_norm, ''), coalesce(l2.name_norm, '')),
    similarity(coalesce(l1.company_norm, ''), coalesce(l2.company_norm, ''))
  from public.leads l1
  join public.leads l2
    on l1.account_id = v_account
   and l2.account_id = v_account
   and l1.id < l2.id
   and l1.domain_norm is not null
   and l1.domain_norm = l2.domain_norm
   and similarity(coalesce(l1.name_norm, ''), coalesce(l2.name_norm, '')) >= p_name_thresh
   and similarity(coalesce(l1.company_norm, ''), coalesce(l2.company_norm, '')) >= p_company_thresh
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  perform public.log_event(
    'dupes_refresh',
    'ok',
    null,
    v_total,
    null,
    null,
    jsonb_build_object(
      'name_thresh', p_name_thresh,
      'company_thresh', p_company_thresh
    )
  );

  return v_total;
end;
$$;


-- 7) Instrumented auto merge ---------------------------------------------------
create or replace function public.auto_merge_dupes(p_limit int default 200)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account uuid := current_setting('app.account_id', true)::uuid;
  merged int := 0;
  skipped int := 0;
  rec record;
  primary_id uuid;
  secondary_id uuid;
begin
  if v_account is null then
    raise exception 'app.account_id not set';
  end if;

  for rec in
    select c.id, c.lead_a, c.lead_b
    from public.lead_dupe_classified c
    where c.account_id = v_account
      and c.tier = 'auto'
    order by c.email_exact desc, c.name_sim desc
    limit p_limit
  loop
    select id
    into primary_id
    from public.leads
    where id in (rec.lead_a, rec.lead_b)
      and account_id = v_account
    order by created_at asc
    limit 1;

    select case when primary_id = rec.lead_a then rec.lead_b else rec.lead_a end
    into secondary_id;

    begin
      perform public.merge_leads(primary_id, secondary_id, 'primary_wins', '{}'::jsonb);
      merged := merged + 1;
    exception
      when others then
        skipped := skipped + 1;
    end;
  end loop;

  perform public.log_event(
    'dupes_auto_merge',
    'ok',
    null,
    merged,
    null,
    null,
    jsonb_build_object('skipped', skipped)
  );

  return jsonb_build_object('merged', merged, 'skipped', skipped);
end;
$$;


-- 8) Instrumented manual merge -------------------------------------------------
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
  v_account uuid := current_setting('app.account_id', true)::uuid;
  r_primary public.leads%rowtype;
  r_secondary public.leads%rowtype;
  moved jsonb := '{}'::jsonb;
  v_actor uuid := auth.uid();
begin
  if v_account is null then
    raise exception 'app.account_id not set';
  end if;

  if p_primary = p_secondary then
    raise exception 'Primary and secondary cannot be the same';
  end if;

  select * into r_primary
  from public.leads
  where id = p_primary
    and account_id = v_account
  for update;
  if not found then
    raise exception 'Primary lead not found in current account';
  end if;

  select * into r_secondary
  from public.leads
  where id = p_secondary
    and account_id = v_account
  for update;
  if not found then
    raise exception 'Secondary lead not found in current account';
  end if;

  with moved_campaigns as (
    update public.campaign_leads cl
       set lead_id = p_primary,
           account_id = v_account
     where cl.lead_id = p_secondary
       and cl.account_id = v_account
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

  if p_strategy = 'secondary_wins' then
    update public.leads
       set email = coalesce(r_secondary.email, r_primary.email),
           first_name = coalesce(r_secondary.first_name, r_primary.first_name),
           last_name = coalesce(r_secondary.last_name, r_primary.last_name),
           company = coalesce(r_secondary.company, r_primary.company),
           phone = coalesce(r_secondary.phone, r_primary.phone),
           title = coalesce(r_secondary.title, r_primary.title),
           updated_at = now()
     where id = p_primary
       and account_id = v_account;

  elsif p_strategy = 'fieldwise' then
    update public.leads
       set email = case when p_field_map->>'email' = 'secondary' then r_secondary.email else r_primary.email end,
           first_name = case when p_field_map->>'first_name' = 'secondary' then r_secondary.first_name else r_primary.first_name end,
           last_name = case when p_field_map->>'last_name' = 'secondary' then r_secondary.last_name else r_primary.last_name end,
           company = case when p_field_map->>'company' = 'secondary' then r_secondary.company else r_primary.company end,
           phone = case when p_field_map->>'phone' = 'secondary' then r_secondary.phone else r_primary.phone end,
           title = case when p_field_map->>'title' = 'secondary' then r_secondary.title else r_primary.title end,
           updated_at = now()
     where id = p_primary
       and account_id = v_account;

  else
    update public.leads
       set updated_at = now()
     where id = p_primary
       and account_id = v_account;
  end if;

  update public.leads
     set merged_into = p_primary,
         updated_at = now()
   where id = p_secondary
     and account_id = v_account;

  insert into public.lead_merge_audit (
    account_id,
    actor,
    primary_lead,
    secondary_lead,
    strategy,
    field_map,
    moved_counts,
    snapshot
  )
  values (
    v_account,
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

  update public.lead_merge_audit
     set account_id = v_account
   where primary_lead = p_primary
     and secondary_lead = p_secondary
     and account_id is null;

  delete from public.lead_dupe_candidates
   where account_id = v_account
     and (
       (lead_a = p_primary and lead_b = p_secondary) or
       (lead_a = p_secondary and lead_b = p_primary)
     );

  perform public.log_event(
    'merge',
    'ok',
    null,
    1,
    p_secondary,
    null,
    jsonb_build_object(
      'primary', p_primary,
      'strategy', p_strategy
    )
  );

  return jsonb_build_object(
    'primary', p_primary,
    'secondary', p_secondary,
    'moved', moved
  );
end;
$$;


-- 9) Instrumented undo ---------------------------------------------------------
create or replace function public.undo_merge(p_audit_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account uuid := current_setting('app.account_id', true)::uuid;
  aud record;
  snap_primary jsonb;
  snap_secondary jsonb;
  already_restored boolean := false;
  restored_counts jsonb := '{}'::jsonb;
begin
  if v_account is null then
    raise exception 'app.account_id not set';
  end if;

  select *
  into aud
  from public.lead_merge_audit
  where id = p_audit_id
    and account_id = v_account
  for update;

  if not found then
    raise exception 'Audit % not found in current account', p_audit_id;
  end if;

  if not public._audit_has_snap(aud.snapshot) then
    raise exception 'Audit % has no snapshot payload', p_audit_id;
  end if;

  snap_primary := aud.snapshot->'primary';
  snap_secondary := aud.snapshot->'secondary';

  select exists(
    select 1
    from public.leads l
    where l.id = aud.secondary_lead
      and l.account_id = v_account
      and l.merged_into is null
  )
  into already_restored;

  if already_restored then
    return jsonb_build_object('status', 'noop', 'reason', 'already_restored');
  end if;

  if not exists (
    select 1
    from public.leads
    where id = aud.secondary_lead
      and account_id = v_account
  ) then
    insert into public.leads (
      id,
      account_id,
      email,
      first_name,
      last_name,
      company,
      title,
      phone,
      created_at,
      updated_at
    )
    values (
      (snap_secondary->>'id')::uuid,
      v_account,
      nullif(snap_secondary->>'email', ''),
      nullif(snap_secondary->>'first_name', ''),
      nullif(snap_secondary->>'last_name', ''),
      nullif(snap_secondary->>'company', ''),
      nullif(snap_secondary->>'title', ''),
      nullif(snap_secondary->>'phone', ''),
      coalesce((snap_secondary->>'created_at')::timestamptz, now()),
      now()
    );
  else
    update public.leads
       set merged_into = null,
           updated_at = now()
     where id = aud.secondary_lead
       and account_id = v_account;
  end if;

  with moved_campaigns as (
    update public.campaign_leads
       set lead_id = aud.secondary_lead,
           account_id = v_account
     where lead_id = aud.primary_lead
       and account_id = v_account
       and id in (
         select cl.id
         from public.campaign_leads cl
         where cl.lead_id = aud.primary_lead
           and cl.account_id = v_account
           and cl.created_at >= aud.created_at
       )
     returning 1
  ), moved_logs as (
    update public.activity_logs
       set lead_id = aud.secondary_lead
     where lead_id = aud.primary_lead
     returning 1
  ), moved_events as (
    update public.events
       set lead_id = aud.secondary_lead
     where lead_id = aud.primary_lead
     returning 1
  ), moved_replies as (
    update public.replies
       set lead_id = aud.secondary_lead
     where lead_id = aud.primary_lead
     returning 1
  )
  select jsonb_build_object(
    'campaign_leads', (select count(*) from moved_campaigns),
    'activity_logs', (select count(*) from moved_logs),
    'events', (select count(*) from moved_events),
    'replies', (select count(*) from moved_replies)
  )
  into restored_counts;

  update public.leads
     set email = coalesce(nullif(snap_primary->>'email', ''), email),
         first_name = coalesce(nullif(snap_primary->>'first_name', ''), first_name),
         last_name = coalesce(nullif(snap_primary->>'last_name', ''), last_name),
         company = coalesce(nullif(snap_primary->>'company', ''), company),
         title = coalesce(nullif(snap_primary->>'title', ''), title),
         phone = coalesce(nullif(snap_primary->>'phone', ''), phone),
         updated_at = now()
   where id = aud.primary_lead
     and account_id = v_account;

  update public.leads
     set email = coalesce(nullif(snap_secondary->>'email', ''), email),
         first_name = coalesce(nullif(snap_secondary->>'first_name', ''), first_name),
         last_name = coalesce(nullif(snap_secondary->>'last_name', ''), last_name),
         company = coalesce(nullif(snap_secondary->>'company', ''), company),
         title = coalesce(nullif(snap_secondary->>'title', ''), title),
         phone = coalesce(nullif(snap_secondary->>'phone', ''), phone),
         updated_at = now()
   where id = aud.secondary_lead
     and account_id = v_account;

  delete from public.lead_dupe_candidates
   where account_id = v_account
     and (
       (lead_a = aud.primary_lead and lead_b = aud.secondary_lead) or
       (lead_b = aud.primary_lead and lead_a = aud.secondary_lead)
     );

  perform public.log_event(
    'undo_merge',
    'ok',
    null,
    1,
    p_audit_id,
    null,
    '{}'::jsonb
  );

  return jsonb_build_object(
    'status', 'restored',
    'primary', aud.primary_lead,
    'secondary', aud.secondary_lead,
    'restored_counts', restored_counts
  );
end;
$$;





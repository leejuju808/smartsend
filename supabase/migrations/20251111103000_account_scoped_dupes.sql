-- Account-scoped dedupe enforcement, session helpers, and metrics

-- 1) Ensure account_id columns exist ------------------------------------------

alter table public.leads
  add column if not exists account_id uuid references public.accounts(id) on delete cascade;

create index if not exists idx_leads_account on public.leads(account_id);

alter table public.lead_dupe_candidates
  add column if not exists account_id uuid references public.accounts(id) on delete cascade;

alter table public.lead_dupe_candidates
  drop constraint if exists lead_dupe_candidates_lead_a_lead_b_key;

alter table public.lead_dupe_candidates
  add constraint lead_dupe_candidates_account_pair_key unique (account_id, lead_a, lead_b);

create index if not exists idx_ldc_account on public.lead_dupe_candidates(account_id);

alter table public.lead_merge_audit
  add column if not exists account_id uuid references public.accounts(id) on delete cascade;

create index if not exists idx_lma_account on public.lead_merge_audit(account_id);

alter table public.campaign_leads
  add column if not exists account_id uuid references public.accounts(id) on delete cascade;

create index if not exists idx_campaign_leads_account on public.campaign_leads(account_id);


-- 2) Backfill account_id values ------------------------------------------------

update public.lead_dupe_candidates c
set account_id = l.account_id
from public.leads l
where c.account_id is null
  and c.lead_a = l.id;

update public.lead_dupe_candidates c
set account_id = l.account_id
from public.leads l
where c.account_id is null
  and c.lead_b = l.id;

update public.lead_merge_audit a
set account_id = l.account_id
from public.leads l
where a.account_id is null
  and a.primary_lead = l.id;

update public.lead_merge_audit a
set account_id = l.account_id
from public.leads l
where a.account_id is null
  and a.secondary_lead = l.id;

update public.campaign_leads cl
set account_id = c.account_id
from public.campaigns c
where cl.account_id is null
  and cl.campaign_id = c.id;


-- 3) Tighten constraints -------------------------------------------------------

alter table public.lead_dupe_candidates
  alter column account_id set not null;

alter table public.lead_merge_audit
  alter column account_id set not null;

alter table public.campaign_leads
  alter column account_id set not null;


-- 4) Session helper -----------------------------------------------------------

create or replace function public.set_account(p_account_id uuid)
returns void
language sql
security definer
as $$
  select set_config('app.account_id', p_account_id::text, true);
$$;


-- 5) RLS policies --------------------------------------------------------------

alter table public.lead_dupe_candidates enable row level security;
drop policy if exists ldc_select on public.lead_dupe_candidates;
drop policy if exists ldc_modify on public.lead_dupe_candidates;

create policy ldc_select on public.lead_dupe_candidates
for select
using (public.is_account_member(account_id));

create policy ldc_modify on public.lead_dupe_candidates
for all
using (public.is_account_member(account_id))
with check (public.is_account_member(account_id));

alter table public.lead_merge_audit enable row level security;
drop policy if exists lma_select on public.lead_merge_audit;

create policy lma_select on public.lead_merge_audit
for select
using (public.is_account_member(account_id));

alter table public.campaign_leads enable row level security;
drop policy if exists cl_all on public.campaign_leads;

create policy cl_all on public.campaign_leads
for all
using (public.is_account_member(account_id))
with check (public.is_account_member(account_id));


-- 6) Account-aware duplicate refresh ------------------------------------------

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

  return v_total;
end;
$$;

grant execute on function public.refresh_lead_dupe_candidates(real, real) to authenticated;


-- 7) Account-aware classification view ----------------------------------------

create or replace view public.lead_dupe_classified as
select
  c.*,
  case
    when c.email_exact then 'auto'
    when c.name_sim >= mr_auto.name_thresh
     and c.company_sim >= mr_auto.company_thresh
     and (not mr_auto.require_same_domain or la.domain_norm = lb.domain_norm)
      then 'auto'
    when c.name_sim >= mr_rev.name_thresh
     and c.company_sim >= mr_rev.company_thresh
     and (not mr_rev.require_same_domain or la.domain_norm = lb.domain_norm)
      then 'review'
    else 'ignore'
  end as tier
from public.lead_dupe_candidates c
join public.leads la on la.id = c.lead_a and la.account_id = c.account_id
join public.leads lb on lb.id = c.lead_b and lb.account_id = c.account_id
join public.merge_rules mr_auto on mr_auto.tier = 'auto' and mr_auto.account_id = c.account_id
join public.merge_rules mr_rev on mr_rev.tier = 'review' and mr_rev.account_id = c.account_id
where c.account_id = current_setting('app.account_id', true)::uuid;


-- 8) Guarded merge + undo ------------------------------------------------------

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

  return jsonb_build_object(
    'primary', p_primary,
    'secondary', p_secondary,
    'moved', moved
  );
end;
$$;

grant execute on function public.merge_leads(uuid, uuid, text, jsonb) to authenticated;


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

  return jsonb_build_object(
    'status', 'restored',
    'primary', aud.primary_lead,
    'secondary', aud.secondary_lead,
    'restored_counts', restored_counts
  );
end;
$$;

grant execute on function public.undo_merge(uuid) to authenticated;


-- 9) Metrics views -------------------------------------------------------------

create or replace view public.dupe_metrics as
with cte as (
  select
    account_id,
    reason,
    tier,
    date_trunc('day', created_at) as day
  from public.lead_dupe_classified
)
select
  account_id,
  day,
  reason,
  tier,
  count(*) as candidate_count
from cte
group by 1,2,3,4;

create or replace view public.merge_metrics as
select
  account_id,
  date_trunc('day', created_at) as day,
  count(*) as merges
from public.lead_merge_audit
group by 1,2;

alter view public.dupe_metrics set (security_barrier = on);
alter view public.merge_metrics set (security_barrier = on);



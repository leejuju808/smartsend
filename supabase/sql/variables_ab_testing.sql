-- A) Canonical variable sources

create or replace view public.v_vars_lead as
select
  l.id as lead_id,
  l.email,
  coalesce(nullif(l.first_name,''), split_part(l.email,'@',1)) as first_name,
  l.last_name,
  l.company,
  l.title,
  l.country
from public.leads l;

create or replace view public.v_vars_campaign as
select
  c.id as campaign_id,
  c.name as campaign_name,
  c.slug as campaign_slug
from public.campaigns c;

create or replace view public.v_vars_user as
select
  u.id as user_id,
  coalesce(u.raw_user_meta_data->>'name', split_part(u.email,'@',1)) as sender_name,
  u.email as sender_email
from auth.users u;

create or replace view public.v_vars_thread as
select
  t.id as thread_id,
  t.campaign_id,
  t.lead_id,
  vl.first_name,
  vl.last_name,
  vl.company,
  vl.title,
  vl.email as lead_email,
  vl.country,
  vc.campaign_name,
  vc.campaign_slug
from public.inbox_threads t
left join public.v_vars_lead vl on vl.lead_id = t.lead_id
left join public.v_vars_campaign vc on vc.campaign_id = t.campaign_id;

-- B) A/B test tables

create table if not exists public.ab_tests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('subject','copy')),
  status text not null default 'active' check (status in ('active','paused','complete')),
  meta jsonb not null default '{}'::jsonb
);

create index if not exists idx_ab_campaign on public.ab_tests(campaign_id);

create table if not exists public.ab_variants (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  test_id uuid not null references public.ab_tests(id) on delete cascade,
  tag text not null check (tag in ('A','B')),
  subject text,
  body_html text,
  weight int not null default 50,
  unique (test_id, tag)
);

create table if not exists public.ab_assignments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  test_id uuid not null references public.ab_tests(id) on delete cascade,
  variant_id uuid not null references public.ab_variants(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  unique (test_id, thread_id)
);

create index if not exists idx_ab_assign_campaign on public.ab_assignments(campaign_id, test_id);

-- C) Deterministic cohort assigner for 50/50 (hash on thread_id)

create or replace function public.pick_ab_tag(p_thread uuid, p_weight_a int default 50)
returns text
language sql
immutable
as $$
  select case
    when (('x' || substr(md5(p_thread::text), 1, 8))::bit(32)::int % 100) < p_weight_a
      then 'A'
    else 'B'
  end
$$;

-- D) Helper: create a test + variants in one call

create or replace function public.create_ab_test(
  p_campaign uuid,
  p_name text,
  p_kind text,
  p_subject_a text,
  p_html_a text,
  p_subject_b text,
  p_html_b text,
  p_weight_a int default 50
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_test uuid;
  v_a uuid;
  v_b uuid;
begin
  insert into public.ab_tests (campaign_id, name, kind)
  values (p_campaign, p_name, p_kind)
  returning id into v_test;

  insert into public.ab_variants (test_id, tag, subject, body_html, weight)
  values (v_test, 'A', p_subject_a, p_html_a, p_weight_a)
  returning id into v_a;

  insert into public.ab_variants (test_id, tag, subject, body_html, weight)
  values (v_test, 'B', p_subject_b, p_html_b, 100 - p_weight_a)
  returning id into v_b;

  return v_test;
end
$$;

grant execute on function public.create_ab_test(uuid, text, text, text, text, text, text, int) to authenticated;

-- E) Helper: assign thread to variant (idempotent)

create or replace function public.assign_ab_variant(p_test uuid, p_thread uuid, p_lead uuid, p_campaign uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tag text;
  v_var uuid;
  v_id uuid;
  w_a int;
begin
  if exists (
    select 1
    from public.ab_assignments
    where test_id = p_test
      and thread_id = p_thread
  ) then
    select id into v_id
    from public.ab_assignments
    where test_id = p_test
      and thread_id = p_thread
    limit 1;

    return v_id;
  end if;

  select weight into w_a
  from public.ab_variants
  where test_id = p_test
    and tag = 'A';

  v_tag := public.pick_ab_tag(p_thread, coalesce(w_a, 50));

  select id into v_var
  from public.ab_variants
  where test_id = p_test
    and tag = v_tag;

  insert into public.ab_assignments (test_id, variant_id, campaign_id, thread_id, lead_id)
  values (p_test, v_var, p_campaign, p_thread, p_lead)
  returning id into v_id;

  return v_id;
end
$$;

grant execute on function public.assign_ab_variant(uuid, uuid, uuid, uuid) to authenticated;


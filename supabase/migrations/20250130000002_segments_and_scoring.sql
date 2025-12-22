-- Segments, memberships, and lead scoring system

-- A) Segment definitions (rule-based, per account)
create table if not exists public.segments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  account_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  color text default '#0ea5e9',
  is_active boolean not null default true,
  rule jsonb not null default '{}'::jsonb,
  min_score int default 0,
  unique(account_id, name)
);

create index if not exists idx_segments_account on public.segments(account_id);

-- B) Memberships (materialized)
create table if not exists public.lead_segment_members (
  segment_id uuid not null references public.segments(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (segment_id, lead_id)
);

create index if not exists idx_lead_segment_members_lead on public.lead_segment_members(lead_id);

-- C) Scoring table (per lead per account)
create table if not exists public.lead_scores (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  updated_at timestamptz not null default now(),
  score int not null default 0,
  reasons jsonb not null default '[]'::jsonb
);

-- D) RLS
alter table public.segments enable row level security;
alter table public.lead_segment_members enable row level security;
alter table public.lead_scores enable row level security;

do $$
begin
  create policy if not exists segments_rw on public.segments
    for all
    using (account_id = auth.uid())
    with check (account_id = auth.uid());
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy if not exists seg_members_read on public.lead_segment_members
    for select
    using (
      exists (
        select 1
        from public.segments s
        where s.id = segment_id
          and s.account_id = auth.uid()
      )
    );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy if not exists seg_members_write on public.lead_segment_members
    for all
    using (
      exists (
        select 1
        from public.segments s
        where s.id = segment_id
          and s.account_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1
        from public.segments s
        where s.id = segment_id
          and s.account_id = auth.uid()
      )
    );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy if not exists lead_scores_rw on public.lead_scores
    for all
    using (
      exists (
        select 1
        from public.leads l
        where l.id = lead_id
          and l.account_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1
        from public.leads l
        where l.id = lead_id
          and l.account_id = auth.uid()
      )
    );
exception
  when duplicate_object then null;
end $$;

-- E) View for UI
create or replace view public.v_leads_with_score as
select
  l.id as lead_id,
  l.account_id,
  coalesce(s.score, 0) as score,
  s.updated_at as score_updated_at
from public.leads l
left join public.lead_scores s on s.lead_id = l.id;

-- Helper: bool overlap for text arrays
create or replace function public.arr_overlap(a text[], b text[])
returns boolean
language sql
immutable
as $$
  select a && b
$$;

-- Compute a single segment’s memberships (fast path; uses enrichment)
create or replace function public.recompute_segment(p_segment_id uuid, p_limit int default 5000)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule jsonb;
  v_account uuid;
  v_count int;
begin
  select rule, account_id
    into v_rule, v_account
  from public.segments
  where id = p_segment_id
    and is_active = true;

  if v_rule is null then
    return 0;
  end if;

  delete from public.lead_segment_members
  where segment_id = p_segment_id;

  with src as (
    select
      l.id as lead_id,
      le.industry,
      le.company_employee_count,
      le.country,
      coalesce(le.tech_tags, '{}') as tech_tags,
      lower(coalesce(le.seniority, '')) as seniority,
      lower(coalesce(le.title, '')) as title,
      lower(coalesce(le.company_domain, split_part(l.email, '@', 2))) as domain
    from public.leads l
    left join public.lead_enrichments le on le.lead_id = l.id
    where l.account_id = v_account
  )
  insert into public.lead_segment_members(segment_id, lead_id)
  select
    p_segment_id,
    s.lead_id
  from src s
  where
    (
      not v_rule ? 'industry_in'
      or s.industry = any (
        select jsonb_array_elements_text(v_rule -> 'industry_in')
      )
    )
    and (
      not v_rule ? 'employee_count'
      or (
        coalesce((v_rule -> 'employee_count' ->> 'min')::int, 0) <= coalesce(s.company_employee_count, 0)
        and coalesce((v_rule -> 'employee_count' ->> 'max')::int, 2147483647) >= coalesce(s.company_employee_count, 2147483647)
      )
    )
    and (
      not v_rule ? 'country_in'
      or s.country = any (
        select jsonb_array_elements_text(v_rule -> 'country_in')
      )
    )
    and (
      not v_rule ? 'tech_any'
      or public.arr_overlap(
        s.tech_tags,
        array(select jsonb_array_elements_text(v_rule -> 'tech_any'))
      )
    )
    and (
      not v_rule ? 'tech_all'
      or (
        select count(*)
        from jsonb_array_elements_text(v_rule -> 'tech_all') v
        where not v.value = any (s.tech_tags)
      ) = 0
    )
    and (
      not v_rule ? 'seniority_in'
      or s.seniority = any (
        select lower(jsonb_array_elements_text(v_rule -> 'seniority_in'))
      )
    )
    and (
      not v_rule ? 'title_ilike'
      or exists (
        select 1
        from jsonb_array_elements_text(v_rule -> 'title_ilike') t
        where s.title like ('%' || lower(t.value) || '%')
      )
    )
    and (
      not v_rule ? 'domain_in'
      or s.domain = any (
        select lower(jsonb_array_elements_text(v_rule -> 'domain_in'))
      )
    )
  limit p_limit;

  get diagnostics v_count = row_count;

  update public.segments
  set updated_at = now()
  where id = p_segment_id;

  return v_count;
end $$;

-- Recompute all segments for an account
create or replace function public.recompute_all_segments(p_account_id uuid, p_limit_per int default 5000)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_total int := 0;
begin
  for r in
    select id
    from public.segments
    where account_id = p_account_id
      and is_active = true
  loop
    v_total := v_total + public.recompute_segment(r.id, p_limit_per);
  end loop;

  return v_total;
end $$;

-- Scoring config view (change weights here or later move to a table)
create or replace view public.v_scoring_weights as
select
  10 as w_has_linkedin,
  15 as w_seniority_exec,
  12 as w_title_ops_sales,
  18 as w_industry_target,
  14 as w_size_smb,
  8  as w_tech_fit;

-- Compute score for all leads in an account (optional filter by segment)
create or replace function public.recompute_scores(p_account_id uuid, p_segment_id uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  with w as (
    select * from public.v_scoring_weights
  ),
  src as (
    select
      l.id as lead_id,
      le.linkedin_url,
      lower(coalesce(le.seniority, '')) as sen,
      lower(coalesce(le.title, '')) as title,
      le.industry,
      le.company_employee_count,
      coalesce(le.tech_tags, '{}') as tech,
      s.rule as seg_rule
    from public.leads l
    left join public.lead_enrichments le on le.lead_id = l.id
    left join public.segments s on s.id = p_segment_id
    where l.account_id = p_account_id
  ),
  scored as (
    select
      s.lead_id,
      (
        (case when s.linkedin_url is not null and length(s.linkedin_url) > 0 then w.w_has_linkedin else 0 end) +
        (case when s.sen in ('c-suite', 'founder', 'owner', 'vp') then w.w_seniority_exec else 0 end) +
        (case when s.title like '%operations%' or s.title like '%marketing%' or s.title like '%growth%' or s.title like '%sales%' or s.title like '%revenue%' then w.w_title_ops_sales else 0 end) +
        (case when (seg_rule ? 'industry_in') and s.industry = any (select jsonb_array_elements_text(seg_rule -> 'industry_in')) then w.w_industry_target else 0 end) +
        (case when coalesce(s.company_employee_count, 0) between 11 and 200 then w.w_size_smb else 0 end) +
        (case when (seg_rule ? 'tech_any') and public.arr_overlap(s.tech, array(select jsonb_array_elements_text(seg_rule -> 'tech_any'))) then w.w_tech_fit else 0 end)
      ) as score
    from src s
    cross join w
    group by
      s.lead_id,
      w.w_has_linkedin,
      w.w_seniority_exec,
      w.w_title_ops_sales,
      w.w_industry_target,
      w.w_size_smb,
      w.w_tech_fit,
      s.seg_rule,
      s.sen,
      s.title,
      s.industry,
      s.company_employee_count,
      s.linkedin_url,
      s.tech
  )
  insert into public.lead_scores(lead_id, score, reasons, updated_at)
  select
    lead_id,
    score,
    '[]'::jsonb,
    now()
  from scored
  on conflict (lead_id) do update
    set score = excluded.score,
        updated_at = now();

  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Trigger to refresh segments/scores on enrichment changes
create or replace function public.trg_after_enrichment_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account uuid;
begin
  select l.account_id
    into v_account
  from public.leads l
  where l.id = new.lead_id;

  if v_account is null then
    return new;
  end if;

  perform public.recompute_all_segments(v_account, 100000);
  perform public.recompute_scores(v_account, null);

  return new;
end $$;

drop trigger if exists after_enrichment_update on public.lead_enrichments;
create trigger after_enrichment_update
after insert or update on public.lead_enrichments
for each row execute function public.trg_after_enrichment_update();

-- Nightly maintenance placeholder (to be wired via Supabase Scheduled Function)
-- select public.recompute_all_segments(auth.uid());
-- select public.recompute_scores(auth.uid(), null);



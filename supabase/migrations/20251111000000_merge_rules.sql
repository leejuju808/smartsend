-- Merge rules configuration for duplicate handling

create table if not exists public.merge_rules (
  account_id uuid not null references public.accounts(id) on delete cascade,
  tier text not null check (tier in ('auto','review','ignore')),
  name_thresh real not null default 0.90,
  company_thresh real not null default 0.88,
  require_same_domain boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (account_id, tier)
);

create trigger trg_merge_rules_updated_at
before update on public.merge_rules
for each row
execute function public.set_updated_at();

-- sensible defaults for all accounts
insert into public.merge_rules (account_id, tier, name_thresh, company_thresh, require_same_domain)
select a.id, 'auto', 0.94, 0.92, true
from public.accounts a
on conflict do nothing;

insert into public.merge_rules (account_id, tier, name_thresh, company_thresh, require_same_domain)
select a.id, 'review', 0.90, 0.88, true
from public.accounts a
on conflict do nothing;

insert into public.merge_rules (account_id, tier, name_thresh, company_thresh, require_same_domain)
select a.id, 'ignore', 0.80, 0.75, false
from public.accounts a
on conflict do nothing;

-- classify candidates and auto merge helpers

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
join public.leads la on la.id = c.lead_a
join public.leads lb on lb.id = c.lead_b
join public.merge_rules mr_auto on mr_auto.account_id = la.account_id and mr_auto.tier = 'auto'
join public.merge_rules mr_rev on mr_rev.account_id = la.account_id and mr_rev.tier = 'review';

create or replace function public.auto_merge_dupes(p_limit int default 200)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  merged int := 0;
  skipped int := 0;
  rec record;
  primary_id uuid;
  secondary_id uuid;
begin
  for rec in
    select c.id, c.lead_a, c.lead_b
    from public.lead_dupe_classified c
    where c.tier = 'auto'
    order by c.email_exact desc, c.name_sim desc
    limit p_limit
  loop
    select id
    into primary_id
    from public.leads
    where id in (rec.lead_a, rec.lead_b)
    order by created_at asc
    limit 1;

    select case when primary_id = rec.lead_a then rec.lead_b else rec.lead_a end
    into secondary_id;

    begin
      perform public.merge_leads(primary_id, secondary_id, 'primary_wins', '{}'::jsonb);
      merged := merged + 1;
    exception when others then
      skipped := skipped + 1;
    end;
  end loop;

  return jsonb_build_object('merged', merged, 'skipped', skipped);
end;
$$;

grant execute on function public.auto_merge_dupes(int) to authenticated;

create or replace function public.count_auto_merge_ready()
returns int
language sql
stable
as $$
  select count(*)
  from public.lead_dupe_classified
  where tier = 'auto';
$$;



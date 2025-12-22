-- Run ad-hoc or nightly
create or replace function public.rpc_generate_lead_match_candidates(
  p_account_id uuid,
  p_limit int default 200
) returns int
language plpgsql
as $$
declare
  inserted int := 0;
begin
  -- Same-email (case-insensitive)
  with dup as (
    select l1.account_id,
           l1.id as a,
           l2.id as b,
           'same_email' as reason,
           1.0 as score
    from public.leads l1
    join public.leads l2
      on l1.account_id = l2.account_id
     and l1.id < l2.id
    where l1.account_id = p_account_id
      and l1.email is not null
      and l2.email is not null
      and lower(l1.email) = lower(l2.email)
    limit p_limit
  )
  insert into public.lead_match_candidates(account_id, lead_id_a, lead_id_b, reason, score)
  select account_id, a, b, reason, score from dup
  on conflict (account_id, lead_id_a, lead_id_b) do nothing;

  get diagnostics inserted = row_count;

  -- Same domain + fuzzy name/company
  with pairs as (
    select l1.account_id,
           l1.id as a,
           l2.id as b,
           similarity(coalesce(l1.company_name,''), coalesce(l2.company_name,'')) as comp_sim,
           similarity(
             coalesce(l1.first_name,'') || ' ' || coalesce(l1.last_name,''),
             coalesce(l2.first_name,'') || ' ' || coalesce(l2.last_name,'')
           ) as name_sim
    from public.leads l1
    join public.leads l2
      on l1.account_id = l2.account_id
     and l1.id < l2.id
     and split_part(lower(l1.email), '@', 2) = split_part(lower(l2.email), '@', 2)
    where l1.account_id = p_account_id
  ),
  cand as (
    select account_id,
           a,
           b,
           case
             when comp_sim >= 0.7 then 'company_fuzzy'
             when name_sim >= 0.7 then 'name_fuzzy'
             else 'domain_only'
           end as reason,
           greatest(comp_sim, name_sim) as score
    from pairs
    where greatest(comp_sim, name_sim) >= 0.7
  )
  insert into public.lead_match_candidates(account_id, lead_id_a, lead_id_b, reason, score)
  select account_id, a, b, reason, score from cand
  on conflict (account_id, lead_id_a, lead_id_b) do nothing;

  get diagnostics inserted = inserted + row_count;

  return inserted;
end $$;


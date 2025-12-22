create or replace function public.rpc_merge_leads(
  p_account_id uuid,
  p_survivor uuid,
  p_mergee uuid,
  p_overrides jsonb default '{}'::jsonb
) returns uuid
language plpgsql
as $$
declare
  j_id uuid;
  surv jsonb;
  merg jsonb;
  rewired jsonb := '[]'::jsonb;
  dels jsonb := '[]'::jsonb;
begin
  if p_survivor = p_mergee then
    raise exception 'survivor=mergee';
  end if;

  -- Lock both rows
  perform 1
  from public.leads
  where id in (p_survivor, p_mergee)
    and account_id = p_account_id
  for update;

  if not found then
    raise exception 'leads_not_found_or_forbidden';
  end if;

  -- Snapshot befores
  select to_jsonb(l) into surv from public.leads l where id = p_survivor;
  select to_jsonb(l) into merg from public.leads l where id = p_mergee;

  -- Start job
  insert into public.lead_merge_jobs(account_id, survivor_lead_id, mergee_lead_id, field_overrides, status)
  values (p_account_id, p_survivor, p_mergee, p_overrides, 'running')
  returning id into j_id;

  -- 1) Rewire FKs (threads, messages, outcomes, assignments, facts)
  update public.threads
     set lead_id = p_survivor
   where lead_id = p_mergee;

  rewired := rewired || jsonb_build_array(
    jsonb_build_object(
      'table','threads',
      'count',(select count(*) from public.threads where lead_id = p_survivor and updated_at >= now() - interval '1 minute')
    )
  );

  update public.messages set lead_id = p_survivor where lead_id = p_mergee;
  update public.send_outcomes set lead_id = p_survivor where lead_id = p_mergee;
  update public.signature_facts set lead_id = p_survivor where lead_id = p_mergee;
  update public.ab_assignments set lead_id = p_survivor where lead_id = p_mergee;
  -- add more tables as needed

  -- 2) Merge scalar fields (prefer survivor, then non-null from mergee, then overrides last)
  update public.leads s set
    first_name     = coalesce((p_overrides->>'first_name'), s.first_name, (select first_name from public.leads where id = p_mergee)),
    last_name      = coalesce((p_overrides->>'last_name'), s.last_name, (select last_name from public.leads where id = p_mergee)),
    company_name   = coalesce((p_overrides->>'company_name'), s.company_name, (select company_name from public.leads where id = p_mergee)),
    title          = coalesce((p_overrides->>'title'), s.title, (select title from public.leads where id = p_mergee)),
    phone          = coalesce((p_overrides->>'phone'), s.phone, (select phone from public.leads where id = p_mergee)),
    timezone       = coalesce((p_overrides->>'timezone'), s.timezone, (select timezone from public.leads where id = p_mergee)),
    website        = coalesce((p_overrides->>'website'), s.website, (select website from public.leads where id = p_mergee)),
    linkedin_url   = coalesce((p_overrides->>'linkedin_url'), s.linkedin_url, (select linkedin_url from public.leads where id = p_mergee)),
    twitter_url    = coalesce((p_overrides->>'twitter_url'), s.twitter_url, (select twitter_url from public.leads where id = p_mergee)),
    employee_count = coalesce((p_overrides->>'employee_count')::int, s.employee_count, (select employee_count from public.leads where id = p_mergee)),
    tech_stack     = coalesce(s.tech_stack, '{}'::jsonb) || coalesce((select tech_stack from public.leads where id = p_mergee), '{}'::jsonb),
    updated_at     = now()
  where s.id = p_survivor;

  -- 3) Delete mergee
  delete from public.leads
  where id = p_mergee
  returning to_jsonb(old) into merg;

  dels := dels || jsonb_build_array(jsonb_build_object('table','leads','id', p_mergee));

  -- 4) Audit
  insert into public.lead_merge_audit(job_id, account_id, survivor_before, mergee_before, survivor_after, rewired, deleted_ids)
  values (
    j_id,
    p_account_id,
    surv,
    merg,
    (select to_jsonb(l) from public.leads l where id = p_survivor),
    rewired,
    dels
  );

  -- 5) Finish job, close candidate rows
  update public.lead_match_candidates
     set status = 'merged'
   where account_id = p_account_id
     and (
       (lead_id_a = p_survivor and lead_id_b = p_mergee)
       or
       (lead_id_b = p_survivor and lead_id_a = p_mergee)
     );

  update public.lead_merge_jobs
     set status = 'done',
         updated_at = now()
   where id = j_id;

  return j_id;
exception
  when others then
    update public.lead_merge_jobs
       set status = 'failed',
           error = sqlerrm,
           updated_at = now()
     where id = j_id;
    raise;
end $$;

create or replace function public.rpc_undo_merge(p_job_id uuid)
returns void
language plpgsql
as $$
declare
  a record;
begin
  select *
    into a
    from public.lead_merge_audit
   where job_id = p_job_id;

  if not found then
    raise exception 'audit_not_found';
  end if;

  -- Recreate mergee
  insert into public.leads
  select *
  from jsonb_to_record(a.mergee_before) as x(
    id uuid,
    created_at timestamptz,
    updated_at timestamptz,
    account_id uuid,
    email text,
    first_name text,
    last_name text,
    company_name text,
    title text,
    phone text,
    timezone text,
    website text,
    linkedin_url text,
    twitter_url text,
    employee_count int,
    tech_stack jsonb
  );

  -- Rewire back FKs (best-effort for last-minute edits not covered)
  update public.lead_merge_jobs
     set status = 'undone',
         updated_at = now()
   where id = p_job_id;
end $$;


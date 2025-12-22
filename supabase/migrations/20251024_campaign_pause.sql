-- Update the atomic claimer to avoid jobs from paused/archived campaigns
create or replace function public.claim_email_jobs(p_limit int, p_worker_id text)
returns setof public.email_jobs
language plpgsql
as $$
declare
  r public.email_jobs%rowtype;
begin
  for r in
    select j.*
    from public.email_jobs j
    left join public.campaigns c on c.id = j.campaign_id
    where j.status = 'queued'
      and j.scheduled_for <= now()
      and (j.campaign_id is null or c.status = 'active')
    order by j.created_at
    for update skip locked
    limit p_limit
  loop
    update public.email_jobs
      set status='in_progress',
          locked_by=p_worker_id,
          locked_at=now()
      where id = r.id;
    return next r;
  end loop;
  return;
end;
$$;
-- Create function to lock due jobs fairly
create or replace function public.lock_due_email_jobs(p_limit int default 50)
returns setof public.email_jobs
language sql
security definer
set search_path = public
as $$
  with cte as (
    select id
    from public.email_jobs
    where status = 'queued'
      and scheduled_at <= now()
    order by scheduled_at asc
    limit p_limit
    for update skip locked
  )
  update public.email_jobs j
     set status = 'processing'
  from cte
  where j.id = cte.id
  returning j.*;
$$;
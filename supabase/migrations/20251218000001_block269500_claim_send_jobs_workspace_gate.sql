-- BLOCK 269500 — Enforce workspace-wide outreach_state at claim time
-- Prevents paused workspaces from having their send_queue jobs claimed (so resume is instant).

create or replace function public.claim_send_jobs(batch_size int default 50)
returns table (
  job_id uuid,
  workspace_id uuid,
  campaign_id uuid,
  lead_id uuid,
  subject text,
  body text,
  sender_account_id uuid,
  skip_reason text
)
language plpgsql
as $$
begin
  return query
  with cte as (
    select q.id
    from public.send_queue q
    left join public.leads l
      on l.id = q.lead_id
    left join public.workspaces w
      on w.id = q.workspace_id
    where q.status = 'pending'
      and coalesce(q.scheduled_at, now()) <= now()
      and coalesce(w.outreach_state, 'running') = 'running'
    order by
      (l.created_at >= now() - interval '7 days') desc nulls last,
      coalesce(q.priority, 0) desc,
      q.scheduled_at asc nulls first
    limit batch_size
    for update skip locked
  )
  update public.send_queue q
     set status = 'sending',
         processing_started_at = now(),
         last_attempt_at = now()
  from cte
  where q.id = cte.id
  returning
    q.id as job_id,
    q.workspace_id,
    q.campaign_id,
    q.lead_id,
    q.subject,
    q.body,
    q.sender_account_id,
    q.skip_reason;
end;
$$;

grant execute on function public.claim_send_jobs(int) to service_role;






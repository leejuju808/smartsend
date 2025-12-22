-- Provider accounts table (OAuth'd Gmail/Outlook accounts)
create table if not exists public.provider_accounts (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('gmail', 'outlook')),
  access_token text not null,
  refresh_token text,
  email_address text not null,
  settings jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Extend campaign_logs for job processing
alter table if exists public.campaign_logs
  add column if not exists attempt_count int default 0,
  add column if not exists next_attempt_at timestamptz default now(),
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by text,
  add column if not exists provider_account_id uuid references public.provider_accounts(id),
  add column if not exists to_email text,
  add column if not exists subject text,
  add column if not exists body_text text,
  add column if not exists body_html text,
  add column if not exists status text check (status in ('queued','sending','sent','failed'));

-- Add index for performance on ready jobs
create index if not exists idx_campaign_logs_ready
  on public.campaign_logs (status, next_attempt_at);

-- Atomic dequeue: claim up to N ready jobs with SKIP LOCKED-like semantics
create or replace function public.dequeue_campaign_logs(p_limit int, p_worker_id text)
returns setof public.campaign_logs
language plpgsql
security definer
as $$
declare
  v_now timestamptz := now();
begin
  return query
  with c as (
    select id
    from public.campaign_logs
    where status = 'queued'
      and next_attempt_at <= v_now
      and (locked_at is null or locked_at < v_now - interval '5 minutes')
    order by next_attempt_at asc, created_at asc
    limit p_limit
  )
  update public.campaign_logs cl
     set status = 'sending',
         locked_at = v_now,
         locked_by = p_worker_id,
         updated_at = v_now
  from c
  where cl.id = c.id
  returning cl.*;
end;
$$;

revoke all on function public.dequeue_campaign_logs(int, text) from public;
grant execute on function public.dequeue_campaign_logs(int, text) to service_role;

-- Atomic attempt bump helper
create or replace function public.bump_attempt_and_set(
  p_log_id uuid,
  p_status text,
  p_last_error text,
  p_next_attempt_at timestamptz
) returns void
language sql
security definer
as $fn$
  update public.campaign_logs
     set attempt_count = coalesce(attempt_count,0) + 1,
         status = p_status,
         last_error = p_last_error,
         next_attempt_at = p_next_attempt_at,
         updated_at = now(),
         locked_at = null,
         locked_by = null
   where id = p_log_id;
$fn$;

revoke all on function public.bump_attempt_and_set(uuid, text, text, timestamptz) from public;
grant execute on function public.bump_attempt_and_set(uuid, text, text, timestamptz) to service_role;

-- Update campaign_events to include meta for event details
alter table if exists public.campaign_events
  add column if not exists log_id uuid,
  add column if not exists meta jsonb default '{}';

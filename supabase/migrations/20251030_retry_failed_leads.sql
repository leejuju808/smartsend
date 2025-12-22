-- A) Ensure attempts tracking exists
alter table public.leads
  add column if not exists attempt integer not null default 0,
  add column if not exists max_attempts integer not null default 3,
  add column if not exists last_error text;

-- B) Helpful index for failed filters
create index if not exists leads_status_attempt_idx
  on public.leads (status, attempt, max_attempts, created_at desc);

-- C) Campaign logs
create table if not exists public.campaign_logs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  lead_id uuid not null,
  action text not null, -- e.g., 'retry_enqueued'
  meta jsonb,
  created_at timestamptz not null default now()
);

-- D) RPC: retry_failed_leads(lead_ids uuid[])
create or replace function public.retry_failed_leads(lead_ids uuid[])
returns table(lead_id uuid, new_status text, new_attempt int) 
language plpgsql
security definer
as $$
declare
  r record;
begin
  for r in
    select l.id, l.campaign_id, l.attempt, l.max_attempts
    from public.leads l
    where l.id = any(lead_ids)
      and l.status = 'failed'
      and l.attempt < l.max_attempts
  loop
    update public.leads
       set status = 'queued',
           attempt = r.attempt + 1,
           last_error = null,
           updated_at = now()
     where id = r.id;

    insert into public.campaign_logs (campaign_id, lead_id, action, meta)
    values (r.campaign_id, r.id, 'retry_enqueued', jsonb_build_object('attempt', r.attempt + 1));

    return query select r.id::uuid as lead_id, 'queued'::text as new_status, (r.attempt + 1)::int as new_attempt;
  end loop;

  return;
end $$;

-- E) Permissions
grant execute on function public.retry_failed_leads(uuid[]) to authenticated;

-- F) RLS basic policies (adjust to your tenant scoping as needed)
alter table public.leads enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='leads' and policyname='leads_read'
  ) then
    create policy "leads_read" on public.leads for select to authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='leads' and policyname='leads_retry_update'
  ) then
    create policy "leads_retry_update" on public.leads for update to authenticated using (true) with check (true);
  end if;
end$$;

-- Add attempts and last_send_at columns if not exist
alter table public.leads add column if not exists attempts int not null default 0;
alter table public.leads add column if not exists last_send_at timestamptz;

-- Add status check constraint (adjust list to your allowed statuses)
do $$
begin
  if not exists (
    select 1
    from   information_schema.table_constraints tc
    where  tc.table_schema = 'public'
    and    tc.table_name   = 'leads'
    and    tc.constraint_name = 'leads_status_chk'
  ) then
    alter table public.leads
      add constraint leads_status_chk
      check (status in ('new','queued','sending','sent','failed','replied'));
  end if;
end $$;

-- RPC: retry failed leads (guard max attempts)
create or replace function public.retry_failed_leads(ids uuid[], max_attempts int default 3)
returns table (lead_id uuid, new_status text, attempts int)
language plpgsql
security definer
as $$
begin
  return query
  update public.leads l
     set status = 'queued',
         attempts = l.attempts + 1,
         updated_at = now()
   where l.id = any(ids)
     and l.status = 'failed'
     and l.attempts < coalesce(max_attempts, 3)
  returning l.id, l.status, l.attempts;
end;
$$;

revoke all on function public.retry_failed_leads(uuid[], int) from public;
grant execute on function public.retry_failed_leads(uuid[], int) to anon, authenticated, service_role;

-- Optional: campaign_logs table for logging
create table if not exists public.campaign_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  campaign_id uuid,
  lead_id uuid not null,
  event text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

-- RPC: log retries
create or replace function public.log_retry_for_leads(ids uuid[], workspace uuid, campaign uuid)
returns void
language sql
security definer
as $$
  insert into public.campaign_logs (workspace_id, campaign_id, lead_id, event, meta)
  select workspace, campaign, l.id, 'retry_queued', jsonb_build_object('attempts', l.attempts)
  from public.leads l
  where l.id = any(ids);
$$;

revoke all on function public.log_retry_for_leads(uuid[], uuid, uuid) from public;
grant execute on function public.log_retry_for_leads(uuid[], uuid, uuid) to anon, authenticated, service_role;



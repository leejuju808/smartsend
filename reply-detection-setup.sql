-- 0) DB: minimal guardrails (run in Supabase SQL)

-- 0.1 Ensure statuses enum has 'replied'

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_enum e on t.oid = e.enumtypid
    where t.typname = 'lead_status' and e.enumlabel = 'replied'
  ) then
    alter type lead_status add value if not exists 'replied';
  end if;
end$$;


-- 0.2 Add replied_at for auditing
alter table public.leads
  add column if not exists replied_at timestamptz;


-- 0.3 Simple campaign_logs table (for timeline/events)
create table if not exists public.campaign_logs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  lead_id uuid not null,
  type text not null check (type in ('queued','sent','failed','replied','system')),
  message text,
  meta jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);


-- 0.4 Optional: a simple scheduled/queued sends table if you use it
-- (Skip if you already have an equivalent.)
create table if not exists public.send_queue (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  lead_id uuid not null,
  attempt int not null default 0,
  status text not null check (status in ('queued','sending','sent','failed','canceled')),
  scheduled_at timestamptz default now(),
  created_at timestamptz not null default now()
);


-- 0.5 Indexes you’ll appreciate
create index if not exists send_queue_lead_status_idx on public.send_queue (lead_id, status);
create index if not exists campaign_logs_campaign_created_idx on public.campaign_logs (campaign_id, created_at desc);


-- Optional helper RPC to cancel future sends for a lead:
create or replace function public.cancel_future_sends(p_lead_id uuid)
returns int
language sql
security definer
as $$
  update public.send_queue
     set status = 'canceled'
   where lead_id = p_lead_id
     and status in ('queued','sending')
  returning 1;
$$;

grant execute on function public.cancel_future_sends(uuid) to anon, authenticated, service_role;
















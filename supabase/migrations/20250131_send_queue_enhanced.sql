-- Send Queue Enhanced: Robust queue system with locking, retries, and worker management
-- This builds on the existing send_queue table or creates it if it doesn't exist

-- Create or update send_queue table with full schema
create table if not exists public.send_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  recipient_id uuid, -- optional if you have a recipients table
  to_email text not null,
  subject text not null,
  body_html text not null,
  provider text not null default 'gmail' check (provider in ('gmail', 'outlook', 'smtp')),
  status text not null default 'pending' check (status in ('pending', 'locked', 'sent', 'failed')),
  attempts int not null default 0,
  last_error text,
  scheduled_at timestamptz not null default now(),
  locked_at timestamptz,
  worker_id uuid,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- Add columns if they don't exist (for existing send_queue tables)
do $$
begin
  -- Add columns if they don't exist
  if not exists (select 1 from information_schema.columns where table_name='send_queue' and column_name='user_id') then
    alter table public.send_queue add column user_id uuid references auth.users(id) on delete cascade;
  end if;
  
  if not exists (select 1 from information_schema.columns where table_name='send_queue' and column_name='campaign_id') then
    alter table public.send_queue add column campaign_id uuid references public.campaigns(id) on delete cascade;
  end if;
  
  if not exists (select 1 from information_schema.columns where table_name='send_queue' and column_name='provider') then
    alter table public.send_queue add column provider text not null default 'gmail' check (provider in ('gmail', 'outlook', 'smtp'));
  end if;
  
  if not exists (select 1 from information_schema.columns where table_name='send_queue' and column_name='status') then
    alter table public.send_queue add column status text not null default 'pending' check (status in ('pending', 'locked', 'sent', 'failed'));
  end if;
  
  if not exists (select 1 from information_schema.columns where table_name='send_queue' and column_name='attempts') then
    alter table public.send_queue add column attempts int not null default 0;
  end if;
  
  if not exists (select 1 from information_schema.columns where table_name='send_queue' and column_name='last_error') then
    alter table public.send_queue add column last_error text;
  end if;
  
  if not exists (select 1 from information_schema.columns where table_name='send_queue' and column_name='locked_at') then
    alter table public.send_queue add column locked_at timestamptz;
  end if;
  
  if not exists (select 1 from information_schema.columns where table_name='send_queue' and column_name='worker_id') then
    alter table public.send_queue add column worker_id uuid;
  end if;
  
  if not exists (select 1 from information_schema.columns where table_name='send_queue' and column_name='sent_at') then
    alter table public.send_queue add column sent_at timestamptz;
  end if;
  
  if not exists (select 1 from information_schema.columns where table_name='send_queue' and column_name='created_at') then
    alter table public.send_queue add column created_at timestamptz not null default now();
  end if;
end $$;

-- Create indexes
create index if not exists idx_send_queue_status_sched
  on public.send_queue (status, scheduled_at);

create index if not exists idx_send_queue_user
  on public.send_queue (user_id);

create index if not exists idx_send_queue_campaign
  on public.send_queue (campaign_id);

-- Enable RLS
alter table public.send_queue enable row level security;

-- Policies (owner = campaign owner = user_id)
drop policy if exists "queue_select_own" on public.send_queue;
create policy "queue_select_own"
  on public.send_queue for select
  using (auth.uid() = user_id);

drop policy if exists "queue_insert_own" on public.send_queue;
create policy "queue_insert_own"
  on public.send_queue for insert
  with check (auth.uid() = user_id);

drop policy if exists "queue_update_own" on public.send_queue;
create policy "queue_update_own"
  on public.send_queue for update
  using (auth.uid() = user_id);

-- Allow service role to update for processing
drop policy if exists "queue_service_update" on public.send_queue;
create policy "queue_service_update"
  on public.send_queue for update
  to service_role
  using (true)
  with check (true);

-- Atomic claim function: grabs N due jobs and locks them
create or replace function public.claim_send_jobs(p_user_id uuid, p_limit int, p_worker_id uuid)
returns setof public.send_queue
language plpgsql
as $$
  declare
    locked_count int;
  begin
    update public.send_queue sq
    set status = 'locked',
        locked_at = now(),
        worker_id = p_worker_id
    where sq.id in (
      select id from public.send_queue
      where status = 'pending'
        and scheduled_at <= now()
        and user_id = p_user_id
      order by scheduled_at asc
      limit p_limit
      for update skip locked
    );
    
    return query
      select * from public.send_queue
      where worker_id = p_worker_id
        and status = 'locked'
        and locked_at >= now() - interval '1 minute';
  end;
$$;

-- Grant execute permission
grant execute on function public.claim_send_jobs(uuid, int, uuid) to service_role;

-- Mark job success
create or replace function public.mark_job_sent(p_id uuid)
returns void
language plpgsql
as $$ 
  update public.send_queue 
  set status='sent', sent_at=now(), locked_at=null, worker_id=null
  where id=p_id; 
$$;

-- Grant execute permission
grant execute on function public.mark_job_sent(uuid) to service_role;

-- Mark job failure with retry logic
create or replace function public.mark_job_failed(p_id uuid, p_error text)
returns void
language plpgsql
as $$
  declare
    attempt_count int;
  begin
    select attempts into attempt_count from public.send_queue where id = p_id;
    
    update public.send_queue
    set status = case when attempt_count >= 4 then 'failed' else 'pending' end,
        attempts = attempt_count + 1,
        last_error = p_error,
        locked_at = null,
        worker_id = null,
        scheduled_at = case 
          when attempt_count >= 4 then scheduled_at 
          else now() + interval '10 minutes' 
        end
    where id = p_id;
  end;
$$;

-- Grant execute permission
grant execute on function public.mark_job_failed(uuid, text) to service_role;

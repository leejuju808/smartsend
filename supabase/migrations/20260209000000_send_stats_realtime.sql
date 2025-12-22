-- Send Stats Realtime: Indexes, RLS, RPC, and Realtime for Send Stats Dashboard

-- ============================================================================
-- 1. INDEXES (fast queries)
-- ============================================================================

-- speeds due lookups
create index if not exists idx_send_queue_status_sched on public.send_queue(status, scheduled_at);

-- speeds user-scoped log queries
create index if not exists idx_send_logs_user_sent on public.send_logs(user_id, sent_at);
create index if not exists idx_send_logs_status on public.send_logs(status);

-- ============================================================================
-- 2. ENABLE REALTIME on tables
-- ============================================================================

-- allow realtime broadcasts for these tables
alter publication supabase_realtime add table public.send_logs;
alter publication supabase_realtime add table public.send_queue;

-- ============================================================================
-- 3. RLS (ensure user can only see their own)
-- ============================================================================

-- send_logs
alter table public.send_logs enable row level security;

-- Add user-based read policy if user_id column exists
drop policy if exists sel_send_logs_user on public.send_logs;
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'send_logs' 
    and column_name = 'user_id'
  ) then
    execute 'create policy sel_send_logs_user on public.send_logs for select using (user_id = auth.uid())';
  end if;
end $$;

-- send_queue
alter table public.send_queue enable row level security;

-- Add user-based read policy if user_id column exists
drop policy if exists sel_send_queue_user on public.send_queue;
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'send_queue' 
    and column_name = 'user_id'
  ) then
    execute 'create policy sel_send_queue_user on public.send_queue for select using (user_id = auth.uid())';
  end if;
end $$;

-- ============================================================================
-- 4. RPC: compact stats in one call (user-scoped via RLS)
-- ============================================================================

create or replace function public.get_send_stats()
returns table (
  sent_today integer,
  sent_total integer,
  failed_today integer,
  queue_pending integer,
  next_send_at timestamptz
) language plpgsql stable as $$
declare
  v_sent_today integer;
  v_sent_total integer;
  v_failed_today integer;
  v_queue_pending integer;
  v_next_send_at timestamptz;
  v_today timestamptz;
begin
  v_today := date_trunc('day', now());

  -- sent_today and sent_total from send_logs
  select count(*) into v_sent_today
  from public.send_logs l
  where l.user_id = auth.uid()
    and l.status = 'sent'
    and l.sent_at >= v_today;

  select count(*) into v_sent_total
  from public.send_logs l
  where l.user_id = auth.uid()
    and l.status = 'sent';

  -- failed_today from send_logs
  select count(*) into v_failed_today
  from public.send_logs l
  where l.user_id = auth.uid()
    and l.status = 'failed'
    and l.sent_at >= v_today;

  -- queue_pending - check for both status values
  select count(*) into v_queue_pending
  from public.send_queue q
  where q.user_id = auth.uid()
    and q.status in ('pending', 'queued');

  -- next_send_at - use COALESCE to handle both scheduled_at and scheduled_for
  -- Will use whichever column exists
  select min(COALESCE(q.scheduled_at, q.scheduled_for)) into v_next_send_at
  from public.send_queue q
  where q.user_id = auth.uid()
    and q.status in ('pending', 'queued')
    and COALESCE(q.scheduled_at, q.scheduled_for) is not null;

  return query select v_sent_today, v_sent_total, v_failed_today, v_queue_pending, v_next_send_at;
end;
$$;


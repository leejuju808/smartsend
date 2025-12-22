-- SmartSend Warm-Up System
-- Automatically "warm" new sending accounts by exchanging friendly messages
-- Builds domain reputation and improves inbox placement

-- 1. Add health_score to sender_profiles if missing
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_name = 'sender_profiles' and column_name = 'health_score'
  ) then
    alter table public.sender_profiles 
    add column health_score numeric(5,2) default 100.0 check (health_score >= 0 and health_score <= 100);
    
    create index if not exists idx_sender_profiles_health on public.sender_profiles(health_score);
  end if;
end $$;

-- 2. Warmup Sessions Table
create table if not exists public.warmup_sessions (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null unique references public.sender_profiles(id) on delete cascade,
  active boolean not null default true,
  started_at timestamptz not null default now(),
  last_sent_at timestamptz,
  daily_target int not null default 5,
  total_sent int not null default 0
);

-- Indexes for warmup_sessions
create index if not exists idx_warmup_sessions_sender on public.warmup_sessions(sender_id);
create index if not exists idx_warmup_sessions_active on public.warmup_sessions(active) where active = true;

-- 3. Warmup Logs Table
create table if not exists public.warmup_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.warmup_sessions(id) on delete cascade,
  to_email text not null,
  subject text not null,
  body text not null,
  sent_at timestamptz default now(),
  status text default 'sent' check (status in ('sent', 'failed', 'bounced'))
);

-- Indexes for warmup_logs
create index if not exists idx_warmup_logs_session on public.warmup_logs(session_id);
create index if not exists idx_warmup_logs_sent_at on public.warmup_logs(sent_at);
create index if not exists idx_warmup_logs_status on public.warmup_logs(status);

-- 4. Enable RLS
alter table public.warmup_sessions enable row level security;
alter table public.warmup_logs enable row level security;

-- 5. RLS Policies
-- Users can only see their own warmup sessions
drop policy if exists "own warmup" on public.warmup_sessions;
create policy "own warmup" on public.warmup_sessions
  for all using (
    exists (
      select 1 from public.sender_profiles s 
      where s.id = warmup_sessions.sender_id 
      and s.user_id = auth.uid()
    )
  );

-- Users can only see logs for their warmup sessions
drop policy if exists "own warmup logs" on public.warmup_logs;
create policy "own warmup logs" on public.warmup_logs
  for select using (
    exists (
      select 1 from public.warmup_sessions ws 
      join public.sender_profiles sp on ws.sender_id = sp.id
      where ws.id = warmup_logs.session_id 
      and sp.user_id = auth.uid()
    )
  );

-- Service role can manage all warmup data
drop policy if exists "service_role_warmup" on public.warmup_sessions;
create policy "service_role_warmup" on public.warmup_sessions
  for all to service_role using (true) with check (true);

drop policy if exists "service_role_warmup_logs" on public.warmup_logs;
create policy "service_role_warmup_logs" on public.warmup_logs
  for all to service_role using (true) with check (true);


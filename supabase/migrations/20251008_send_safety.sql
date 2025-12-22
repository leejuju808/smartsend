-- Core senders table
create table if not exists public.senders (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid references profiles(id) on delete cascade not null,
  from_email text not null,
  provider text, -- 'smtp', 'resend', 'ses', etc.
  status text not null default 'active', -- 'active' | 'paused' | 'warming'
  base_daily_limit integer not null default 20,   -- starting warmup daily cap
  target_daily_limit integer not null default 200, -- max daily once warmed
  hourly_limit integer not null default 30,       -- cap per rolling hour
  warmup_increment integer not null default 10,   -- daily growth toward target
  created_at timestamptz not null default now(),
  unique(profile_id, from_email)
);

-- Track per-day stats to compute warmup quota
create table if not exists public.sender_stats (
  id uuid primary key default uuid_generate_v4(),
  sender_id uuid references public.senders(id) on delete cascade not null,
  stat_date date not null,                    -- YYYY-MM-DD
  sent_count integer not null default 0,
  bounced_count integer not null default 0,
  last_sent_at timestamptz,
  unique(sender_id, stat_date)
);

-- Record bounces (hooked via provider webhooks)
create table if not exists public.bounces (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid references profiles(id) on delete cascade not null,
  sender_id uuid references public.senders(id) on delete set null,
  email text not null,
  reason text,
  created_at timestamptz not null default now()
);

-- Ensure suppressions exists (from previous slice)
create table if not exists public.suppressions (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid references profiles(id) on delete cascade,
  email text unique not null,
  reason text default 'user_suppressed',
  created_at timestamptz default now()
);

-- messages table (minimal fields if not present)
create table if not exists public.messages (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid references profiles(id) on delete cascade not null,
  sender_id uuid references public.senders(id) on delete set null,
  to_email text not null,
  subject text,
  body text,
  status text not null default 'queued', -- queued|sent|bounced|failed
  created_at timestamptz not null default now()
);

-- RLS
alter table public.senders enable row level security;
alter table public.sender_stats enable row level security;
alter table public.bounces enable row level security;
alter table public.messages enable row level security;

-- Policies (owner = profile_id via profiles.id)
create policy "own senders" on public.senders
  for all using (auth.uid() = profile_id);

create policy "own sender_stats" on public.sender_stats
  for select using (
    exists (
      select 1 from public.senders s
      where s.id = sender_id and s.profile_id = auth.uid()
    )
  );

create policy "own bounces" on public.bounces
  for all using (auth.uid() = profile_id);

create policy "own messages" on public.messages
  for all using (auth.uid() = profile_id);

-- Helper function: get today's warmed daily cap for a sender
drop function if exists public.get_warmed_daily_cap(uuid);
create or replace function public.get_warmed_daily_cap(p_sender_id uuid)
returns integer
language plpgsql
security definer
as $$
declare
  v_created date;
  v_base int;
  v_target int;
  v_inc int;
  v_days int;
  v_cap int;
begin
  select s.created_at::date, s.base_daily_limit, s.target_daily_limit, s.warmup_increment
    into v_created, v_base, v_target, v_inc
  from public.senders s
  where s.id = p_sender_id;

  if v_created is null then
    return 20;
  end if;

  v_days := greatest(0, (current_date - v_created));
  v_cap := v_base + v_days * v_inc;
  if v_cap > v_target then
    v_cap := v_target;
  end if;
  return v_cap;
end;
$$;

-- Helpful indexes
create index if not exists idx_sender_stats_sender_date on public.sender_stats(sender_id, stat_date);
create index if not exists idx_bounces_profile_email on public.bounces(profile_id, email);
create index if not exists idx_suppressions_profile_email on public.suppressions(profile_id, email);
create index if not exists idx_messages_profile_status on public.messages(profile_id, status);

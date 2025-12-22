-- Per-account sending policy

create table if not exists public.sending_policies (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  timezone text not null default 'America/Los_Angeles',
  daily_cap int not null default 150,
  hourly_cap int not null default 20,
  warmup_enabled boolean not null default true,
  warmup_day_1 int not null default 10,
  warmup_growth int not null default 1, -- +1 email/day until daily_cap
  quiet_hours_start int not null default 20, -- 20:00 local
  quiet_hours_end int not null default 7,   -- 07:00 local
  send_weekends boolean not null default false,
  created_at timestamptz not null default now(),
  unique (account_id)
);

-- Rolling counters per day/hour for each account (reset by date)
create table if not exists public.send_counters (
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  ymd date not null,
  hour int not null, -- 0..23 local hour
  sent int not null default 0,
  primary key (account_id, ymd, hour)
);

-- Global suppression list (workspace-level)
create table if not exists public.suppression (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  email text not null,
  reason text not null check (reason in ('unsubscribe','bounce','manual')),
  created_at timestamptz not null default now(),
  unique (workspace_id, email)
);

-- Public unsubscribe tokens
create table if not exists public.unsubscribe_tokens (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  lead_id uuid not null,
  email text not null,
  token text not null unique,
  created_at timestamptz not null default now()
);

-- Helpful indexes
create index if not exists idx_suppression_ws_email on public.suppression(workspace_id, email);
create index if not exists idx_unsub_tokens_token on public.unsubscribe_tokens(token);
create index if not exists idx_unsub_tokens_lead on public.unsubscribe_tokens(lead_id);
create index if not exists idx_send_counters_account_ymd on public.send_counters(account_id, ymd);

-- RLS: keep it simple if you're using service role for server routes
alter table public.suppression enable row level security;
create policy suppression_ws_read on public.suppression
for select using (true);
create policy suppression_ws_insert on public.suppression
for insert with check (true);

alter table public.sending_policies enable row level security;
create policy sending_policies_select on public.sending_policies for select using (true);
create policy sending_policies_upsert on public.sending_policies for insert with check (true);

alter table public.send_counters enable row level security;
create policy send_counters_rw on public.send_counters for all using (true) with check (true);

alter table public.unsubscribe_tokens enable row level security;
create policy unsubscribe_tokens_select on public.unsubscribe_tokens for select using (true);


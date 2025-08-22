-- CAMPAIGNS
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  subject text not null,
  body_html text not null,
  from_name text,
  from_email text,
  segment jsonb not null,
  status text not null default 'draft' check (status in ('draft','running','paused','done','canceled')),
  total int not null default 0,
  sent int not null default 0,
  failed int not null default 0,
  skipped int not null default 0,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index if not exists idx_campaigns_user on public.campaigns (user_id, created_at desc);
alter table public.campaigns enable row level security;
create policy if not exists "campaigns_select_own" on public.campaigns for select using (auth.uid() = user_id);
create policy if not exists "campaigns_insert_own" on public.campaigns for insert with check (auth.uid() = user_id);
create policy if not exists "campaigns_update_own" on public.campaigns for update using (auth.uid() = user_id);

-- RECIPIENT QUEUE
create table if not exists public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  email_lower citext not null,
  name text,
  status text not null default 'queued' check (status in ('queued','sent','failed','skipped')),
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists uniq_campaign_recipient on public.campaign_recipients (campaign_id, email_lower);
create index if not exists idx_campaign_recipients_status on public.campaign_recipients (campaign_id, status);
alter table public.campaign_recipients enable row level security;
create policy if not exists "camp_recips_own" on public.campaign_recipients for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- UNSUB TOKENS
create table if not exists public.unsub_tokens (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.unsub_tokens enable row level security;
create policy if not exists "unsub_tokens_own" on public.unsub_tokens for all using (auth.uid() = user_id) with check (auth.uid() = user_id);


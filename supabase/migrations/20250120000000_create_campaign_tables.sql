-- campaigns (compatible with existing system)
create table if not exists public.campaigns_new (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  subject text not null,
  from_email text not null,
  body_text text,
  body_html text,
  status text not null default 'draft', -- draft|preparing|ready|sending|paused|completed|cancelled
  total_recipients int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- recipients (compatible with existing system)
create table if not exists public.campaign_recipients_new (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns_new(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  email citext not null,
  name text,
  company text,
  status text not null default 'pending', -- pending|suppressed|skipped|sent|failed|cancelled
  last_error text,
  sent_at timestamptz,
  retry_count int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (campaign_id, email)
);

create index if not exists cr_campaign_idx on public.campaign_recipients_new (campaign_id);
create index if not exists cr_status_idx on public.campaign_recipients_new (status);
create index if not exists cr_email_idx on public.campaign_recipients_new (email);
create index if not exists cr_user_idx on public.campaign_recipients_new (user_id);

-- touch updated_at
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_campaigns_new_touch on public.campaigns_new;
create trigger trg_campaigns_new_touch before update on public.campaigns_new
for each row execute function public.touch_updated_at();

drop trigger if exists trg_cr_new_touch on public.campaign_recipients_new;
create trigger trg_cr_new_touch before update on public.campaign_recipients_new
for each row execute function public.touch_updated_at();

-- Enable RLS
alter table public.campaigns_new enable row level security;
alter table public.campaign_recipients_new enable row level security;

-- RLS policies
create policy if not exists "campaigns_new_select_own" on public.campaigns_new for select using (auth.uid() = user_id);
create policy if not exists "campaigns_new_insert_own" on public.campaigns_new for insert with check (auth.uid() = user_id);
create policy if not exists "campaigns_new_update_own" on public.campaigns_new for update using (auth.uid() = user_id);

create policy if not exists "campaign_recipients_new_select_own" on public.campaign_recipients_new for select using (auth.uid() = user_id);
create policy if not exists "campaign_recipients_new_insert_own" on public.campaign_recipients_new for insert with check (auth.uid() = user_id);
create policy if not exists "campaign_recipients_new_update_own" on public.campaign_recipients_new for update using (auth.uid() = user_id); 
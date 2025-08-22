alter table public.campaign_recipients add column if not exists open_count int default 0;
alter table public.campaign_recipients add column if not exists click_count int default 0;
alter table public.campaign_recipients add column if not exists last_open_at timestamptz;
alter table public.campaign_recipients add column if not exists last_click_at timestamptz;

create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  recipient_id uuid not null references public.campaign_recipients(id) on delete cascade,
  type text not null check (type in ('open','click')),
  url text,
  ua text,
  ip inet,
  created_at timestamptz not null default now()
);
create index if not exists idx_email_events_camp_type on public.email_events (campaign_id, type, created_at desc);

alter table public.email_events enable row level security;
create policy if not exists "email_events_select_own"
on public.email_events for select
using (auth.uid() = user_id);


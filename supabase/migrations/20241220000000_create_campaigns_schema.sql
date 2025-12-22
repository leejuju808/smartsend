-- 00_campaigns.sql
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,                 -- auth.uid()
  name text not null,                    -- e.g., "Outreach v1 - RevOps"
  subject text not null,                 -- initial email subject
  status text not null default 'draft',  -- 'draft' | 'scheduled' | 'sending' | 'paused' | 'sent' | 'archived'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaign_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,                 -- redundant for RLS shortcut
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  position int not null,                 -- 0 = initial, 1..n followups
  label text not null,                   -- 'initial' | 'followup-1' | 'followup-2' | ...
  day_offset int not null default 0,     -- when to send relative to initial
  body text not null
);

create table if not exists public.recipients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  email text not null,
  name text,
  status text not null default 'pending' -- 'pending' | 'queued' | 'sent' | 'bounced' | 'unsubscribed'
);

-- helpful update trigger
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists trg_campaigns_touch on public.campaigns;
create trigger trg_campaigns_touch
before update on public.campaigns
for each row execute function public.touch_updated_at();

-- RLS: lock to user_id
alter table public.campaigns enable row level security;
alter table public.campaign_messages enable row level security;
alter table public.recipients enable row level security;

-- Policies
create policy "campaigns_select_own"
on public.campaigns for select
using (user_id = auth.uid());

create policy "campaigns_insert_own"
on public.campaigns for insert
with check (user_id = auth.uid());

create policy "campaigns_update_own"
on public.campaigns for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "campaigns_delete_own"
on public.campaigns for delete
using (user_id = auth.uid());

create policy "messages_select_own"
on public.campaign_messages for select
using (user_id = auth.uid());

create policy "messages_insert_own"
on public.campaign_messages for insert
with check (user_id = auth.uid());

create policy "messages_update_own"
on public.campaign_messages for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "messages_delete_own"
on public.campaign_messages for delete
using (user_id = auth.uid());

create policy "recipients_select_own"
on public.recipients for select
using (user_id = auth.uid());

create policy "recipients_insert_own"
on public.recipients for insert
with check (user_id = auth.uid());

create policy "recipients_update_own"
on public.recipients for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "recipients_delete_own"
on public.recipients for delete
using (user_id = auth.uid());
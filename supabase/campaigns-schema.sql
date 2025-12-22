-- CAMPAIGNS & MESSAGES QUEUE SCHEMA
-- Paste this into your Supabase SQL Editor and run it

-- CAMPAIGNS
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sender_email text not null,            -- mailbox used for this campaign
  subject_template text not null,
  body_template text not null,           -- simple handlebars-style {{first_name}} etc.
  created_at timestamptz default now(),
  launched_at timestamptz,
  created_by uuid,                       -- auth.users.id (optional placeholder)
  status text default 'draft'            -- draft | running | paused | completed
);

-- MESSAGES (queue)
create type message_status as enum ('pending','sending','sent','failed','skipped');
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  recipient_email text not null,
  payload jsonb,                         -- captured personalized fields used for templating
  status message_status not null default 'pending',
  last_error text,
  provider_message_id text,
  attempted_at timestamptz,
  sent_at timestamptz,
  skipped_reason text                    -- e.g. suppression, cap reached, bounce_guard
);

create index if not exists messages_campaign_status_idx on public.messages (campaign_id, status);

-- Ensure RLS on read; inserts/updates by service role (API)
alter table public.campaigns enable row level security;
alter table public.messages enable row level security;

create policy "campaigns read auth" on public.campaigns for select to authenticated using (true);
create policy "messages read auth" on public.messages for select to authenticated using (true);

create policy "campaigns write service" on public.campaigns for insert to service_role with check (true);
create policy "messages write service" on public.messages for insert to service_role with check (true);
create policy "messages update service" on public.messages for update to service_role using (true) with check (true);

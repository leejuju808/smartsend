-- Email tracking with events: Add tracking columns to send_logs and create email_events table
-- Part 1: Add identifiers to tie events back to a send

alter table public.send_logs
  add column if not exists message_id text,                 -- provider message id (optional)
  add column if not exists tracking_token uuid,
  add column if not exists opened_at timestamptz,
  add column if not exists open_count int default 0,
  add column if not exists clicks_count int default 0;

-- Part 2: Create email_events table for detailed tracking
create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  send_log_id uuid references public.send_logs(id) on delete cascade,
  event_type text not null check (event_type in ('open','click')),
  occurred_at timestamptz not null default now(),
  user_agent text,
  ip inet,
  url text
);

-- Part 3: Create indexes for performance
create index if not exists idx_email_events_send on public.email_events(send_log_id, event_type, occurred_at desc);
create index if not exists idx_send_logs_token on public.send_logs(tracking_token);
create index if not exists idx_send_logs_opened_at on public.send_logs(opened_at);

-- Part 4: Helper RPC function to resolve send by token
create or replace function public.find_send_by_token(tok uuid)
returns table (
  send_log_id uuid,
  user_id uuid,
  campaign_id uuid,
  lead_id uuid
) language sql stable as $$
  select sl.id, sl.user_id, sl.campaign_id, sl.lead_id
  from public.send_logs sl
  where sl.tracking_token = tok
$$;

-- Part 5: Atomic open and click counter RPCs
create or replace function public.increment_opens_if_needed(sid uuid)
returns void language plpgsql as $$
begin
  update public.send_logs
     set open_count = coalesce(open_count,0) + 1,
         opened_at = coalesce(opened_at, now())
   where id = sid;
end $$;

create or replace function public.increment_clicks_if_needed(sid uuid)
returns void language sql as $$
  update public.send_logs
     set clicks_count = coalesce(clicks_count,0) + 1
   where id = sid;
$$;

-- Part 6: RLS policies for email_events
alter table public.email_events enable row level security;

-- Allow service role to insert events
drop policy if exists "email_events_insert_service" on public.email_events;
create policy "email_events_insert_service" on public.email_events
  for insert to service_role
  using (true) with check (true);

-- Allow users to read their own events
drop policy if exists "email_events_select_own" on public.email_events;
create policy "email_events_select_own" on public.email_events
  for select
  using (
    user_id = auth.uid()
    or campaign_id in (
      select id from public.campaigns
      where workspace_id in (
        select workspace_id from public.workspace_members
        where user_id = auth.uid()
      )
    )
  );

-- Grant execute permissions on RPC functions
grant execute on function public.find_send_by_token(uuid) to anon, authenticated, service_role;
grant execute on function public.increment_opens_if_needed(uuid) to anon, authenticated, service_role;
grant execute on function public.increment_clicks_if_needed(uuid) to anon, authenticated, service_role;

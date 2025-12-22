-- Message sent to a lead (one row per actual send)
create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  campaign_id uuid not null,
  lead_id uuid not null,
  subject text not null,
  body_html text,                     -- stored copy of sent html (optional)
  provider_message_id text,           -- Gmail/Outlook id if available
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Events: open / click / bounce (reply is handled elsewhere but we include type for completeness)
create type if not exists email_event_type as enum ('open','click','bounce','reply');

create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.email_messages(id) on delete cascade,
  type email_event_type not null,
  url text,                           -- for clicks
  user_agent text,
  ip inet,
  created_at timestamptz not null default now()
);

create index if not exists idx_email_events_message_id on public.email_events (message_id);
create index if not exists idx_email_messages_workspace on public.email_messages (workspace_id, campaign_id, lead_id);

-- RLS policies
alter table public.email_messages enable row level security;
alter table public.email_events enable row level security;

-- Email messages policies
create policy "Users can view email messages in their workspace" on public.email_messages
  for select using (workspace_id = (request.jwt() ->> 'workspace_id')::uuid);

create policy "Service role can insert email messages" on public.email_messages
  for insert with check (true);

create policy "Service role can update email messages" on public.email_messages
  for update using (true);

-- Email events policies
create policy "Users can view email events for their workspace messages" on public.email_events
  for select using (
    message_id in (
      select id from public.email_messages 
      where workspace_id = (request.jwt() ->> 'workspace_id')::uuid
    )
  );

create policy "Service role can insert email events" on public.email_events
  for insert with check (true);
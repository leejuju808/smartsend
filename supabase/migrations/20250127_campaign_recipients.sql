-- Campaign Recipients Migration
-- Creates table for managing individual campaign recipients and send queue

-- 02_campaign_recipients.sql
create table if not exists public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  recipient text not null,
  subject text not null,
  body text not null,
  variables jsonb default '{}'::jsonb,
  scheduled_at timestamptz not null, -- per-recipient override; default to campaign.scheduled_for
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed')),
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists recips_campaign_idx on public.campaign_recipients (campaign_id);
create index if not exists recips_due_idx on public.campaign_recipients (status, scheduled_at);
create index if not exists recips_status_idx on public.campaign_recipients (status);

-- Enable RLS
alter table public.campaign_recipients enable row level security;

-- RLS policies for campaign_recipients (via campaign workspace_id)
create policy "campaign_recipients_select_workspace" on public.campaign_recipients
  for select using (
    exists (
      select 1 from public.campaigns c 
      where c.id = campaign_id 
      and c.workspace_id = (auth.jwt() ->> 'workspace_id')::uuid
    )
  );

create policy "campaign_recipients_insert_workspace" on public.campaign_recipients
  for insert with check (
    exists (
      select 1 from public.campaigns c 
      where c.id = campaign_id 
      and c.workspace_id = (auth.jwt() ->> 'workspace_id')::uuid
    )
  );

create policy "campaign_recipients_update_workspace" on public.campaign_recipients
  for update using (
    exists (
      select 1 from public.campaigns c 
      where c.id = campaign_id 
      and c.workspace_id = (auth.jwt() ->> 'workspace_id')::uuid
    )
  );

create policy "campaign_recipients_delete_workspace" on public.campaign_recipients
  for delete using (
    exists (
      select 1 from public.campaigns c 
      where c.id = campaign_id 
      and c.workspace_id = (auth.jwt() ->> 'workspace_id')::uuid
    )
  );

-- Enable Realtime for campaign_recipients
alter publication supabase_realtime add table public.campaign_recipients;
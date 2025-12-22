-- SmartSend — Auto-Reply Engine (Auto-Reply + ICS + Calendly)
-- This migration adds the auto-reply system that detects meeting intent and sends
-- automatic replies with Calendly links and ICS attachments

-- Extensions (if not already enabled)
create extension if not exists citext;

-- 1. AUTO REPLIES TABLE
create table if not exists public.auto_replies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  inbound_id uuid not null references public.inbound_messages(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'sent', 'error', 'skipped')),
  reason text, -- why skipped/error
  subject text,
  html text,
  text text,
  ics_filename text,
  ics_content text, -- raw .ics text stored for auditing
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- Indexes for performance
create index if not exists idx_auto_replies_workspace_created on public.auto_replies(workspace_id, created_at desc);
create index if not exists idx_auto_replies_inbound on public.auto_replies(inbound_id);
create index if not exists idx_auto_replies_status on public.auto_replies(status);

-- 2. RLS Policies
alter table public.auto_replies enable row level security;

-- Workspace member access policy
create policy if not exists "auto_replies_workspace_member" on public.auto_replies
  for all using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = auto_replies.workspace_id
      and wm.user_id = auth.uid()
    )
  );

-- 3. Helper function for workspace context (if not exists)
create or replace function app.set_workspace(id uuid)
returns void language sql as $$ 
  select set_config('app.workspace_id', id::text, true); 
$$;

-- 4. Add any missing columns to existing inbound_messages if needed
alter table if exists public.inbound_messages 
add column if not exists provider text default 'generic',
add column if not exists headers jsonb default '{}'::jsonb;

-- 5. Create a view for easy querying of auto-reply status
create or replace view public.auto_reply_summary as
select 
  im.id as inbound_id,
  im.from_email,
  im.from_name,
  im.subject as inbound_subject,
  im.created_at as received_at,
  ar.id as reply_id,
  ar.status as reply_status,
  ar.reason as reply_reason,
  ar.sent_at,
  ar.ics_filename,
  case 
    when ar.status = 'sent' then '✅ Auto-replied'
    when ar.status = 'draft' then '📝 Draft saved'
    when ar.status = 'skipped' then '⏭️ Skipped'
    when ar.status = 'error' then '❌ Error'
    else '❓ Unknown'
  end as status_display
from public.inbound_messages im
left join public.auto_replies ar on ar.inbound_id = im.id
order by im.created_at desc;

-- Grant access to the view
grant select on public.auto_reply_summary to authenticated; 
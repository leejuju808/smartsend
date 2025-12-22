-- Block 8300 — Reply Detection Engine (Inbound Email → Auto-Mark As Replied)
-- This migration creates the foundation for auto-detecting replies and marking leads as replied
-- when inbound emails are received via Gmail/Outlook webhooks

-- ============================================
-- 1) DB: Table for inbound messages
-- ============================================

create table if not exists public.inbound_messages (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null
    references public.workspaces(id)
    on delete cascade,

  -- sender of the inbound email (the lead)
  from_email citext not null,

  -- optional: link to a lead/contact if we find one
  lead_id uuid
    references public.leads(id)
    on delete set null,

  -- optional: link to campaign if you pass it in
  campaign_id uuid
    references public.campaigns(id)
    on delete set null,

  subject text,
  text_body text,
  html_body text,

  -- basic threading metadata if you have it from Gmail/Outlook
  message_id text,
  in_reply_to text,
  references_header text,

  raw_headers jsonb,

  detected_as_reply boolean default false,

  created_at timestamptz not null default now()
);

-- Indexes for efficient lookups
create index if not exists inbound_messages_workspace_email_idx
  on public.inbound_messages (workspace_id, from_email);

create index if not exists inbound_messages_campaign_idx
  on public.inbound_messages (campaign_id)
  where campaign_id is not null;

create index if not exists inbound_messages_lead_idx
  on public.inbound_messages (lead_id)
  where lead_id is not null;

create index if not exists inbound_messages_created_at_idx
  on public.inbound_messages (created_at desc);

-- Enable RLS
alter table public.inbound_messages enable row level security;

-- RLS policies: Workspace members can read and insert inbound messages
create policy "Workspace members can read inbound messages"
on public.inbound_messages
for select
using (
  workspace_id in (
    select wm.workspace_id
    from public.workspace_members wm
    where wm.user_id = auth.uid()
  )
);

create policy "Workspace members can insert inbound messages"
on public.inbound_messages
for insert
with check (
  workspace_id in (
    select wm.workspace_id
    from public.workspace_members wm
    where wm.user_id = auth.uid()
  )
);

-- ============================================
-- 2) Ensure leads table has last_replied_at
-- ============================================

-- Add last_replied_at column if it doesn't exist
alter table public.leads
  add column if not exists last_replied_at timestamptz;

-- Create index for efficient queries
create index if not exists idx_leads_last_replied_at
  on public.leads (last_replied_at desc)
  where last_replied_at is not null;

-- Ensure email column supports citext for case-insensitive matching
-- (This is idempotent - won't change if already citext)
do $$
begin
  -- Check if citext extension exists
  if not exists (select 1 from pg_extension where extname = 'citext') then
    create extension if not exists citext;
  end if;

  -- Try to convert email to citext if it's not already
  -- This will fail gracefully if column doesn't exist or is already citext
  begin
    alter table public.leads
      alter column email type citext using email::citext;
  exception
    when others then
      -- Column might not exist or already be citext, that's fine
      null;
  end;
end $$;

-- ============================================
-- 3) RPC: Mark a lead as replied
-- ============================================

-- Mark lead as replied + attach inbound message if present
create or replace function public.mark_lead_replied(
  p_workspace_id uuid,
  p_email text,
  p_inbound_message_id uuid default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_lead_id uuid;
begin
  -- 1) Find lead by workspace + email (case-insensitive)
  select id
  into v_lead_id
  from public.leads
  where workspace_id = p_workspace_id
    and email = p_email::citext
  limit 1;

  if not found then
    return jsonb_build_object(
      'status', 'not_found',
      'email', p_email
    );
  end if;

  -- 2) Update lead status + reply timestamp
  update public.leads
  set
    status = 'replied',
    last_replied_at = now()
  where id = v_lead_id;

  -- 3) Link inbound message to lead if provided
  if p_inbound_message_id is not null then
    update public.inbound_messages
    set
      lead_id = v_lead_id,
      detected_as_reply = true
    where id = p_inbound_message_id
      and workspace_id = p_workspace_id;
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'lead_id', v_lead_id,
    'email', p_email
  );
end;
$$;

-- Grant execute permission to authenticated users
grant execute on function public.mark_lead_replied(uuid, text, uuid)
  to authenticated;

-- ============================================
-- 4) RPC: Create inbound message + auto-mark replied
-- ============================================

-- Create an inbound message record + auto-mark the lead as replied
-- This is the core "entrypoint" your Gmail/Outlook webhook or edge function will call
create or replace function public.handle_inbound_email(
  p_workspace_id uuid,
  p_from_email text,
  p_subject text default null,
  p_text_body text default null,
  p_html_body text default null,
  p_campaign_id uuid default null,
  p_message_id text default null,
  p_in_reply_to text default null,
  p_references text default null,
  p_raw_headers jsonb default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_inbound_id uuid;
  v_result jsonb;
begin
  -- 1) Insert inbound row
  insert into public.inbound_messages (
    workspace_id,
    from_email,
    subject,
    text_body,
    html_body,
    campaign_id,
    message_id,
    in_reply_to,
    references_header,
    raw_headers
  )
  values (
    p_workspace_id,
    p_from_email::citext,
    p_subject,
    p_text_body,
    p_html_body,
    p_campaign_id,
    p_message_id,
    p_in_reply_to,
    p_references,
    p_raw_headers
  )
  returning id into v_inbound_id;

  -- 2) Mark lead as replied (if exists)
  v_result := public.mark_lead_replied(
    p_workspace_id,
    p_from_email,
    v_inbound_id
  );

  -- 3) Return combined result
  return jsonb_build_object(
    'status', 'ok',
    'inbound_message_id', v_inbound_id,
    'lead_update', v_result
  );
end;
$$;

-- Grant execute permission to authenticated users
grant execute on function public.handle_inbound_email(
  uuid, text, text, text, text, uuid, text, text, text, jsonb
) to authenticated;


































































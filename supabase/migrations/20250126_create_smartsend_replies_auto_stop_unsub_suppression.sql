-- SmartSend — Replies + Auto‑stop + Unsubscribe Center + Suppression (LIVE)
-- This migration adds the complete inbound reply processing, auto-stop sequences,
-- 1-click unsubscribe tokens, and unified suppression system

-- Extensions
create extension if not exists citext;

-- 1. ENHANCED INBOUND MESSAGES TABLE
create table if not exists public.inbound_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  message_id text unique, -- External message ID from provider
  in_reply_to text, -- References original message_id
  from_email citext not null,
  to_email citext not null,
  subject text,
  body_text text,
  body_html text,
  headers jsonb,
  provider text, -- 'ses', 'mailgun', 'mailersend'
  provider_data jsonb, -- Raw provider payload
  created_at timestamptz not null default now()
);

create index if not exists idx_inbound_messages_workspace on public.inbound_messages(workspace_id);
create index if not exists idx_inbound_messages_in_reply_to on public.inbound_messages(in_reply_to);
create index if not exists idx_inbound_messages_from_email on public.inbound_messages(from_email);
create index if not exists idx_inbound_messages_created_at on public.inbound_messages(created_at desc);

-- 2. ENHANCED UNSUBSCRIBE TOKENS TABLE
create table if not exists public.unsubscribe_tokens (
  id uuid primary key default gen_random_uuid(),
  token text unique not null,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  email_lower citext not null,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days')
);

create index if not exists idx_unsubscribe_tokens_workspace on public.unsubscribe_tokens(workspace_id);
create index if not exists idx_unsubscribe_tokens_contact on public.unsubscribe_tokens(contact_id);
create index if not exists idx_unsubscribe_tokens_campaign on public.unsubscribe_tokens(campaign_id);
create index if not exists idx_unsubscribe_tokens_email on public.unsubscribe_tokens(email_lower);
create index if not exists idx_unsubscribe_tokens_expires on public.unsubscribe_tokens(expires_at);

-- 3. ENHANCED SUPPRESSIONS TABLE (extends existing)
alter table if exists public.suppressions 
add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade,
add column if not exists campaign_id uuid references public.campaigns(id) on delete cascade,
add column if not exists source text check (source in ('bounce', 'complaint', 'unsubscribe', 'manual', 'reply_stop')),
add column if not exists metadata jsonb;

-- Add indexes for new columns
create index if not exists idx_suppressions_workspace on public.suppressions(workspace_id);
create index if not exists idx_suppressions_campaign on public.suppressions(campaign_id);
create index if not exists idx_suppressions_source on public.suppressions(source);

-- 4. REPLY INTENT CLASSIFICATION TABLE
create table if not exists public.reply_intents (
  id uuid primary key default gen_random_uuid(),
  inbound_message_id uuid references public.inbound_messages(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  category text not null check (category in ('meeting', 'interested', 'not_interested', 'question', 'other')),
  confidence numeric(3,2) check (confidence >= 0 and confidence <= 1),
  actions text[],
  extracted_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_reply_intents_workspace on public.reply_intents(workspace_id);
create index if not exists idx_reply_intents_contact on public.reply_intents(contact_id);
create index if not exists idx_reply_intents_campaign on public.reply_intents(campaign_id);
create index if not exists idx_reply_intents_category on public.reply_intents(category);

-- 5. AUTO-STOP EVENTS TABLE
create table if not exists public.auto_stop_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  sequence_id uuid references public.sequences(id) on delete cascade,
  reason text not null check (reason in ('replied', 'unsubscribed', 'bounced', 'complained')),
  inbound_message_id uuid references public.inbound_messages(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_auto_stop_events_workspace on public.auto_stop_events(workspace_id);
create index if not exists idx_auto_stop_events_contact on public.auto_stop_events(contact_id);
create index if not exists idx_auto_stop_events_campaign on public.auto_stop_events(campaign_id);
create index if not exists idx_auto_stop_events_sequence on public.auto_stop_events(sequence_id);

-- 6. ENHANCED EMAIL EVENTS TABLE (extends existing)
alter table if exists public.email_events 
add column if not exists inbound_message_id uuid references public.inbound_messages(id),
add column if not exists reply_intent_id uuid references public.reply_intents(id);

-- Add indexes for new columns
create index if not exists idx_email_events_inbound_message on public.email_events(inbound_message_id);
create index if not exists idx_email_events_reply_intent on public.email_events(reply_intent_id);

-- 7. FUNCTIONS FOR AUTO-STOP LOGIC

-- Function to stop future sends for a contact
create or replace function public.stop_future_sends(
  p_workspace_id uuid,
  p_contact_id uuid,
  p_campaign_id uuid,
  p_reason text
) returns void as $$
begin
  -- Mark campaign_contacts as replied/stopped
  update public.campaign_contacts 
  set status = 'stopped', 
      stopped_at = now(),
      stop_reason = p_reason
  where workspace_id = p_workspace_id 
    and contact_id = p_contact_id 
    and campaign_id = p_campaign_id
    and status in ('pending', 'scheduled');

  -- Delete future sequence steps
  delete from public.sequence_steps ss
  where ss.sequence_id in (
    select s.id from public.sequences s
    where s.workspace_id = p_workspace_id
      and s.campaign_id = p_campaign_id
  ) and ss.contact_id = p_contact_id
    and ss.scheduled_at > now();

  -- Log the auto-stop event
  insert into public.auto_stop_events (
    workspace_id, contact_id, campaign_id, reason
  ) values (
    p_workspace_id, p_contact_id, p_campaign_id, p_reason
  );
end;
$$ language plpgsql security definer;

-- Function to check if contact is suppressed
create or replace function public.is_contact_suppressed(
  p_workspace_id uuid,
  p_email text
) returns boolean as $$
declare
  v_suppressed boolean := false;
begin
  select exists(
    select 1 from public.suppressions s
    where s.workspace_id = p_workspace_id
      and s.kind = 'email'
      and s.value_lower = lower(p_email)
  ) into v_suppressed;
  
  return v_suppressed;
end;
$$ language plpgsql security definer;

-- Function to process inbound reply
create or replace function public.process_inbound_reply(
  p_workspace_id uuid,
  p_message_id text,
  p_in_reply_to text,
  p_from_email text,
  p_to_email text,
  p_subject text,
  p_body_text text,
  p_body_html text,
  p_headers jsonb,
  p_provider text,
  p_provider_data jsonb
) returns uuid as $$
declare
  v_inbound_id uuid;
  v_campaign_id uuid;
  v_contact_id uuid;
  v_sequence_id uuid;
begin
  -- Insert inbound message
  insert into public.inbound_messages (
    workspace_id, message_id, in_reply_to, from_email, to_email,
    subject, body_text, body_html, headers, provider, provider_data
  ) values (
    p_workspace_id, p_message_id, p_in_reply_to, p_from_email, p_to_email,
    p_subject, p_body_text, p_body_html, p_headers, p_provider, p_provider_data
  ) returning id into v_inbound_id;

  -- Find the original campaign by in_reply_to
  select cc.campaign_id, cc.contact_id, s.id
  into v_campaign_id, v_contact_id, v_sequence_id
  from public.campaign_contacts cc
  left join public.sequences s on s.campaign_id = cc.campaign_id
  where cc.workspace_id = p_workspace_id
    and exists (
      select 1 from public.email_events ee
      where ee.campaign_id = cc.campaign_id
        and ee.contact_id = cc.contact_id
        and ee.message_id = p_in_reply_to
    )
  limit 1;

  -- If we found a matching campaign, process the reply
  if v_campaign_id is not null then
    -- Stop future sends
    perform public.stop_future_sends(
      p_workspace_id, v_contact_id, v_campaign_id, 'replied'
    );

    -- Log reply event
    insert into public.email_events (
      workspace_id, campaign_id, contact_id, event_type,
      inbound_message_id, created_at
    ) values (
      p_workspace_id, v_campaign_id, v_contact_id, 'replied',
      v_inbound_id, now()
    );
  end if;

  return v_inbound_id;
end;
$$ language plpgsql security definer;

-- 8. ROW LEVEL SECURITY POLICIES

-- Inbound messages: workspace members can view
alter table public.inbound_messages enable row level security;

create policy "inbound_messages_workspace_member" on public.inbound_messages
  for all using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = inbound_messages.workspace_id
        and wm.user_id = auth.uid()
    )
  );

-- Unsubscribe tokens: workspace members can manage
alter table public.unsubscribe_tokens enable row level security;

create policy "unsubscribe_tokens_workspace_member" on public.unsubscribe_tokens
  for all using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = unsubscribe_tokens.workspace_id
        and wm.user_id = auth.uid()
    )
  );

-- Reply intents: workspace members can view
alter table public.reply_intents enable row level security;

create policy "reply_intents_workspace_member" on public.reply_intents
  for all using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = reply_intents.workspace_id
        and wm.user_id = auth.uid()
    )
  );

-- Auto-stop events: workspace members can view
alter table public.auto_stop_events enable row level security;

create policy "auto_stop_events_workspace_member" on public.auto_stop_events
  for all using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = auto_stop_events.workspace_id
        and wm.user_id = auth.uid()
    )
  );

-- 9. INDEXES FOR PERFORMANCE
create index if not exists idx_campaign_contacts_workspace_status on public.campaign_contacts(workspace_id, status);
create index if not exists idx_sequence_steps_sequence_contact on public.sequence_steps(sequence_id, contact_id);
create index if not exists idx_email_events_campaign_contact on public.email_events(campaign_id, contact_id);

-- 10. CLEANUP FUNCTION FOR EXPIRED TOKENS
create or replace function public.cleanup_expired_unsubscribe_tokens() returns integer as $$
declare
  v_deleted_count integer;
begin
  delete from public.unsubscribe_tokens
  where expires_at < now()
    and used_at is null;
  
  get diagnostics v_deleted_count = row_count;
  return v_deleted_count;
end;
$$ language plpgsql security definer;

-- 11. VIEW FOR INBOX DASHBOARD
create or replace view public.inbox_replies_view as
select 
  im.id as inbound_message_id,
  im.workspace_id,
  im.from_email,
  im.subject,
  im.body_text,
  im.created_at,
  ri.category as intent_category,
  ri.confidence as intent_confidence,
  c.name as contact_name,
  c.company as contact_company,
  camp.name as campaign_name,
  w.name as workspace_name
from public.inbound_messages im
left join public.reply_intents ri on ri.inbound_message_id = im.id
left join public.contacts c on c.email_lower = im.from_email and c.user_id = (
  select user_id from public.workspace_members wm where wm.workspace_id = im.workspace_id limit 1
)
left join public.campaigns camp on camp.id = ri.campaign_id
left join public.workspaces w on w.id = im.workspace_id
where im.in_reply_to is not null;

-- Grant access to the view
grant select on public.inbox_replies_view to authenticated;

-- 12. VIEW FOR SUPPRESSIONS DASHBOARD
create or replace view public.suppressions_dashboard_view as
select 
  s.id,
  s.workspace_id,
  s.kind,
  s.value_lower,
  s.reason,
  s.source,
  s.created_at,
  s.metadata,
  w.name as workspace_name,
  c.name as campaign_name,
  count(ae.id) as auto_stop_count
from public.suppressions s
left join public.workspaces w on w.id = s.workspace_id
left join public.campaigns c on c.id = s.campaign_id
left join public.auto_stop_events ae on ae.workspace_id = s.workspace_id 
  and ae.reason = s.source
group by s.id, s.workspace_id, s.kind, s.value_lower, s.reason, s.source, s.created_at, s.metadata, w.name, c.name;

-- Grant access to the view
grant select on public.suppressions_dashboard_view to authenticated; 
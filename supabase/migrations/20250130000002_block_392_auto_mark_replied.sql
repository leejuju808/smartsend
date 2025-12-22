-- Block 392 — Auto-Mark Leads & Campaigns as Replied v1
-- Reply metadata on leads and campaign_leads + sync from AI classification

-- 1️⃣ SQL — reply fields on leads + campaign_leads

-- a) leads reply metadata
alter table public.leads
  add column if not exists last_reply_at timestamptz,
  add column if not exists last_reply_label text,
  add column if not exists last_reply_summary text,
  add column if not exists has_replied boolean default false,
  add column if not exists unsubscribed boolean default false,
  add column if not exists bounced boolean default false;

create index if not exists idx_leads_has_replied
  on public.leads (has_replied);

create index if not exists idx_leads_unsubscribed
  on public.leads (unsubscribed);

create index if not exists idx_leads_bounced
  on public.leads (bounced);

-- b) campaign_leads enrollment state
alter table public.campaign_leads
  add column if not exists last_reply_at timestamptz,
  add column if not exists last_reply_label text,
  add column if not exists last_reply_summary text,
  add column if not exists status_reason text;

-- Update status constraint to include our standard values
-- Note: We'll keep existing values ('new','queued','sent','replied','unsub','bounced','paused')
-- and add 'pending', 'active', 'completed', 'unsubscribed' as valid options
do $$
begin
  -- Drop existing constraint if it exists
  if exists (
    select 1
    from pg_constraint c
    join pg_class cl on c.conrelid = cl.oid
    join pg_namespace n on cl.relnamespace = n.oid
    where n.nspname = 'public'
      and cl.relname = 'campaign_leads'
      and c.conname = 'campaign_leads_status_check'
  ) then
    alter table public.campaign_leads drop constraint campaign_leads_status_check;
  end if;
  
  -- Add new constraint with all valid statuses
  alter table public.campaign_leads
    add constraint campaign_leads_status_check
      check (status in (
        'pending', 'active', 'completed', 'replied', 'bounced', 'unsubscribed',
        -- Legacy values for backward compatibility
        'new', 'queued', 'sent', 'unsub', 'paused'
      ));
exception
  when others then
    raise notice 'campaign_leads status constraint update failed: %', sqlerrm;
end $$;

-- Map legacy statuses to new standard values
update public.campaign_leads
  set status = case
    when status = 'new' then 'pending'
    when status = 'queued' then 'active'
    when status = 'sent' then 'active'
    when status = 'unsub' then 'unsubscribed'
    else status
  end
where status in ('new', 'queued', 'sent', 'unsub');

create index if not exists idx_campaign_leads_status
  on public.campaign_leads (status);

create index if not exists idx_campaign_leads_last_reply_at
  on public.campaign_leads (last_reply_at desc)
  where last_reply_at is not null;

-- Ensure reply_logs has the necessary columns for classification
alter table public.reply_logs
  add column if not exists workspace_id uuid references workspaces(id) on delete cascade,
  add column if not exists lead_id uuid references leads(id) on delete cascade,
  add column if not exists campaign_id uuid references campaigns(id) on delete cascade,
  add column if not exists received_at timestamptz,
  add column if not exists subject text,
  add column if not exists body_plain text,
  add column if not exists body_html text,
  add column if not exists ai_label text,
  add column if not exists ai_intent_summary text,
  add column if not exists ai_meeting_intent boolean default false,
  add column if not exists ai_confidence numeric,
  add column if not exists ai_raw jsonb,
  add column if not exists ai_classified_at timestamptz;

-- Indexes for reply_logs
create index if not exists idx_reply_logs_lead_id
  on public.reply_logs (lead_id)
  where lead_id is not null;

create index if not exists idx_reply_logs_campaign_id
  on public.reply_logs (campaign_id)
  where campaign_id is not null;

create index if not exists idx_reply_logs_workspace_id
  on public.reply_logs (workspace_id)
  where workspace_id is not null;

create index if not exists idx_reply_logs_ai_classified_at
  on public.reply_logs (ai_classified_at desc)
  where ai_classified_at is not null;





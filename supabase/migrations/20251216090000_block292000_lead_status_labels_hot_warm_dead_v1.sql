-- ============================================================================
-- Block 292000 — Lead Status Labels (Hot / Warm / Dead) v1
-- Adds outreach-focused status + timestamps + reason + indexes.
-- IMPORTANT: This is separate from existing delivery/pipeline statuses.
-- ============================================================================

-- A) leads table columns (idempotent)
alter table public.leads
  add column if not exists outreach_status text not null default 'uncontacted',
  add column if not exists last_reply_at timestamptz null,
  add column if not exists last_contacted_at timestamptz null,
  add column if not exists reason_dead text null;

comment on column public.leads.outreach_status is
  'Block 292000: Outreach lead status for campaigns (uncontacted/contacted/warm/hot/dead/closed). Separate from delivery/pipeline statuses.';
comment on column public.leads.last_reply_at is
  'Block 292000: Timestamp of most recent inbound reply (campaign outreach).';
comment on column public.leads.last_contacted_at is
  'Block 292000: Timestamp of most recent outbound contact attempt (campaign outreach).';
comment on column public.leads.reason_dead is
  'Block 292000: Reason why outreach_status became dead (stop_reply | bounce_or_invalid | manual_override | other).';

-- Constrain outreach_status values (best-effort; avoid breaking drift)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads' and column_name = 'outreach_status'
  ) then
    -- Drop existing constraint if present (name may drift across environments)
    if exists (select 1 from pg_constraint where conname = 'leads_outreach_status_check') then
      alter table public.leads drop constraint leads_outreach_status_check;
    end if;

    alter table public.leads
      add constraint leads_outreach_status_check
      check (outreach_status in ('uncontacted','contacted','warm','hot','dead','closed'));
  end if;
exception when others then
  -- Keep permissive if constraint creation fails due to drift.
  null;
end $$;

-- B) Indexes
-- (campaign_id, outreach_status) index only if campaign_id exists
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads' and column_name = 'campaign_id'
  ) then
    execute 'create index if not exists idx_leads_campaign_outreach_status on public.leads(campaign_id, outreach_status)';
    execute 'create index if not exists idx_leads_campaign_status on public.leads(campaign_id, status)';
  end if;
exception when others then null;
end $$;

-- (email) index (safe even if duplicates exist)
create index if not exists idx_leads_email on public.leads(email);

-- C) outreach_events: allow metadata payloads
alter table public.outreach_events
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.outreach_events.metadata is
  'Block 292000: Optional metadata for v1 events (e.g., {classification, confidence}).';










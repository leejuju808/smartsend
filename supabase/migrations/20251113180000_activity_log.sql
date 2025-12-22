-- Block 183: Global Activity Log
-- Unified multi-source log layer for all SmartSend interactions

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  account_id uuid not null,
  campaign_id uuid,
  company_id uuid,
  lead_id uuid,

  event_type text not null check (
    event_type in (
      'email_sent',
      'email_open',
      'email_click',
      'email_reply',
      'email_bounce',
      'email_unsubscribe',

      'intent_signal',
      'company_hot',
      'company_engagement_update',

      'smartlist_refresh',
      'smartlist_rule_change',

      'scheduler_dispatch',
      'scheduler_skip_window',
      'scheduler_retry',

      'deliverability_warning',
      'deliverability_pause',

      'campaign_paused',
      'campaign_resumed'
    )
  ),

  meta jsonb default '{}'::jsonb
);

-- Indexes for fast lookups
create index if not exists idx_activity_lead on activity_log(lead_id);
create index if not exists idx_activity_company on activity_log(company_id);
create index if not exists idx_activity_campaign on activity_log(campaign_id);
create index if not exists idx_activity_account on activity_log(account_id);
create index if not exists idx_activity_event_type on activity_log(event_type);
create index if not exists idx_activity_created_at on activity_log(created_at desc);

-- RLS: Users can read activity for their account/org
alter table public.activity_log enable row level security;

-- Policy: Users can read activity logs for accounts they have access to
create policy "activity_log_read" on public.activity_log
  for select using (
    exists (
      select 1 from public.accounts a
      where a.id = activity_log.account_id
      and exists (
        select 1 from public.org_memberships om
        where om.org_id = a.org_id
        and om.user_id = auth.uid()
        and om.status = 'active'
      )
    )
    or exists (
      select 1 from public.workspaces w
      where w.id = activity_log.account_id
      and exists (
        select 1 from public.workspace_members wm
        where wm.workspace_id = w.id
        and wm.user_id = auth.uid()
      )
    )
  );

-- Policy: Service role can insert/update/delete (for automated events)
create policy "activity_log_service_role" on public.activity_log
  for all to service_role
  using (true) with check (true);

-- Comment
comment on table public.activity_log is 'Unified activity log for all SmartSend interactions - single source of truth for analytics';
comment on column public.activity_log.event_type is 'Type of event that occurred';
comment on column public.activity_log.meta is 'Additional event metadata (JSON)';













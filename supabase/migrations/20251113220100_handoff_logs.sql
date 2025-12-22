-- Block 187: Human Handoff + CRM Push - Handoff Logs
-- Creates handoff_logs table to track all handoff attempts

create table if not exists public.handoff_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  account_id uuid not null,
  lead_id uuid not null references public.leads(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,

  method text not null,
  status text not null check (status in ('success','failed','pending','ignored')),
  meta jsonb default '{}'::jsonb
);

-- Indexes for fast lookups
create index if not exists idx_handoff_logs_account on public.handoff_logs(account_id);
create index if not exists idx_handoff_logs_lead on public.handoff_logs(lead_id);
create index if not exists idx_handoff_logs_campaign on public.handoff_logs(campaign_id);
create index if not exists idx_handoff_logs_status on public.handoff_logs(status);
create index if not exists idx_handoff_logs_created on public.handoff_logs(created_at desc);

-- RLS
alter table public.handoff_logs enable row level security;

-- Policy: Users can read handoff logs for accounts they have access to
create policy "handoff_logs_read" on public.handoff_logs
  for select using (
    exists (
      select 1 from public.accounts a
      where a.id = handoff_logs.account_id
      and exists (
        select 1 from public.org_memberships om
        where om.org_id = a.org_id
        and om.user_id = auth.uid()
        and om.status = 'active'
      )
    )
    or exists (
      select 1 from public.workspaces w
      where w.id = handoff_logs.account_id
      and exists (
        select 1 from public.workspace_members wm
        where wm.workspace_id = w.id
        and wm.user_id = auth.uid()
      )
    )
  );

-- Policy: Service role can insert/update/delete (for automated events)
create policy "handoff_logs_service_role" on public.handoff_logs
  for all to service_role
  using (true) with check (true);

-- Comment
comment on table public.handoff_logs is 'Logs of all handoff attempts to CRM or notification systems';
comment on column public.handoff_logs.method is 'Handoff method: pipedrive, hubspot, salesforce, email, slack, discord';
comment on column public.handoff_logs.status is 'Handoff status: success, failed, pending, ignored';
comment on column public.handoff_logs.meta is 'Additional metadata about the handoff (response, errors, etc.)';













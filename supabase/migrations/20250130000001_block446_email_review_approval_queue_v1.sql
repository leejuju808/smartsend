-- Block 446 — Email Review & Approval Queue v1
-- Pre-Send Review • Team Approval Workflow • Draft Queue • Owner/Admin Sign-Off

-- 1. Create approval_queue table
create table if not exists public.approval_queue (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  inbox_id uuid references public.sender_inboxes(id) on delete set null,
  step_id uuid references public.campaign_steps(id) on delete set null,
  email_subject text not null,
  email_body text not null,
  scheduled_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_by uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  inline_comments text,
  auto_approve_at timestamptz, -- for auto-approval timeout
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. Create indexes for performance
create index if not exists idx_approval_queue_workspace on public.approval_queue(workspace_id);
create index if not exists idx_approval_queue_campaign on public.approval_queue(campaign_id);
create index if not exists idx_approval_queue_status on public.approval_queue(status);
create index if not exists idx_approval_queue_submitted_by on public.approval_queue(submitted_by);
create index if not exists idx_approval_queue_scheduled_at on public.approval_queue(scheduled_at);
create index if not exists idx_approval_queue_pending on public.approval_queue(workspace_id, status, scheduled_at) where status = 'pending';
create index if not exists idx_approval_queue_auto_approve on public.approval_queue(auto_approve_at) where status = 'pending' and auto_approve_at is not null;

-- 3. Add require_approval column to campaigns
alter table public.campaigns
  add column if not exists require_approval boolean not null default false;

create index if not exists idx_campaigns_require_approval on public.campaigns(require_approval);

-- 4. Add require_approval_globally column to workspaces
alter table public.workspaces
  add column if not exists require_approval_globally boolean not null default false;

create index if not exists idx_workspaces_require_approval_globally on public.workspaces(require_approval_globally);

-- 5. Add auto_approve_timeout_hours column to campaigns (optional auto-approval)
alter table public.campaigns
  add column if not exists auto_approve_timeout_hours integer; -- null = no auto-approval

-- 6. Enable RLS on approval_queue
alter table public.approval_queue enable row level security;

-- 7. RLS Policies for approval_queue
-- Members can view approval queue items in their workspace
create policy "approval_queue_select_workspace_members"
  on public.approval_queue
  for select
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = approval_queue.workspace_id
      and user_id = auth.uid()
    )
  );

-- Users can insert their own submissions
create policy "approval_queue_insert_own"
  on public.approval_queue
  for insert
  with check (
    submitted_by = auth.uid()
    and exists (
      select 1 from public.workspace_members
      where workspace_id = approval_queue.workspace_id
      and user_id = auth.uid()
    )
  );

-- Owners/admins can update (approve/reject)
create policy "approval_queue_update_owners_admins"
  on public.approval_queue
  for update
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = approval_queue.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = approval_queue.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
    )
  );

-- 8. Function to check if approval is required
create or replace function public.requires_approval(
  p_workspace_id uuid,
  p_campaign_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_workspace_requires boolean;
  v_campaign_requires boolean;
begin
  -- Check workspace-level setting
  select require_approval_globally into v_workspace_requires
  from public.workspaces
  where id = p_workspace_id;
  
  -- Check campaign-level setting
  select require_approval into v_campaign_requires
  from public.campaigns
  where id = p_campaign_id;
  
  -- Approval required if workspace OR campaign requires it
  return coalesce(v_workspace_requires, false) or coalesce(v_campaign_requires, false);
end;
$$;

-- 9. Function to move approved email to send_queue
create or replace function public.move_approved_to_send_queue(
  p_approval_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_approval_record public.approval_queue%rowtype;
  v_send_queue_id uuid;
begin
  -- Get approval record
  select * into v_approval_record
  from public.approval_queue
  where id = p_approval_id
  and status = 'approved';
  
  if not found then
    raise exception 'Approval record not found or not approved';
  end if;
  
  -- Insert into send_queue (matching the actual send_queue schema)
  -- Note: send_queue requires from_inbox_id, so we use inbox_id from approval_queue
  insert into public.send_queue (
    campaign_id,
    lead_id,
    from_inbox_id,
    subject,
    body_html,
    body_text,
    scheduled_at,
    status,
    priority
  )
  values (
    v_approval_record.campaign_id,
    v_approval_record.lead_id,
    v_approval_record.inbox_id, -- maps to from_inbox_id in send_queue
    v_approval_record.email_subject,
    v_approval_record.email_body,
    v_approval_record.email_body, -- body_text same as body_html for now
    v_approval_record.scheduled_at,
    'pending',
    100
  )
  returning id into v_send_queue_id;
  
  return v_send_queue_id;
end;
$$;

-- 10. Trigger to update updated_at timestamp
create or replace function public.set_approval_queue_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_approval_queue_updated_at
  before update on public.approval_queue
  for each row
  execute function public.set_approval_queue_updated_at();

-- 11. Function for auto-approval (to be called by cron job)
create or replace function public.auto_approve_pending_emails()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  -- Update pending approvals where auto_approve_at has passed
  update public.approval_queue
  set 
    status = 'approved',
    reviewed_by = null, -- system auto-approval
    reviewed_at = now(),
    rejection_reason = 'Auto-approved after timeout'
  where status = 'pending'
  and auto_approve_at is not null
  and auto_approve_at <= now();
  
  get diagnostics v_count = row_count;
  
  -- Move auto-approved emails to send_queue
  perform public.move_approved_to_send_queue(id)
  from public.approval_queue
  where status = 'approved'
  and reviewed_by is null -- only auto-approved ones
  and reviewed_at >= now() - interval '1 minute'; -- recent auto-approvals
  
  return v_count;
end;
$$;

-- 12. Comment on table
comment on table public.approval_queue is 'Email review and approval queue for team workflows. Emails wait here until approved by owners/admins before being sent.';
comment on column public.approval_queue.status is 'pending: awaiting review, approved: ready to send, rejected: needs revision';
comment on column public.approval_queue.auto_approve_at is 'Optional timestamp for automatic approval if no action taken';


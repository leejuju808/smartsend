-- Block 8900 - SmartSend Sequence Builder v1 (Multi-Step Email Flows)
-- Upgrade SmartSend from single-email campaigns to 2-5 step cold email sequences

-- 1. Create smartsend_sequence_steps table
create table if not exists public.smartsend_sequence_steps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  position int not null, -- 1 = first email, 2 = second follow-up, etc.
  delay_days int default 0, -- days to wait after previous step
  subject text,
  body text,
  created_at timestamptz default now()
);

-- Create index for efficient querying
create index if not exists idx_smartsend_sequence_steps_campaign_position 
  on public.smartsend_sequence_steps (campaign_id, position);

-- 2. Add step tracking columns to leads table
alter table public.leads
  add column if not exists current_step int default 1;

alter table public.leads
  add column if not exists last_step_sent_at timestamptz;

alter table public.leads
  add column if not exists next_step_at timestamptz;

-- Create index for efficient querying
create index if not exists idx_leads_campaign_status_next_step 
  on public.leads (campaign_id, status, next_step_at) 
  where status = 'pending';

-- 3. Add step fields to smartsend_queue table
alter table public.smartsend_queue
  add column if not exists step_position int;

alter table public.smartsend_queue
  add column if not exists subject text;

alter table public.smartsend_queue
  add column if not exists body text;

-- 4. RPC function to get next step for a lead
create or replace function public.smartsend_get_next_step(
  p_campaign_id uuid,
  p_current_step int
)
returns public.smartsend_sequence_steps
language sql
security definer
as $$
  select *
  from public.smartsend_sequence_steps
  where campaign_id = p_campaign_id
    and position = p_current_step
  limit 1;
$$;

-- Grant execute permission
grant execute on function public.smartsend_get_next_step(uuid, int) to service_role, authenticated;

-- Enable RLS on smartsend_sequence_steps
alter table public.smartsend_sequence_steps enable row level security;

-- RLS policies for smartsend_sequence_steps
-- Users can read/write steps for their campaigns
create policy "smartsend_sequence_steps_select_own"
  on public.smartsend_sequence_steps
  for select
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = smartsend_sequence_steps.campaign_id
        and (c.user_id = auth.uid() or c.workspace_id in (
          select workspace_id from public.workspace_members wm
          where wm.user_id = auth.uid()
        ))
    )
  );

create policy "smartsend_sequence_steps_insert_own"
  on public.smartsend_sequence_steps
  for insert
  with check (
    exists (
      select 1 from public.campaigns c
      where c.id = smartsend_sequence_steps.campaign_id
        and (c.user_id = auth.uid() or c.workspace_id in (
          select workspace_id from public.workspace_members wm
          where wm.user_id = auth.uid()
        ))
    )
  );

create policy "smartsend_sequence_steps_update_own"
  on public.smartsend_sequence_steps
  for update
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = smartsend_sequence_steps.campaign_id
        and (c.user_id = auth.uid() or c.workspace_id in (
          select workspace_id from public.workspace_members wm
          where wm.user_id = auth.uid()
        ))
    )
  );

create policy "smartsend_sequence_steps_delete_own"
  on public.smartsend_sequence_steps
  for delete
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = smartsend_sequence_steps.campaign_id
        and (c.user_id = auth.uid() or c.workspace_id in (
          select workspace_id from public.workspace_members wm
          where wm.user_id = auth.uid()
        ))
    )
  );

-- Service role can do everything (for edge functions)
create policy "smartsend_sequence_steps_service_role"
  on public.smartsend_sequence_steps
  for all
  using (true)
  with check (true);









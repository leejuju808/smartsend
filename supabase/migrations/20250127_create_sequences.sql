-- Sequences support for multi-step email campaigns
-- Sequences are attached to campaigns and contain ordered steps with timing windows

-- Sequence definition (attached to a campaign)
create table if not exists public.sequences (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  
  unique (campaign_id)
);

-- Ordered steps (day offsets & send window)
create table if not exists public.sequence_steps (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid references public.sequences(id) on delete cascade,
  position int not null,                -- 1,2,3...
  subject text not null,
  body_html text not null,
  wait_days int not null default 3,     -- after previous send
  send_window jsonb default '{"tz":"America/Los_Angeles","start":"09:00","end":"16:30","weekdays":[1,2,3,4,5]}'::jsonb,
  created_at timestamptz default now(),
  
  unique (sequence_id, position)
);

-- (optional) file refs for later
create table if not exists public.sequence_step_attachments (
  id uuid primary key default gen_random_uuid(),
  step_id uuid references public.sequence_steps(id) on delete cascade,
  file_url text not null
);

-- Per-lead tracking of which step they are on
create table if not exists public.sequence_progress (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null,
  current_position int not null default 0, -- 0 = before step 1
  status text not null default 'active' check (status in ('active','paused','stopped','finished')),
  last_sent_at timestamptz,
  created_at timestamptz default now(),
  
  unique (campaign_id, lead_id)
);

-- Indexes for performance
create index if not exists idx_sequences_campaign on public.sequences (campaign_id);
create index if not exists idx_sequence_steps_seq on public.sequence_steps (sequence_id, position);
create index if not exists idx_sequence_progress_campaign on public.sequence_progress (campaign_id, status);
create index if not exists idx_sequence_progress_lead on public.sequence_progress (lead_id);

-- RLS policies
alter table public.sequences enable row level security;
alter table public.sequence_steps enable row level security;
alter table public.sequence_step_attachments enable row level security;
alter table public.sequence_progress enable row level security;

create policy if not exists "sequences_select" on public.sequences for select using (true);
create policy if not exists "sequences_insert" on public.sequences for insert with check (true);
create policy if not exists "sequences_update" on public.sequences for update using (true);

create policy if not exists "sequence_steps_select" on public.sequence_steps for select using (true);
create policy if not exists "sequence_steps_insert" on public.sequence_steps for insert with check (true);
create policy if not exists "sequence_steps_update" on public.sequence_steps for update using (true);

create policy if not exists "sequence_step_attachments_select" on public.sequence_step_attachments for select using (true);
create policy if not exists "sequence_step_attachments_insert" on public.sequence_step_attachments for insert with check (true);

create policy if not exists "sequence_progress_select" on public.sequence_progress for select using (true);
create policy if not exists "sequence_progress_insert" on public.sequence_progress for insert with check (true);
create policy if not exists "sequence_progress_update" on public.sequence_progress for update using (true);

-- RPC: cancel future queued items for a lead in a campaign
create or replace function public.cancel_future_queue(p_campaign uuid, p_lead uuid)
returns void language plpgsql as $$
begin
  update public.email_jobs
    set status = 'canceled',
        last_error = 'lead_canceled'
  where campaign_id = p_campaign
    and lead_id = p_lead
    and status in ('queued','sending');
end$$;

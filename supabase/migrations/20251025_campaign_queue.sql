-- /supabase/migrations/20251025_campaign_queue.sql

-- send_queue (if you don't already have it)
create table if not exists public.send_queue (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  campaign_id uuid not null,
  lead_id uuid not null,
  to_email text not null,
  subject text not null,
  body_html text not null,
  status text not null default 'pending',  -- pending|sent|failed|skipped_suppressed|canceled
  scheduled_at timestamptz not null,
  sent_at timestamptz,
  error text,
  created_at timestamptz default now()
);

create index if not exists ix_send_queue_ws_status_time on public.send_queue(workspace_id, status, scheduled_at);

-- Minimal fields on campaigns for templating + pacing
alter table if exists public.campaigns add column if not exists subject_template text;
alter table if exists public.campaigns add column if not exists body_template text;
alter table if exists public.campaigns add column if not exists daily_cap integer default 200;        -- per workspace per day for this campaign
alter table if exists public.campaigns add column if not exists cadence_seconds integer default 45;   -- gap between emails
alter table if exists public.campaigns add column if not exists window_start time default '08:00';    -- local time
alter table if exists public.campaigns add column if not exists window_end time default '17:30';
alter table if exists public.campaigns add column if not exists start_date date default current_date;

-- Optional: a join table for targeting (if not already present)
create table if not exists public.campaign_targets (
  campaign_id uuid not null,
  lead_id uuid not null,
  primary key (campaign_id, lead_id)
);

-- RLS mirrors your workspace pattern (if enabled)
alter table public.send_queue enable row level security;
create policy "sq_member" on public.send_queue for select using (public.is_workspace_member(workspace_id));
create policy "sq_member_write" on public.send_queue for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

alter table public.campaign_targets enable row level security;
create policy "ct_member_all" on public.campaign_targets for all using (
  public.is_workspace_member((select workspace_id from public.campaigns c where c.id = campaign_id))
) with check (
  public.is_workspace_member((select workspace_id from public.campaigns c where c.id = campaign_id))
);
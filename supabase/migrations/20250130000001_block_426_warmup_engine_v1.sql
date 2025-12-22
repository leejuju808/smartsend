-- Block 426 — Warmup Engine v1
-- Automatic Warmup Emails • Inbox Reputation Boosting • Domain Warming • Smart Ramp-Up

-- ============================================
-- 1) Warmup Queue Table
-- ============================================
create table if not exists public.warmup_queue (
  id uuid primary key default gen_random_uuid(),
  inbox_id uuid not null references public.sender_inboxes(id) on delete cascade,
  target_inbox_id uuid not null references public.sender_inboxes(id),
  subject text not null,
  body text not null,
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  replied_at timestamptz,
  created_at timestamptz default now()
);

-- Indexes for warmup queue
create index if not exists idx_warmup_due
  on public.warmup_queue(scheduled_for)
  where sent_at is null;

create index if not exists idx_warmup_inbox
  on public.warmup_queue(inbox_id, scheduled_for);

create index if not exists idx_warmup_target
  on public.warmup_queue(target_inbox_id);

create index if not exists idx_warmup_sent
  on public.warmup_queue(sent_at)
  where sent_at is not null;

-- ============================================
-- 2) Add warmup_speed column to sender_inboxes
-- ============================================
alter table if exists public.sender_inboxes
  add column if not exists warmup_speed text default 'normal' check (warmup_speed in ('slow', 'normal', 'fast'));

-- ============================================
-- 3) Enable RLS
-- ============================================
alter table if exists public.warmup_queue enable row level security;

-- ============================================
-- 4) RLS Policies for warmup_queue
-- ============================================
create policy "warmup_queue_select_workspace_member" on public.warmup_queue
  for select using (
    exists (
      select 1 from public.sender_inboxes si
      join public.workspace_members wm on wm.workspace_id = si.workspace_id
      where si.id = warmup_queue.inbox_id
        and wm.user_id = auth.uid()
    )
  );

create policy "warmup_queue_service_role" on public.warmup_queue
  for all to service_role using (true) with check (true);

-- ============================================
-- 5) Comments
-- ============================================
comment on table public.warmup_queue is 'Queue for warmup emails sent between inboxes in the same workspace';
comment on column public.warmup_queue.inbox_id is 'The inbox sending the warmup email';
comment on column public.warmup_queue.target_inbox_id is 'The inbox receiving the warmup email';
comment on column public.warmup_queue.scheduled_for is 'When the warmup email should be sent';
comment on column public.warmup_queue.sent_at is 'When the warmup email was actually sent';
comment on column public.warmup_queue.replied_at is 'When the warmup email was auto-replied to';
comment on column public.sender_inboxes.warmup_speed is 'Warmup speed: slow (+0.5/day), normal (+1/day), fast (+2/day)';




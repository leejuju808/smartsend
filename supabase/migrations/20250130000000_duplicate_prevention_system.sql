-- Duplicate Prevention System
-- Prevents duplicate sends for the same (campaign, lead, step) within a time window

-- A) Ensure step_no, sent_at, created_at, updated_at exist on send_queue
alter table public.send_queue
  add column if not exists step_no int,
  add column if not exists sent_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- B) Fast lookups to detect dups
create index if not exists idx_queue_campaign_lead_step on public.send_queue(campaign_id, lead_id, step_no);
create index if not exists idx_queue_status on public.send_queue(status);
create index if not exists idx_queue_sent_at on public.send_queue(sent_at);

-- C) Helper: has this (campaign, lead, step) gone out within a window?
create or replace function public.was_step_sent_recently(
  p_campaign uuid,
  p_lead uuid,
  p_step int,
  p_window interval default interval '24 hours'
) returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.send_queue q
    where q.campaign_id = p_campaign
      and q.lead_id = p_lead
      and q.step_no = p_step
      and q.status in ('pending','processing','sent','queued','sending')
      and coalesce(q.sent_at, q.updated_at, q.created_at) >= now() - p_window
  );
$$;

grant execute on function public.was_step_sent_recently(uuid,uuid,int,interval) to anon, authenticated, service_role;

-- D) Hard block: at most one PENDING/PROCESSING/QUEUED/SENDING row per (campaign, lead, step)
-- (prevents accidental double-enqueue; allows completed history)
drop index if exists ux_queue_pending_once;
create unique index ux_queue_pending_once
on public.send_queue(campaign_id, lead_id, step_no)
where status in ('pending','processing','queued','sending');


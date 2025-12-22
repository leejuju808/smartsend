-- Send attempt logs per queue item
-- Tracks each transition/attempt with provider metadata

create table if not exists public.send_attempt_logs (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid not null references public.send_queue(id) on delete cascade,
  campaign_id uuid,
  lead_id uuid,
  attempt_no int not null,
  status text not null, -- queued | sending | sent | failed | canceled
  provider text,
  error_code text,
  error_message text,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_attempt_logs_queue on public.send_attempt_logs (queue_id, created_at desc);
create index if not exists idx_attempt_logs_lead on public.send_attempt_logs (lead_id, created_at desc);
create index if not exists idx_attempt_logs_campaign on public.send_attempt_logs (campaign_id, created_at desc);



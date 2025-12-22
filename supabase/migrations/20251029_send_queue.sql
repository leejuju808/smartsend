-- Core send queue fields

create table if not exists public.send_queue (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  status text not null default 'queued', -- queued | sending | sent | failed | canceled
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  attempt int not null default 0,
  max_attempts int not null default 3,
  last_error text,
  provider text, -- 'gmail' | 'outlook'
  payload jsonb, -- rendered subject/body, etc.
  provider_thread_id text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists send_queue_status_sched_idx on public.send_queue (status, scheduled_at);
create index if not exists send_queue_campaign_idx on public.send_queue (campaign_id);
create index if not exists send_queue_lead_idx on public.send_queue (lead_id);

-- optional: per-campaign rate (emails per minute)
alter table public.campaigns add column if not exists rate_per_minute int not null default 30;

-- trigger to keep updated_at fresh
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_send_queue_touch on public.send_queue;
create trigger trg_send_queue_touch before update on public.send_queue
for each row execute function public.touch_updated_at();














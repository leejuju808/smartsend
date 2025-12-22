-- Ensure these fields exist (idempotent)
alter table public.send_queue
  add column if not exists scheduled_at timestamptz,              -- when we intend to send
  add column if not exists error text,
  add column if not exists updated_at timestamptz not null default now();

-- Update status column constraint if status column exists but doesn't have the right constraint
do $$ 
begin
  -- Add status column if it doesn't exist
  if not exists (select 1 from information_schema.columns 
                 where table_schema = 'public' and table_name = 'send_queue' and column_name = 'status') then
    alter table public.send_queue add column status text default 'queued';
  end if;
  
  -- Drop old constraint if it exists and doesn't match
  if exists (select 1 from pg_constraint 
             where conname = 'send_queue_status_check' 
             and contype = 'c') then
    alter table public.send_queue drop constraint if exists send_queue_status_check;
  end if;
  
  -- Add the new constraint
  alter table public.send_queue 
    add constraint send_queue_status_check 
    check (status in ('queued','scheduled','sending','sent','failed','canceled','retrying'));
  
  -- Set default if not already set
  alter table public.send_queue alter column status set default 'queued';
end $$;

-- Keep updated_at fresh
create or replace function public.tg_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end$$;

drop trigger if exists tg_send_queue_touch on public.send_queue;
create trigger tg_send_queue_touch before update on public.send_queue
for each row execute function public.tg_touch_updated_at();

-- Fast lookups
create index if not exists idx_send_queue_due on public.send_queue(scheduled_at) where status in ('queued','scheduled','retrying');
create index if not exists idx_send_queue_campaign_date on public.send_queue(campaign_id, scheduled_at);
create index if not exists idx_send_queue_status on public.send_queue(status);

-- Avoid duplicate queuing (same campaign+lead for the same first-touch "day").
-- If you use step_no per sequence, prefer (campaign_id, lead_id, step_no) unique.
do $$ begin
  if not exists (
    select 1 from pg_indexes
    where tablename='send_queue' and indexname='uq_send_queue_campaign_lead_once'
  ) then
    create unique index uq_send_queue_campaign_lead_once
      on public.send_queue(campaign_id, lead_id)
      where status in ('queued','scheduled');
  end if;
end $$;


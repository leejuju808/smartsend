-- 11_campaign_steps.sql

-- One campaign has many steps (touches)
create table if not exists public.campaign_steps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  step_no int not null check (step_no between 1 and 10),
  label text,
  delay_hours int not null default 0,
  subject text not null,
  body text not null,
  settings jsonb,
  created_at timestamptz default now()
);

create unique index if not exists idx_campaign_steps_unique
  on public.campaign_steps (campaign_id, step_no);

create index if not exists idx_campaign_steps_campaign
  on public.campaign_steps (campaign_id, step_no);

-- Optional: extend send_queue to include step info and scheduled time if not already present
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'send_queue' and column_name = 'step_no'
  ) then
    alter table public.send_queue add column step_no int;
  end if;

  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'send_queue' and column_name = 'scheduled_at'
  ) then
    alter table public.send_queue add column scheduled_at timestamptz;
  end if;
end $$;

create index if not exists idx_send_queue_scheduled
  on public.send_queue (scheduled_at, status);



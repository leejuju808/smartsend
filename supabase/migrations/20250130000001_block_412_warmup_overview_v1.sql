-- Block 412 — Email Warmup Overview Panel v1
-- Schema foundation for email warmup tracking

-- 1.1 Sender Identity Warmup Fields
alter table sender_identities
add column if not exists warmup_enabled boolean default false;

alter table sender_identities
add column if not exists warmup_daily_volume int default 20;

alter table sender_identities
add column if not exists warmup_reputation int default 50;  -- 0–100

alter table sender_identities
add column if not exists warmup_last_event timestamptz;

-- 1.2 Warmup Logs Table
create table if not exists warmup_logs (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references sender_identities(id) on delete cascade,
  event_type text not null check (
    event_type in (
      'warmup_sent',
      'warmup_received',
      'reputation_gain',
      'reputation_loss',
      'system'
    )
  ),
  details text,
  created_at timestamptz default now()
);

create index if not exists idx_warmup_logs_sender_id
  on warmup_logs(sender_id, created_at desc);

-- Enable RLS on warmup_logs
alter table warmup_logs enable row level security;

create policy "own warmup logs" on warmup_logs
for all using (
  exists (
    select 1 from sender_identities
    where sender_identities.id = warmup_logs.sender_id
    and sender_identities.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from sender_identities
    where sender_identities.id = warmup_logs.sender_id
    and sender_identities.user_id = auth.uid()
  )
);

-- 5. Troubleshooting Indicators v1
-- Add deliverability fields if not exists
alter table sender_identities
add column if not exists spf_valid boolean default false;

alter table sender_identities
add column if not exists dkim_valid boolean default false;

alter table sender_identities
add column if not exists dmarc_valid boolean default false;

alter table sender_identities
add column if not exists domain_created_at date;




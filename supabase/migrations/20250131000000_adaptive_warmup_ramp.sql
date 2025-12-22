-- Adaptive Warmup Ramp Tracking System
-- Historical stats, adaptive recalculation, and automated feedback loop

-- A) Historical warmup stats per account/day
create table if not exists public.warmup_history (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  date date not null default current_date,
  sent_count int not null default 0,
  delivered int not null default 0,
  bounces int not null default 0,
  complaints int not null default 0,
  open_rate numeric(5,2) default 0,
  reply_rate numeric(5,2) default 0,
  engagement_score numeric(6,2) default 0,   -- 0–100 adaptive score
  quota_used numeric(6,2) default 0,         -- percent of ramp limit used
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(account_id, date)
);

create index if not exists idx_warmup_history_account_date on public.warmup_history(account_id, date desc);
create index if not exists idx_warmup_history_date on public.warmup_history(date desc);

-- B) Link to account_warmup_profiles (add adaptive columns)
alter table public.account_warmup_profiles
  add column if not exists adaptive_enabled boolean not null default true,
  add column if not exists adaptive_factor numeric(5,2) default 1.00,  -- multiplier from performance
  add column if not exists last_recalc timestamptz;

-- C) Helper view: last 7 days rolling performance
create or replace view public.v_warmup_recent as
select
  w.account_id,
  avg(engagement_score) as avg_eng,
  avg(open_rate) as avg_open,
  avg(reply_rate) as avg_reply,
  avg(complaints) as avg_complaints,
  avg(bounces) as avg_bounces
from public.warmup_history w
where w.date >= current_date - interval '7 days'
group by 1;

-- D) Adaptive recalculation logic
create or replace function public.recalc_warmup_ramp(p_account uuid)
returns void language plpgsql security definer as $$
declare
  prof record;
  perf record;
  base_start int;
  base_inc int;
  new_factor numeric;
  new_inc int;
  new_cap int;
  engagement numeric;
  penalty numeric := 1.0;
begin
  select * into prof from public.account_warmup_profiles where account_id = p_account;
  if not found then return; end if;
  
  select * into perf from public.v_warmup_recent where account_id = p_account;
  if not found then return; end if;

  -- Compute engagement baseline
  engagement := coalesce(perf.avg_eng,50);

  -- Penalty rules
  if coalesce(perf.avg_bounces,0) > 5 or coalesce(perf.avg_complaints,0) > 1 then
    penalty := 0.6;
  elsif engagement > 70 then
    penalty := 1.2;
  elsif engagement < 40 then
    penalty := 0.8;
  end if;

  new_factor := greatest(0.5, least(1.5, prof.adaptive_factor * penalty));
  new_inc := round(prof.daily_ramp_increment * new_factor);
  new_cap := least(2000, round(prof.daily_ramp_cap * new_factor));

  update public.account_warmup_profiles
     set adaptive_factor = new_factor,
         daily_ramp_increment = new_inc,
         daily_ramp_cap = new_cap,
         last_recalc = now()
   where account_id = p_account;
end;
$$;

-- Run this for all accounts nightly
create or replace function public.recalc_all_warmups()
returns void language plpgsql security definer as $$
begin
  perform public.recalc_warmup_ramp(a.id)
  from public.accounts a
  join public.account_warmup_profiles p on p.account_id = a.id
  where p.adaptive_enabled = true;
end;
$$;

-- E) Engagement data feeding (auto from events)
-- Aggregate daily send outcomes into warmup_history
create or replace function public.rollup_warmup_history()
returns void language plpgsql as $$
begin
  insert into public.warmup_history(account_id, date, sent_count, delivered, bounces, complaints, open_rate, reply_rate, engagement_score, quota_used)
  select
    q.account_id,
    current_date,
    count(*) filter (where q.status='sent'),
    count(*) filter (where q.status='sent'),
    count(*) filter (where e.event_type='bounce'),
    count(*) filter (where e.event_type='complaint'),
    100.0 * count(*) filter (where e.event_type='opened') / nullif(count(*) filter (where q.status='sent'),0),
    100.0 * count(*) filter (where q.status='sent' and coalesce((q.payload->>'reply_detected')::boolean, false)=true) / nullif(count(*) filter (where q.status='sent'),0),
    greatest(0, least(100,
      (100.0 * count(*) filter (where e.event_type='opened') / nullif(count(*) filter (where q.status='sent'),0))
      - (2 * count(*) filter (where e.event_type='complaint'))
      - (1 * count(*) filter (where e.event_type='bounce'))
    )),
    100.0 * count(*) filter (where q.status='sent') /
      nullif( (select daily_ramp_cap from public.account_warmup_profiles p where p.account_id=q.account_id),0)
  from public.send_queue q
  left join public.provider_event_logs e on e.queue_id=q.id
  where q.sent_at::date = current_date
    and q.account_id is not null
  group by q.account_id
  on conflict (account_id, date)
  do update set
    sent_count=excluded.sent_count,
    delivered=excluded.delivered,
    bounces=excluded.bounces,
    complaints=excluded.complaints,
    open_rate=excluded.open_rate,
    reply_rate=excluded.reply_rate,
    engagement_score=excluded.engagement_score,
    quota_used=excluded.quota_used,
    updated_at=now();
end;
$$;

-- Grant execute permissions
grant execute on function public.recalc_warmup_ramp(uuid) to service_role;
grant execute on function public.recalc_all_warmups() to service_role;
grant execute on function public.rollup_warmup_history() to service_role;


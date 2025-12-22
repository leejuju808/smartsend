-- Lead safety rules and per-lead state tracking

create table if not exists public.lead_safety_rules (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  max_sends int not null default 5,
  min_open_rate real not null default 0.05,
  min_reply_rate real not null default 0.002,
  cooldown_days int not null default 14,
  auto_reenable boolean not null default true,
  window_days int not null default 30
);

create table if not exists public.lead_safety_states (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  status text not null check (status in ('active', 'cooldown', 'blocked')) default 'active',
  last_reason text,
  until timestamptz,
  total_sends int not null default 0,
  total_opens int not null default 0,
  total_replies int not null default 0,
  last_eval timestamptz
);

create unique index if not exists idx_safety_lead_unique on public.lead_safety_states (campaign_id, lead_id);
create index if not exists idx_safety_lead_status on public.lead_safety_states (status);

create or replace function public.tg_touch_safety_updated()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_safety_states on public.lead_safety_states;
create trigger trg_touch_safety_states
before update on public.lead_safety_states
for each row
execute function public.tg_touch_safety_updated();

create or replace view public.v_safe_leads as
select lead_id, campaign_id
from public.lead_safety_states
where status = 'active'
   or (status = 'cooldown' and until < now());

create or replace view public.v_lead_safety_metrics as
with config as (
  select campaign_id, window_days
  from public.lead_safety_rules
  union all
  select null::uuid as campaign_id, 30::int as window_days
),
windowed as (
  select
    cfg.campaign_id as cfg_campaign,
    cfg.window_days,
    coalesce(sl.campaign_id, te.campaign_id, re.campaign_id) as campaign_id,
    coalesce(sl.lead_id, te.lead_id, re.lead_id) as lead_id,
    coalesce(sl.sends, 0) as sends,
    coalesce(te.opens, 0) as opens,
    coalesce(re.replies, 0) as replies
  from (
    select campaign_id, lead_id, count(*) filter (where event = 'sent') as sends
    from public.send_logs
    where created_at >= now() - (select min(window_days) from config) * interval '1 day'
    group by 1,2
  ) sl
  full join (
    select campaign_id, lead_id, count(*) as opens
    from public.tracking_events
    where event = 'open'
      and created_at >= now() - (select min(window_days) from config) * interval '1 day'
    group by 1,2
  ) te using (campaign_id, lead_id)
  full join (
    select campaign_id, lead_id, count(*) as replies
    from public.reply_events
    where created_at >= now() - (select min(window_days) from config) * interval '1 day'
    group by 1,2
  ) re using (campaign_id, lead_id)
  join config cfg
    on cfg.campaign_id = coalesce(sl.campaign_id, te.campaign_id, re.campaign_id)
    or (cfg.campaign_id is null and not exists (
      select 1
      from public.lead_safety_rules r
      where r.campaign_id = coalesce(sl.campaign_id, te.campaign_id, re.campaign_id)
    ))
)
select
  campaign_id,
  lead_id,
  sends,
  opens,
  replies,
  case when sends > 0 then opens::real / sends else 0 end as open_rate,
  case when sends > 0 then replies::real / sends else 0 end as reply_rate
from windowed
where campaign_id is not null
  and lead_id is not null;


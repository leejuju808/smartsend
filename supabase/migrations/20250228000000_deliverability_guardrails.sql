-- Deliverability Guardrails System
-- Policies, health view, and guardrail RPCs (idempotent)

-- A) Helpful indexes for counters
create index if not exists idx_logs_account_created on public.send_logs(account_id, created_at desc);
create index if not exists idx_logs_campaign_created on public.send_logs(campaign_id, created_at desc);
create index if not exists idx_msgs_ai_label_created on public.inbox_messages(ai_label, created_at desc);

-- B) Deliverability policies (hierarchy: campaign > account > global default)
create table if not exists public.deliverability_policies (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete cascade,        -- owner/tenant default
  account_id uuid references public.connected_accounts(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,

  -- hard caps
  max_daily int,         -- e.g., 200
  max_hourly int,        -- e.g., 40

  -- warmup (daily cap ramps up)
  warmup_start int,      -- e.g., 20/day day 0
  warmup_increment int,  -- e.g., +10 per day
  warmup_days int,       -- e.g., 10 days ramp window (cap at max_daily after)

  -- quality thresholds (rolling 7d)
  bounce_rate_max numeric,  -- e.g., 0.03 (3%)
  unsub_rate_max numeric,   -- e.g., 0.02 (2%)

  active boolean not null default true,
  unique (campaign_id),
  unique (account_id),
  unique (user_id)
);

alter table public.deliverability_policies enable row level security;

drop policy if exists pol_view_dpol on public.deliverability_policies;
create policy pol_view_dpol on public.deliverability_policies
for select using (
  coalesce(
    (user_id = auth.uid()),
    exists(select 1 from public.connected_accounts a where a.id = account_id and a.user_id = auth.uid()),
    exists(select 1 from public.campaign_members cm where cm.campaign_id = campaign_id and cm.user_id = auth.uid())
  )
);

drop policy if exists pol_edit_dpol on public.deliverability_policies;
create policy pol_edit_dpol on public.deliverability_policies
for insert with check (user_id = auth.uid() or public.is_campaign_owner(campaign_id))
, for update using (user_id = auth.uid() or public.is_campaign_owner(campaign_id))
, for delete using (user_id = auth.uid() or public.is_campaign_owner(campaign_id));

-- C) View: campaign health (7d rolling)
create or replace view public.v_campaign_health as
with window as (select now() - interval '7 days' as since),
sent as (
  select c.id campaign_id, count(*) sent_7d
  from public.campaigns c
  join public.send_logs l on l.campaign_id = c.id
  join window w on l.created_at >= w.since
  where l.status = 'sent'
  group by c.id
),
unsub as (
  select te.campaign_id, count(*) unsubs_7d
  from public.tracking_events te
  join window w on te.created_at >= w.since
  where te.kind = 'unsubscribe'
  group by te.campaign_id
),
bounce as (
  -- treat inbound messages labeled 'bounce' as bounces against that campaign/thread
  select t.campaign_id, count(*) bounces_7d
  from public.inbox_messages m
  join public.inbox_threads t on t.id = m.thread_id
  join window w on m.created_at >= w.since
  where m.direction='in' and m.ai_label='bounce'
  group by t.campaign_id
)
select
  c.id as campaign_id,
  coalesce(s.sent_7d,0) as sent_7d,
  coalesce(u.unsubs_7d,0) as unsubs_7d,
  coalesce(b.bounces_7d,0) as bounces_7d,
  case when coalesce(s.sent_7d,0)>0 then (coalesce(b.bounces_7d,0)::numeric / s.sent_7d) else 0 end as bounce_rate_7d,
  case when coalesce(s.sent_7d,0)>0 then (coalesce(u.unsubs_7d,0)::numeric / s.sent_7d) else 0 end as unsub_rate_7d
from public.campaigns c
left join sent   s on s.campaign_id=c.id
left join unsub  u on u.campaign_id=c.id
left join bounce b on b.campaign_id=c.id;

-- Note: Views don't support RLS directly, access is controlled via underlying tables
-- The view uses can_view_campaign implicitly through joins to campaigns table

-- D) Helper: resolve effective policy for a send (campaign/account/user fallback)
create or replace function public._resolve_policy(p_campaign uuid, p_account uuid)
returns public.deliverability_policies language sql stable as $$
  with pol as (
    -- precedence: campaign > account > user(owner of campaign) > system defaults
    select *
    from public.deliverability_policies dp
    where dp.active is true
      and (dp.campaign_id = p_campaign or dp.account_id = p_account
           or dp.user_id = (select user_id from public.campaigns where id=p_campaign))
    order by
      (dp.campaign_id is not null) desc,
      (dp.account_id is not null) desc,
      (dp.user_id   is not null) desc,
      created_at desc
    limit 1
  )
  select coalesce((
    select row(pol.*)::public.deliverability_policies from pol
  ), (
    -- default policy row if none configured (tune as you like)
    select row(
      gen_random_uuid(), now(), null, null, null,
      200, 40, 20, 10, 10, 0.03, 0.02, true
    )::public.deliverability_policies
  ));
$$;

-- E) Helper: compute warmup-adjusted daily cap
create or replace function public._warmup_cap(p_account uuid, p_max_daily int, p_wstart int, p_winc int, p_wdays int)
returns int language sql stable as $$
  with first as (
    select min(created_at)::date as first_day
    from public.send_logs
    where account_id = p_account
      and status = 'sent'
  )
  select case
    when p_wstart is null or p_winc is null or p_wdays is null then p_max_daily
    else
      least(
        p_max_daily,
        p_wstart + greatest(0, least(p_wdays, coalesce((current_date - (select first_day from first))::int, 0))) * p_winc
      )
  end;
$$;

-- F) RPC: guardrails_check — returns whether we can send right now
create or replace function public.guardrails_check(
  p_campaign uuid,
  p_account uuid,
  p_now timestamptz default now()
) returns table(
  ok boolean,
  reason text,
  remaining_hour int,
  remaining_day int
) language plpgsql stable as $$
declare
  pol public.deliverability_policies;
  sent_hour int;
  sent_day int;
  cap_daily int;
  cap_hour int;
  unsub_rate numeric;
  bounce_rate numeric;
begin
  -- resolve effective policy
  pol := public._resolve_policy(p_campaign, p_account);

  -- effective caps
  cap_hour := coalesce(pol.max_hourly, 40);
  cap_daily := public._warmup_cap(
    p_account,
    coalesce(pol.max_daily, 200),
    pol.warmup_start, pol.warmup_increment, pol.warmup_days
  );

  -- usage in last hour/day
  select count(*) into sent_hour from public.send_logs
    where account_id = p_account 
      and created_at >= (p_now - interval '1 hour')
      and status = 'sent';

  select count(*) into sent_day from public.send_logs
    where account_id = p_account 
      and created_at::date = p_now::date
      and status = 'sent';

  -- quality (7d)
  with s as (
    select count(*)::numeric as cnt
    from public.send_logs
    where campaign_id = p_campaign 
      and created_at >= (p_now - interval '7 days')
      and status = 'sent'
  ),
  u as (
    select count(*)::numeric as cnt
    from public.tracking_events
    where campaign_id = p_campaign 
      and kind='unsubscribe' 
      and created_at >= (p_now - interval '7 days')
  ),
  b as (
    select count(*)::numeric as cnt
    from public.inbox_messages m
    join public.inbox_threads t on t.id = m.thread_id
    where t.campaign_id = p_campaign
      and m.direction='in' 
      and m.ai_label='bounce'
      and m.created_at >= (p_now - interval '7 days')
  )
  select case when s.cnt>0 then b.cnt/s.cnt else 0 end,
         case when s.cnt>0 then u.cnt/s.cnt else 0 end
    into bounce_rate, unsub_rate
  from s,u,b;

  -- exceed quality?
  if pol.bounce_rate_max is not null and bounce_rate > pol.bounce_rate_max then
    ok := false; 
    reason := format('blocked:bounce_rate_7d %.2f%% > %.2f%%', bounce_rate*100, pol.bounce_rate_max*100);
    remaining_hour := greatest(cap_hour - sent_hour, 0);
    remaining_day  := greatest(cap_daily - sent_day, 0);
    return next;
    return;
  end if;

  if pol.unsub_rate_max is not null and unsub_rate > pol.unsub_rate_max then
    ok := false; 
    reason := format('blocked:unsub_rate_7d %.2f%% > %.2f%%', unsub_rate*100, pol.unsub_rate_max*100);
    remaining_hour := greatest(cap_hour - sent_hour, 0);
    remaining_day  := greatest(cap_daily - sent_day, 0);
    return next;
    return;
  end if;

  -- exceed volume caps?
  if sent_hour >= cap_hour then
    ok := false; 
    reason := 'blocked:hourly_cap';
    remaining_hour := 0; 
    remaining_day := greatest(cap_daily - sent_day, 0);
    return next;
    return;
  end if;

  if sent_day >= cap_daily then
    ok := false; 
    reason := 'blocked:daily_cap';
    remaining_hour := greatest(cap_hour - sent_hour, 0); 
    remaining_day := 0;
    return next;
    return;
  end if;

  -- ok to send
  ok := true; 
  reason := null;
  remaining_hour := greatest(cap_hour - sent_hour, 0);
  remaining_day  := greatest(cap_daily - sent_day, 0);
  return next;
end;
$$;

grant execute on function public.guardrails_check(uuid, uuid, timestamptz) to authenticated, service_role;
grant execute on function public._resolve_policy(uuid, uuid) to authenticated, service_role;
grant execute on function public._warmup_cap(uuid, int, int, int, int) to authenticated, service_role;


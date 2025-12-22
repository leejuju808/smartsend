-- 1) Canonical send events log -----------------------------------------------
create table if not exists public.send_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  kind text not null check (kind in ('queued','sent','failed','bounced')),
  message_id text
);

create index if not exists idx_send_events_account_time
  on public.send_events(account_id, created_at);

create index if not exists idx_send_events_kind
  on public.send_events(kind);


-- 2) Account quota storage ----------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'send_queue'
      and column_name = 'account_id'
  ) then
    alter table public.send_queue
      add column account_id uuid references public.accounts(id) on delete cascade;
  end if;
exception
  when undefined_table then null;
end;
$$;

create table if not exists public.account_send_quota (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  base_monthly_quota int not null default 1000,
  bonus_credits int not null default 0,
  carryover_credits int not null default 0,
  hard_enforce boolean not null default true,
  updated_at timestamptz not null default now()
);


-- Helper: increment bonus credits --------------------------------------------
create or replace function public.inc_bonus_credits(p_account uuid, p_delta int)
returns void
language sql
as $$
  insert into public.account_send_quota(account_id, bonus_credits)
  values (p_account, greatest(p_delta, 0))
  on conflict (account_id)
  do update set bonus_credits = public.account_send_quota.bonus_credits + greatest(excluded.bonus_credits, 0),
                updated_at = now();
$$;


-- 3) Billing window aligned to Stripe subscriptions --------------------------
create or replace view public.account_billing_window as
select
  s.account_id,
  (s.current_period_end - interval '1 month') as window_start,
  s.current_period_end as window_end
from public.account_subscriptions s
where s.subscription_status in ('active','trialing','past_due');


-- 4) Usage within active window ----------------------------------------------
create or replace view public.account_monthly_usage as
select
  w.account_id,
  count(se.id)::int as sent_this_window
from public.account_billing_window w
left join public.send_events se
  on se.account_id = w.account_id
 and se.kind = 'sent'
 and se.created_at >= w.window_start
 and se.created_at <  w.window_end
group by w.account_id;


-- 5) Rollup of quota + usage --------------------------------------------------
create or replace view public.account_send_status as
select
  q.account_id,
  q.base_monthly_quota,
  q.bonus_credits,
  q.carryover_credits,
  coalesce(u.sent_this_window, 0) as sent_this_window,
  (q.base_monthly_quota + q.carryover_credits + q.bonus_credits - coalesce(u.sent_this_window, 0))::int as remaining,
  bw.window_start,
  bw.window_end,
  subs.subscription_status
from public.account_send_quota q
join public.account_billing_window bw
  on bw.account_id = q.account_id
left join public.account_monthly_usage u
  on u.account_id = q.account_id
join public.account_subscriptions subs
  on subs.account_id = q.account_id;


-- 6) Pre-queue guard ----------------------------------------------------------
create or replace function public.enforce_send_quota()
returns trigger
language plpgsql
as $$
declare
  v_account uuid := new.account_id;
  v_remaining int;
  v_hard boolean;
  v_window_end timestamptz;
begin
  if v_account is null then
    -- queue row does not scope to an account; allow
    return new;
  end if;

  select
    (q.base_monthly_quota + q.carryover_credits + q.bonus_credits - coalesce(u.sent_this_window, 0))::int as remaining,
    q.hard_enforce,
    bw.window_end
  into v_remaining, v_hard, v_window_end
  from public.account_send_quota q
  join public.account_billing_window bw
    on bw.account_id = q.account_id
  left join public.account_monthly_usage u
    on u.account_id = q.account_id
  where q.account_id = v_account
  for update;

  if not found then
    insert into public.account_send_quota(account_id)
    values (v_account)
    on conflict (account_id) do nothing;
    return new;
  end if;

  if v_remaining <= 0 and v_hard then
    raise exception 'Monthly send limit reached. Purchase top-ups or wait until %', v_window_end
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_send_quota on public.send_queue;
create trigger trg_enforce_send_quota
  before insert on public.send_queue
  for each row execute function public.enforce_send_quota();


-- 7) Log send usage -----------------------------------------------------------
create or replace function public.log_sent_event(
  p_account uuid,
  p_campaign uuid,
  p_lead uuid,
  p_message text
)
returns void
language sql
as $$
  insert into public.send_events(account_id, campaign_id, lead_id, kind, message_id)
  values (p_account, p_campaign, p_lead, 'sent', p_message);
$$;


-- 8) Monthly rollover via pg_cron ---------------------------------------------
create or replace function public.monthly_rollover()
returns void
language plpgsql
as $$
declare
  r record;
  unused int;
  carry int;
begin
  for r in select * from public.account_send_status loop
    if now() >= r.window_end and now() < r.window_end + interval '1 hour' then
      unused := greatest(r.base_monthly_quota + r.carryover_credits + r.bonus_credits - r.sent_this_window, 0);
      carry := least(unused, (r.base_monthly_quota / 2));

      update public.account_send_quota
         set carryover_credits = carry,
             bonus_credits = greatest(unused - carry, 0),
             updated_at = now()
       where account_id = r.account_id;
    end if;
  end loop;
end;
$$;

do $$
begin
  perform cron.schedule('quota-monthly-rollover', '5 * * * *', $$select public.monthly_rollover();$$);
exception
  when undefined_function then null;
  when invalid_schema_name then null;
  when unique_violation then null;
end;
$$;



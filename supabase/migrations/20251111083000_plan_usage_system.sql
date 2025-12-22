-- Plan catalog, entitlements, usage counters, and enforcement helpers

-- A) Plan catalog --------------------------------------------------------------
create table if not exists public.plans (
  id text primary key,                       -- 'free','pro','team'
  name text not null,
  sort int not null default 100
);

insert into public.plans(id, name, sort) values
  ('free','Free',10),
  ('pro','Pro',20),
  ('team','Team',30)
on conflict (id) do nothing;


-- B) Entitlements per plan -----------------------------------------------------
create table if not exists public.plan_entitlements (
  plan_id text references public.plans(id) on delete cascade,
  key text not null,                         -- 'max_seats','max_contacts','emails_month','ai_rewrites_month','shared_campaigns','priority_sending','audit_log'
  value jsonb not null,                      -- number or boolean in JSON
  primary key (plan_id, key)
);

insert into public.plan_entitlements(plan_id, key, value) values
  ('free','max_seats',          to_jsonb(1)),
  ('free','max_contacts',       to_jsonb(1000)),
  ('free','emails_month',       to_jsonb(200)),
  ('free','ai_rewrites_month',  to_jsonb(50)),
  ('free','shared_campaigns',   to_jsonb(0)),
  ('free','priority_sending',   to_jsonb(false)),
  ('free','audit_log',          to_jsonb(false)),
  ('pro','max_seats',           to_jsonb(3)),
  ('pro','max_contacts',        to_jsonb(25000)),
  ('pro','emails_month',        to_jsonb(5000)),
  ('pro','ai_rewrites_month',   to_jsonb(1000)),
  ('pro','shared_campaigns',    to_jsonb(5)),
  ('pro','priority_sending',    to_jsonb(true)),
  ('pro','audit_log',           to_jsonb(true)),
  ('team','max_seats',          to_jsonb(10)),
  ('team','max_contacts',       to_jsonb(100000)),
  ('team','emails_month',       to_jsonb(50000)),
  ('team','ai_rewrites_month',  to_jsonb(10000)),
  ('team','shared_campaigns',   to_jsonb(999)),
  ('team','priority_sending',   to_jsonb(true)),
  ('team','audit_log',          to_jsonb(true))
on conflict (plan_id, key) do update set value = excluded.value;


-- C) Account → plan mapping (synced with Stripe) -------------------------------
create table if not exists public.account_billing (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  plan_id text not null references public.plans(id),
  seats_purchased int not null default 1,
  cycle_anchor date not null default (date_trunc('month', now())),
  updated_at timestamptz not null default now()
);


-- D) Usage counters, monthly window -------------------------------------------
create table if not exists public.usage_counters (
  account_id uuid not null references public.accounts(id) on delete cascade,
  metric text not null,                      -- 'emails_sent','ai_rewrites','contacts_created','campaigns_shared'
  month date not null,                       -- first day of month (UTC)
  count bigint not null default 0,
  primary key (account_id, metric, month)
);

create index if not exists idx_usage_account_month
  on public.usage_counters(account_id, month);


-- E) Helpers: current month, read entitlement ----------------------------------
create or replace function public.usage_month(d timestamptz default now())
returns date
language sql
immutable
as $$
  select date_trunc('month', d)::date
$$;

create or replace function public.get_entitlement(p_account uuid, p_key text)
returns jsonb
language sql
stable
as $$
  select e.value
  from public.account_billing b
  join public.plan_entitlements e
    on e.plan_id = b.plan_id
   and e.key = p_key
  where b.account_id = p_account
$$;


-- F) Increment usage safely ----------------------------------------------------
create or replace function public.bump_usage(p_account uuid, p_metric text, p_delta int default 1)
returns void
language plpgsql
as $$
declare
  v_month date := public.usage_month();
begin
  if p_account is null then
    return;
  end if;

  insert into public.usage_counters(account_id, metric, month, count)
  values (p_account, p_metric, v_month, greatest(p_delta, 0))
  on conflict (account_id, metric, month)
  do update set count = public.usage_counters.count + excluded.count;
end
$$;


-- G) Check limit; raises error if exceeded ------------------------------------
create or replace function public.assert_within_limit(p_account uuid, p_metric text, p_entitlement_key text)
returns void
language plpgsql
as $$
declare
  v_month date := public.usage_month();
  v_used bigint;
  v_limit int;
  v_left int;
begin
  if p_account is null then
    return;
  end if;

  select coalesce(count, 0)
    into v_used
  from public.usage_counters
  where account_id = p_account
    and metric = p_metric
    and month = v_month;

  select (public.get_entitlement(p_account, p_entitlement_key))::text::int
    into v_limit;

  if v_limit is null then
    raise exception 'Missing entitlement %', p_entitlement_key
      using errcode = 'UL001';
  end if;

  v_left := v_limit - v_used;

  if v_left <= 0 then
    raise exception 'Limit reached for % (used %, limit %)', p_metric, v_used, v_limit
      using errcode = 'ULMAX';
  end if;
end
$$;


-- H) Enforcement: send queue ---------------------------------------------------
create or replace function public.guard_emails_month()
returns trigger
language plpgsql
as $$
declare
  v_account uuid;
begin
  select account_id
    into v_account
  from public.campaigns
  where id = new.campaign_id;

  if v_account is null then
    return new;
  end if;

  perform public.assert_within_limit(v_account, 'emails_sent', 'emails_month');
  perform public.bump_usage(v_account, 'emails_sent', 1);

  return new;
end
$$;

drop trigger if exists trg_guard_emails_month on public.send_queue;
create trigger trg_guard_emails_month
before insert on public.send_queue
for each row execute function public.guard_emails_month();


-- I) Contacts cap --------------------------------------------------------------
create or replace function public.guard_contacts_create()
returns trigger
language plpgsql
as $$
declare
  v_account uuid;
  v_limit int;
  v_current int;
begin
  select account_id
    into v_account
  from public.campaigns
  where id = new.campaign_id;

  if v_account is null then
    return new;
  end if;

  select (public.get_entitlement(v_account, 'max_contacts'))::text::int
    into v_limit;

  if v_limit is null then
    raise exception 'Missing entitlement max_contacts'
      using errcode = 'UL001';
  end if;

  select count(*)
    into v_current
  from public.leads l
  join public.campaigns c
    on c.id = l.campaign_id
  where c.account_id = v_account;

  if v_current >= v_limit then
    raise exception 'Contact limit reached (% of %)', v_current, v_limit
      using errcode = 'ULCONTACT';
  end if;

  return new;
end
$$;

drop trigger if exists trg_guard_contacts_create on public.leads;
create trigger trg_guard_contacts_create
before insert on public.leads
for each row execute function public.guard_contacts_create();


-- J) Read plan caps ------------------------------------------------------------
create or replace function public.read_plan_caps(p_account uuid)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
  from public.account_billing b
  join public.plan_entitlements e
    on e.plan_id = b.plan_id
  where b.account_id = p_account
$$;


-- K) Seat enforcement note -----------------------------------------------------
comment on function public.read_plan_caps is
  'Returns a JSON blob of plan entitlements for the provided account.';




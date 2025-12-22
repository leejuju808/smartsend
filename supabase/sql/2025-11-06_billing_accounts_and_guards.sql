-- Billing Accounts + Guards (Idempotent)

-- A) One billing account per owner (attach to auth.users)
create table if not exists public.billing_accounts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text,
  plan text check (plan in ('free','starter','pro','team')) default 'free',
  status text check (status in ('none','trialing','active','past_due','canceled','incomplete')) default 'none',
  seats int not null default 1,
  period_end timestamptz,
  meta jsonb default '{}'::jsonb,
  unique(user_id)
);

-- Ensure required columns & constraints exist on legacy installs
do $$ begin
  begin
    alter table public.billing_accounts
      add column plan text default 'free';
  exception when duplicate_column then null; end;

  begin
    alter table public.billing_accounts
      add column status text default 'none';
  exception when duplicate_column then null; end;

  begin
    alter table public.billing_accounts
      add column seats int not null default 1;
  exception when duplicate_column then null; end;

  begin
    alter table public.billing_accounts
      add column period_end timestamptz;
  exception when duplicate_column then null; end;

  begin
    alter table public.billing_accounts
      add column meta jsonb default '{}'::jsonb;
  exception when duplicate_column then null; end;

  begin
    alter table public.billing_accounts
      add constraint billing_accounts_plan_chk
        check (plan in ('free','starter','pro','team'));
  exception when duplicate_object then null; end;

  begin
    alter table public.billing_accounts
      add constraint billing_accounts_status_chk
        check (status in ('none','trialing','active','past_due','canceled','incomplete'));
  exception when duplicate_object then null; end;

  begin
    create unique index if not exists billing_accounts_user_id_key on public.billing_accounts(user_id);
  exception when others then null; end;
end $$;

create index if not exists idx_billing_user on public.billing_accounts(user_id);
create index if not exists idx_billing_status on public.billing_accounts(status);

-- Backfill defaults if missing
update public.billing_accounts
set plan = coalesce(nullif(plan,''), 'free')
where plan is null or plan not in ('free','starter','pro','team');

update public.billing_accounts
set status = coalesce(nullif(status,''), 'none')
where status is null or status not in ('none','trialing','active','past_due','canceled','incomplete');

update public.billing_accounts
set seats = 1
where seats is null or seats < 1;

-- B) Mirror subscriptions for history/audits
create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  billing_account_id uuid not null references public.billing_accounts(id) on delete cascade,
  stripe_subscription_id text not null,
  plan text not null,
  status text not null,
  seats int not null default 1,
  current_period_end timestamptz,
  raw jsonb
);

create index if not exists idx_bsub_acc on public.billing_subscriptions(billing_account_id);
create unique index if not exists uq_bsub_stripe on public.billing_subscriptions(stripe_subscription_id);

-- C) Row Level Security
alter table public.billing_accounts enable row level security;
alter table public.billing_subscriptions enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'billing self view' and schemaname = 'public' and tablename = 'billing_accounts') then
    create policy "billing self view" on public.billing_accounts
      for select using (user_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where policyname = 'billing self update' and schemaname = 'public' and tablename = 'billing_accounts') then
    create policy "billing self update" on public.billing_accounts
      for update using (user_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where policyname = 'bsub self view' and schemaname = 'public' and tablename = 'billing_subscriptions') then
    create policy "bsub self view" on public.billing_subscriptions
      for select using (
        exists (
          select 1 from public.billing_accounts b
          where b.id = billing_subscriptions.billing_account_id and b.user_id = auth.uid()
        )
      );
  end if;
end $$;

-- D) Helper: upsert billing account for current user (on first visit)
create or replace function public.ensure_billing_account()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.billing_accounts where user_id = auth.uid();
  if v_id is null then
    insert into public.billing_accounts(user_id, plan, status)
    values (auth.uid(), 'free', 'none')
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- E) Helper: is_active (active or trialing and not expired)
create or replace function public.billing_is_active(p_user uuid)
returns boolean
language sql
stable
as $$
  select coalesce(
    (select (status in ('active','trialing')) and (period_end is null or period_end > now())
     from public.billing_accounts where user_id = p_user),
    false
  );
$$;

-- F) Hard DB guard: prevent enqueuing sends for non-active users
create or replace function public._guard_send_enqueue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from public.campaigns where id = new.campaign_id;
  if v_owner is null then
    return new;
  end if;
  if not public.billing_is_active(v_owner) then
    raise exception 'Billing inactive: upgrade to send emails';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_send_enqueue on public.send_queue;
create trigger trg_guard_send_enqueue
before insert on public.send_queue
for each row execute function public._guard_send_enqueue();

-- G) Free plan caps: limit campaigns/leads
create or replace function public.guard_free_caps()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_user uuid;
  v_leads int;
  v_camps int;
begin
  v_user := coalesce(auth.uid(), new.user_id);
  if v_user is null then
    return new;
  end if;

  select plan into v_plan from public.billing_accounts where user_id = v_user;
  if v_plan is null or v_plan = 'free' then
    if TG_TABLE_NAME = 'campaigns' then
      select count(*) into v_camps from public.campaigns where user_id = v_user;
      if v_camps >= 1 then
        raise exception 'Free plan limit: 1 campaign';
      end if;
    end if;

    if TG_TABLE_NAME = 'leads' then
      select count(*) into v_leads from public.leads where user_id = v_user;
      if v_leads >= 100 then
        raise exception 'Free plan limit: 100 leads';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_campaigns on public.campaigns;
create trigger trg_guard_campaigns
before insert on public.campaigns
for each row execute function public.guard_free_caps();

drop trigger if exists trg_guard_leads on public.leads;
create trigger trg_guard_leads
before insert on public.leads
for each row execute function public.guard_free_caps();


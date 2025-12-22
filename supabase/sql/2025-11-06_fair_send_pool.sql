-- Fair-send sender pool + pacing helpers

-- A) Campaign sender pool (allow 1..N accounts per campaign)
create table if not exists public.campaign_senders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  weight numeric not null default 1.0 check (weight >= 0 and weight <= 10),
  enabled boolean not null default true,
  unique (campaign_id, account_id)
);

create index if not exists idx_camp_senders_campaign on public.campaign_senders(campaign_id) where enabled;


-- B) Per-account pacing/cooldown (simple local state; expand as needed)
alter table public.account_rate_state
  add column if not exists per_min int not null default 20,
  add column if not exists sent_this_min int not null default 0,
  add column if not exists window_started_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'account_rate_state'
      and column_name = 'per_minute'
  ) then
    execute $sql$
      update public.account_rate_state
         set per_min = coalesce(per_min, per_minute)
    $sql$;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'account_rate_state'
      and column_name = 'sent_in_window'
  ) then
    execute $sql$
      update public.account_rate_state
         set sent_this_min = coalesce(sent_this_min, sent_in_window)
    $sql$;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'account_rate_state'
      and column_name = 'window_start'
  ) then
    execute $sql$
      update public.account_rate_state
         set window_started_at = coalesce(window_started_at, window_start)
    $sql$;
  end if;
end;
$$;

create index if not exists idx_rate_cooldown on public.account_rate_state(cooldown_until);

create or replace function public._touch_rate_state()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_rate_state on public.account_rate_state;
create trigger trg_touch_rate_state
before update on public.account_rate_state
for each row execute function public._touch_rate_state();


-- C) Ensure send_queue can hold an assigned account
alter table public.send_queue
  add column if not exists from_account_id uuid references public.connected_accounts(id) on delete set null;

create index if not exists idx_queue_assigned on public.send_queue(from_account_id) where from_account_id is not null;


-- D) Picker: choose best account for a (campaign, to_email domain) now
drop function if exists public.pick_sending_account(uuid, text);
create or replace function public.pick_sending_account(
  p_campaign uuid,
  p_domain text
) returns uuid
language plpgsql
stable
as $$
declare
  chosen uuid;
begin
  with pool as (
    select cs.account_id, cs.weight
    from public.campaign_senders cs
    where cs.campaign_id = p_campaign
      and cs.enabled
  ),
  base as (
    select
      coalesce(p.account_id, c.from_account_id) as account_id,
      coalesce(p.weight, 1.0) as weight
    from public.campaigns c
    left join pool p on true
    where c.id = p_campaign
  ),
  rows as (
    select distinct on (account_id)
      b.account_id,
      b.weight,
      coalesce(rs.per_min, 20) as per_min,
      coalesce(rs.sent_this_min, 0) as sent_this_min,
      rs.window_started_at,
      rs.cooldown_until,
      coalesce(w.sent_count, 0) as sent_domain_today,
      coalesce(w.daily_cap, 20) as daily_cap
    from base b
    left join public.account_rate_state rs on rs.account_id = b.account_id
    left join public.domain_warmup_state w
      on w.account_id = b.account_id
     and w.domain = lower(p_domain)
     and w.day = now()::date
    where b.account_id is not null
  ),
  scored as (
    select
      account_id,
      (cooldown_until is null or cooldown_until <= now()) as ok_cooldown,
      (sent_domain_today < daily_cap) as ok_domain,
      (sent_this_min < per_min) as ok_minute,
      (1000 - sent_domain_today)
      + (case when sent_this_min < per_min then 100 else 0 end)
      + (weight * 10) as score
    from rows
  )
  select account_id into chosen
  from scored
  where ok_cooldown and ok_domain
  order by score desc, account_id
  limit 1;

  return chosen;
end;
$$;


-- E) RPC: assign accounts for a batch of queue rows (id list) just-in-time
drop function if exists public.assign_accounts_for_queue(uuid, uuid[]);
create or replace function public.assign_accounts_for_queue(
  p_campaign uuid,
  p_queue_ids uuid[]
) returns int
language plpgsql
security definer
volatile
as $$
declare
  q record;
  dom text;
  acct uuid;
  n int := 0;
begin
  for q in
    select q.id, q.lead_id, l.email
    from public.send_queue q
    join public.leads l on l.id = q.lead_id
    where q.id = any(p_queue_ids)
      and q.campaign_id = p_campaign
  loop
    dom := public.email_domain(q.email);
    acct := public.pick_sending_account(p_campaign, dom);

    if acct is not null then
      update public.send_queue
         set from_account_id = acct
       where id = q.id;
      n := n + 1;
    end if;
  end loop;

  return n;
end;
$$;

revoke all on function public.assign_accounts_for_queue(uuid, uuid[]) from public;
grant execute on function public.assign_accounts_for_queue(uuid, uuid[]) to service_role;


-- F) Minute window housekeeping: reset sent_this_min if window elapsed
drop function if exists public.bump_rate_window(uuid);
create or replace function public.bump_rate_window(p_account uuid)
returns void
language plpgsql
security definer
as $$
declare
  rs record;
begin
  select * into rs
  from public.account_rate_state
  where account_id = p_account
  for update;

  if not found then
    insert into public.account_rate_state(account_id, per_min, sent_this_min, window_started_at, window_start, sent_in_window, per_minute)
    values (p_account, 20, 0, now(), now(), 0, 20)
    on conflict (account_id) do nothing;
    return;
  end if;

  if rs.window_started_at < now() - interval '1 minute' then
    update public.account_rate_state
       set window_started_at = now(),
           sent_this_min = 0,
           window_start = now(),
           sent_in_window = 0
     where account_id = p_account;
  end if;
end;
$$;


-- G) After successful send, bump per-minute counter (and warmup — already shipped)
drop function if exists public.after_success_send(uuid, text);
create or replace function public.after_success_send(p_account uuid, p_to_email text)
returns void
language plpgsql
security definer
as $$
begin
  perform public.bump_rate_window(p_account);

  update public.account_rate_state
     set sent_this_min = sent_this_min + 1,
         sent_in_window = sent_in_window + 1,
         window_start = window_started_at,
         updated_at = now()
   where account_id = p_account;

  perform public.bump_domain_warmup(p_account, p_to_email);
end;
$$;

revoke all on function public.after_success_send(uuid, text) from public;
grant execute on function public.after_success_send(uuid, text) to service_role;


-- H) When 429/backoff happens, set cooldown
drop function if exists public.set_account_cooldown(uuid, int);
create or replace function public.set_account_cooldown(p_account uuid, p_seconds int default 180)
returns void
language plpgsql
security definer
as $$
  insert into public.account_rate_state(account_id, cooldown_until)
  values (p_account, now() + make_interval(secs => greatest(p_seconds, 30)))
  on conflict (account_id) do update
    set cooldown_until = excluded.cooldown_until,
        updated_at = now();
$$;

revoke all on function public.set_account_cooldown(uuid, int) from public;
grant execute on function public.set_account_cooldown(uuid, int) to service_role;



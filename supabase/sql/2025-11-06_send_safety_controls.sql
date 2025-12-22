-- Deliverability controls: account sending windows, warmup, bounce guard
-- Idempotent: safe to run multiple times

-- A) Account sending preferences ------------------------------------------------
create table if not exists public.account_sending_prefs (
  account_id uuid primary key references public.connected_accounts(id) on delete cascade,
  tz text not null default 'UTC',
  business_days int[] not null default array[1,2,3,4,5],
  window_start text not null default '08:00',
  window_end text not null default '17:00',
  enforce_hours boolean not null default true,
  updated_at timestamptz not null default now()
);

create trigger trg_account_sending_prefs_updated
before update on public.account_sending_prefs
for each row
execute procedure public.set_updated_at();


-- B) Per-account per-domain warmup state ---------------------------------------
create table if not exists public.domain_warmup_state (
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  domain text not null,
  day date not null default (now()::date),
  sent_count int not null default 0,
  daily_cap int not null default 20,
  warmup_level int not null default 1,
  updated_at timestamptz not null default now(),
  primary key (account_id, domain, day)
);

create index if not exists idx_warmup_recent on public.domain_warmup_state(account_id, domain, day);


-- C) Campaign safety flags -----------------------------------------------------
create table if not exists public.campaign_safety (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  paused boolean not null default false,
  pause_reason text,
  bounce_window int not null default 200,
  bounce_rate_limit numeric not null default 0.08,
  updated_at timestamptz not null default now()
);


-- D) Helpers -------------------------------------------------------------------

-- Extract domain from email
create or replace function public.email_domain(p_email text)
returns text
language sql
immutable
as $$
  select case
           when position('@' in coalesce(p_email, '')) > 0
             then lower(split_part(p_email, '@', 2))
           else null
         end
$$;


-- Normalize due_at by account hours using next_window_utc
drop function if exists public.enforce_account_hours(uuid, timestamptz);
create or replace function public.enforce_account_hours(p_account uuid, p_due timestamptz)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  prefs record;
  tz_use text;
  startw text;
  endw text;
  days int[];
begin
  select *
    into prefs
    from public.account_sending_prefs a
   where a.account_id = p_account;

  if not found or prefs.enforce_hours is false then
    return p_due;
  end if;

  tz_use := coalesce(nullif(prefs.tz, ''), 'UTC');
  startw := coalesce(nullif(prefs.window_start, ''), '08:00');
  endw   := coalesce(nullif(prefs.window_end, ''), '17:00');
  days   := coalesce(prefs.business_days, array[1,2,3,4,5]);

  return public.next_window_utc(p_due, tz_use, startw, endw, days, false, null);
end;
$$;


-- Warmup gate: returns allowed_at and reason (null reason => allowed now)
drop function if exists public.domain_warmup_gate(uuid, text, date, int);
create or replace function public.domain_warmup_gate(
  p_account uuid,
  p_domain text,
  p_day date default now()::date,
  p_cap_override int default null
) returns table(allowed_at timestamptz, reason text)
language plpgsql
stable
set search_path = public
as $$
declare
  st record;
  cap int;
begin
  if p_domain is null then
    return query select now(), null::text;
  end if;

  select *
    into st
    from public.domain_warmup_state
   where account_id = p_account
     and domain = lower(p_domain)
     and day = p_day;

  cap := coalesce(p_cap_override, st.daily_cap, 20);

  if st.sent_count is null or st.sent_count < cap then
    return query select now(), null::text;
  else
    return query select
      public.enforce_account_hours(p_account, ((p_day + 1)::timestamptz)) as allowed_at,
      'domain_cap_reached'::text;
  end if;
end;
$$;


-- Bounces: rolling window bounce rate for a campaign
drop function if exists public.campaign_bounce_stats(uuid, int);
create or replace function public.campaign_bounce_stats(p_campaign uuid, p_window int default 200)
returns table(total int, bounces int, rate numeric)
language sql
stable
set search_path = public
as $$
  with sent as (
    select id
      from public.send_logs
     where campaign_id = p_campaign
     order by created_at desc
     limit greatest(p_window, 50)
  ),
  b as (
    select count(*)::int as bcnt
      from public.inbox_messages m
     where m.campaign_id = p_campaign
       and coalesce(m.ai_label, '') = 'bounce'
       and m.created_at > now() - interval '30 days'
  ),
  s as (
    select count(*)::int as scnt from sent
  )
  select s.scnt as total,
         b.bcnt as bounces,
         case when s.scnt = 0 then 0
              else (b.bcnt::numeric / s.scnt::numeric)
          end as rate
    from s, b
$$;


-- Auto-pause if bounce rate > limit and sample >= 50
drop function if exists public.evaluate_bounce_guard(uuid);
create or replace function public.evaluate_bounce_guard(p_campaign uuid)
returns table(paused boolean, reason text, rate numeric, total int)
language plpgsql
security definer
set search_path = public
as $$
declare
  st record;
  lim numeric;
  win int;
  stats record;
begin
  select *
    into st
    from public.campaign_safety
   where campaign_id = p_campaign;

  lim := coalesce(st.bounce_rate_limit, 0.08);
  win := coalesce(st.bounce_window, 200);

  select *
    into stats
    from public.campaign_bounce_stats(p_campaign, win);

  if stats.total >= 50 and stats.rate > lim then
    insert into public.campaign_safety(campaign_id, paused, pause_reason, updated_at)
    values (p_campaign, true, 'bounce_rate', now())
    on conflict (campaign_id) do update
      set paused = true,
          pause_reason = 'bounce_rate',
          updated_at = now();

    delete from public.send_queue where campaign_id = p_campaign;

    return query
      select true, 'bounce_rate', stats.rate, stats.total;
  else
    return query
      select coalesce(st.paused, false), st.pause_reason, stats.rate, stats.total;
  end if;
end;
$$;

revoke all on function public.evaluate_bounce_guard(uuid) from public;
grant execute on function public.evaluate_bounce_guard(uuid) to service_role, authenticated;


-- Increment domain warmup counter (call after a successful send)
drop function if exists public.bump_domain_warmup(uuid, text);
create or replace function public.bump_domain_warmup(p_account uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  dom text := public.email_domain(p_email);
  today date := now()::date;
begin
  if dom is null then
    return;
  end if;

  insert into public.domain_warmup_state(account_id, domain, day, sent_count)
  values (p_account, lower(dom), today, 1)
  on conflict (account_id, domain, day)
  do update set sent_count = public.domain_warmup_state.sent_count + 1,
               updated_at = now();
end;
$$;

revoke all on function public.bump_domain_warmup(uuid, text) from public;
grant execute on function public.bump_domain_warmup(uuid, text) to service_role;


-- Resume campaign RPC
drop function if exists public.resume_campaign(uuid);
create or replace function public.resume_campaign(p_campaign uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.campaign_safety(campaign_id, paused, pause_reason, updated_at)
  values (p_campaign, false, null, now())
  on conflict (campaign_id) do update
    set paused = false,
        pause_reason = null,
        updated_at = now();
end;
$$;

revoke all on function public.resume_campaign(uuid) from public;
grant execute on function public.resume_campaign(uuid) to authenticated, service_role;


-- Trigger for bounce guard -----------------------------------------------------
drop trigger if exists trg_bounce_guard on public.inbox_messages;
drop function if exists public._on_bounce_guard();
create or replace function public._on_bounce_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.ai_label, '') = 'bounce'
     or coalesce(new.meta->>'kind', '') = 'bounce' then
    perform public.evaluate_bounce_guard(new.campaign_id);
  end if;
  return new;
end;
$$;

create trigger trg_bounce_guard
after insert on public.inbox_messages
for each row
when (new.direction = 'inbound')
execute function public._on_bounce_guard();








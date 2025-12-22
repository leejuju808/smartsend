-- Domain deliverability, DNS health, warmup, and throttling system

create extension if not exists citext;

-- Ensure sending_domains supports deliverability metadata
do $body$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sending_domains'
      and column_name = 'domain'
      and data_type <> 'citext'
  ) then
    execute 'alter table public.sending_domains alter column domain type citext using domain::citext';
  end if;
exception when undefined_column then
  null;
end;
$body$;

do $body$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sending_domains'
      and column_name = 'account_id'
  ) then
    execute 'alter table public.sending_domains add column account_id uuid generated always as (workspace_id) stored';
  end if;
exception
  when undefined_column then
    raise notice 'Column workspace_id missing on sending_domains; account_id column skipped';
end;
$body$;

alter table if exists public.sending_domains
  add column if not exists provider text,
  add column if not exists is_active boolean not null default false;

create index if not exists sending_domains_account_idx
  on public.sending_domains(account_id);

-- Sending inboxes
create table if not exists public.sending_inboxes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  domain_id uuid not null references public.sending_domains(id) on delete cascade,
  email citext not null unique,
  display_name text,
  provider text,
  created_at timestamptz not null default now(),
  is_active boolean not null default false,
  warmup_enabled boolean not null default true,
  warmup_stage text not null default 'idle' check (warmup_stage in ('idle','warming','ramped','paused')),
  metadata jsonb default '{}'::jsonb
);

create index if not exists sending_inboxes_account_idx
  on public.sending_inboxes(account_id);

create index if not exists sending_inboxes_domain_idx
  on public.sending_inboxes(domain_id);

-- Keep inbox account_id aligned with domain account_id
create or replace function public.set_inbox_account()
returns trigger
language plpgsql
as $$
declare
  v_account uuid;
begin
  select account_id into v_account
  from public.sending_domains
  where id = new.domain_id;

  if v_account is not null then
    new.account_id := v_account;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sending_inboxes_account on public.sending_inboxes;
create trigger trg_sending_inboxes_account
before insert or update on public.sending_inboxes
for each row execute function public.set_inbox_account();

-- Domain DNS status snapshot
create table if not exists public.domain_dns_status (
  domain_id uuid primary key references public.sending_domains(id) on delete cascade,
  checked_at timestamptz,
  spf_pass boolean,
  dkim_pass boolean,
  dmarc_pass boolean,
  spf_record text,
  dkim_selector text,
  dkim_record text,
  dmarc_record text,
  advice text
);

-- Warmup plans and enrollments
create table if not exists public.warmup_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  schedule jsonb not null
);

insert into public.warmup_plans (name, schedule) values
  ('default_30d', '{"1":10,"2":12,"3":14,"4":16,"5":18,"6":20,"7":22,"8":24,"9":26,"10":28,
                    "11":30,"12":32,"13":34,"14":36,"15":38,"16":40,"17":42,"18":44,"19":46,"20":48,
                    "21":50,"22":52,"23":54,"24":56,"25":58,"26":60,"27":62,"28":64,"29":66,"30":68}')
on conflict (name) do nothing;

create table if not exists public.warmup_enrollments (
  id uuid primary key default gen_random_uuid(),
  inbox_id uuid not null references public.sending_inboxes(id) on delete cascade,
  plan_id uuid not null references public.warmup_plans(id) on delete restrict,
  started_at timestamptz not null default now(),
  day_number int not null default 1,
  last_run_at timestamptz,
  active boolean not null default true
);

create unique index if not exists warmup_enrollments_active_inbox_idx
  on public.warmup_enrollments(inbox_id)
  where active;

create table if not exists public.warmup_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  inbox_id uuid not null references public.sending_inboxes(id) on delete cascade,
  target_count int not null,
  sent_count int not null default 0,
  opens int not null default 0,
  replies int not null default 0,
  bounces int not null default 0,
  spam_hits int not null default 0,
  notes text
);

create index if not exists warmup_runs_inbox_idx
  on public.warmup_runs(inbox_id, created_at desc);

-- Domain health snapshots
create table if not exists public.domain_health (
  id uuid primary key default gen_random_uuid(),
  domain_id uuid not null references public.sending_domains(id) on delete cascade,
  snapshot_date date not null,
  send_volume int not null default 0,
  bounce_rate real not null default 0,
  spam_complaints int not null default 0,
  ooo_rate real not null default 0,
  open_rate real not null default 0,
  reply_rate real not null default 0,
  score int not null,
  created_at timestamptz not null default now(),
  unique (domain_id, snapshot_date)
);

create index if not exists domain_health_domain_idx
  on public.domain_health(domain_id, snapshot_date desc);

-- Throttles
create table if not exists public.send_throttles (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('domain','inbox')),
  domain_id uuid references public.sending_domains(id) on delete cascade,
  inbox_id uuid references public.sending_inboxes(id) on delete cascade,
  max_per_day int not null,
  max_per_hour int not null,
  reason text,
  updated_at timestamptz not null default now()
);

create unique index if not exists send_throttles_scope_idx
  on public.send_throttles (
    scope,
    coalesce(domain_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(inbox_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index if not exists send_throttles_domain_idx
  on public.send_throttles(domain_id)
  where domain_id is not null;

create index if not exists send_throttles_inbox_idx
  on public.send_throttles(inbox_id)
  where inbox_id is not null;

create or replace function public.touch_send_throttle()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_send_throttles_touch on public.send_throttles;
create trigger trg_send_throttles_touch
before insert or update on public.send_throttles
for each row execute function public.touch_send_throttle();

-- Health score helper
create or replace function public.compute_health_score(p_open real, p_reply real, p_bounce real, p_spam int)
returns int
language sql
immutable
as $$
  select greatest(0, least(100,
    round( 50*p_open + 30*p_reply + 20*(1-p_bounce) - 5*least(p_spam,10) )
  )::int);
$$;

-- DNS guard
create or replace function public.guard_dns_before_send()
returns trigger
language plpgsql
as $$
declare
  v_domain uuid;
  v_spf boolean;
  v_dkim boolean;
  v_dmarc boolean;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'send_queue'
      and column_name = 'from_inbox_id'
  ) then
    return new;
  end if;

  select domain_id into v_domain
  from public.sending_inboxes
  where id = new.from_inbox_id;

  if v_domain is null then
    return new;
  end if;

  select spf_pass, dkim_pass, dmarc_pass
    into v_spf, v_dkim, v_dmarc
  from public.domain_dns_status
  where domain_id = v_domain;

  if coalesce(v_spf, false) = false
     or coalesce(v_dkim, false) = false
     or coalesce(v_dmarc, false) = false then
    new.status := 'suppressed';
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'send_queue'
        and column_name = 'guard_reason'
    ) then
      new.guard_reason := 'dns_not_verified';
    end if;
  end if;

  return new;
end;
$$;

-- Throttle guard
create or replace function public.guard_throttle_send()
returns trigger
language plpgsql
as $$
declare
  v_dom uuid;
  v_maxd int;
  v_maxh int;
  v_day int;
  v_hour int;
  v_inb uuid;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'send_queue'
      and column_name = 'from_inbox_id'
  ) then
    v_inb := new.from_inbox_id;
  else
    return new;
  end if;

  select domain_id into v_dom
  from public.sending_inboxes
  where id = v_inb;

  -- Domain throttle
  select max_per_day, max_per_hour
    into v_maxd, v_maxh
  from public.send_throttles
  where scope = 'domain'
    and domain_id = v_dom
  order by updated_at desc
  limit 1;

  if v_maxd is not null then
    if v_maxd <= 0 then
      new.status := 'suppressed';
      if exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'send_queue'
          and column_name = 'guard_reason'
      ) then
        new.guard_reason := 'domain_daily_throttle';
      end if;
      return new;
    end if;

    select count(*) into v_day
    from public.send_queue q
    join public.sending_inboxes si on si.id = q.from_inbox_id
    where si.domain_id = v_dom
      and q.created_at >= date_trunc('day', now())
      and q.status in ('pending','queued','sending');

    if v_day >= v_maxd then
      new.status := 'suppressed';
      if exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'send_queue'
          and column_name = 'guard_reason'
      ) then
        new.guard_reason := 'domain_daily_throttle';
      end if;
      return new;
    end if;
  end if;

  if v_maxh is not null then
    if v_maxh <= 0 then
      new.status := 'suppressed';
      if exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'send_queue'
          and column_name = 'guard_reason'
      ) then
        new.guard_reason := 'domain_hourly_throttle';
      end if;
      return new;
    end if;

    select count(*) into v_hour
    from public.send_queue q
    join public.sending_inboxes si on si.id = q.from_inbox_id
    where si.domain_id = v_dom
      and q.created_at >= date_trunc('hour', now())
      and q.status in ('pending','queued','sending');

    if v_hour >= v_maxh then
      new.status := 'suppressed';
      if exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'send_queue'
          and column_name = 'guard_reason'
      ) then
        new.guard_reason := 'domain_hourly_throttle';
      end if;
      return new;
    end if;
  end if;

  -- Inbox throttle
  select max_per_day, max_per_hour
    into v_maxd, v_maxh
  from public.send_throttles
  where scope = 'inbox'
    and inbox_id = v_inb
  order by updated_at desc
  limit 1;

  if v_maxd is not null then
    if v_maxd <= 0 then
      new.status := 'suppressed';
      if exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'send_queue'
          and column_name = 'guard_reason'
      ) then
        new.guard_reason := 'inbox_daily_throttle';
      end if;
      return new;
    end if;

    select count(*) into v_day
    from public.send_queue q
    where q.from_inbox_id = v_inb
      and q.created_at >= date_trunc('day', now())
      and q.status in ('pending','queued','sending');

    if v_day >= v_maxd then
      new.status := 'suppressed';
      if exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'send_queue'
          and column_name = 'guard_reason'
      ) then
        new.guard_reason := 'inbox_daily_throttle';
      end if;
      return new;
    end if;
  end if;

  if v_maxh is not null then
    if v_maxh <= 0 then
      new.status := 'suppressed';
      if exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'send_queue'
          and column_name = 'guard_reason'
      ) then
        new.guard_reason := 'inbox_hourly_throttle';
      end if;
      return new;
    end if;

    select count(*) into v_hour
    from public.send_queue q
    where q.from_inbox_id = v_inb
      and q.created_at >= date_trunc('hour', now())
      and q.status in ('pending','queued','sending');

    if v_hour >= v_maxh then
      new.status := 'suppressed';
      if exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'send_queue'
          and column_name = 'guard_reason'
      ) then
        new.guard_reason := 'inbox_hourly_throttle';
      end if;
      return new;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_dns_send on public.send_queue;
create trigger trg_guard_dns_send
before insert on public.send_queue
for each row execute function public.guard_dns_before_send();

drop trigger if exists trg_guard_throttle_send on public.send_queue;
create trigger trg_guard_throttle_send
before insert on public.send_queue
for each row execute function public.guard_throttle_send();

-- Ensure send_queue status allows guard outcomes
do $body$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'send_queue'
      and column_name = 'status'
  ) then
    if exists (
      select 1
      from pg_constraint
      where conname = 'send_queue_status_check'
        and conrelid = 'public.send_queue'::regclass
    ) then
      execute 'alter table public.send_queue drop constraint send_queue_status_check';
    end if;
    execute $ddl$
      alter table public.send_queue
        add constraint send_queue_status_check
        check (status in ('pending','queued','sending','sent','failed','suppressed','canceled','paused'))
    $ddl$;
  end if;
exception
  when undefined_table then null;
end;
$body$;

-- Domain health rollups
create or replace function public.rollup_domain_health(p_domain uuid, p_snapshot date default (now()::date))
returns void
language plpgsql
as $$
declare
  v_send int;
  v_open real := 0.25;
  v_reply real := 0.04;
  v_bounce real := 0.03;
  v_spam int := 0;
  v_ooo real := 0.07;
  v_score int;
begin
  select count(*) into v_send
  from public.send_queue q
  join public.sending_inboxes si on si.id = q.from_inbox_id
  where si.domain_id = p_domain
    and q.created_at >= p_snapshot
    and q.created_at < p_snapshot + 1
    and q.status in ('sent','pending','sending','suppressed','failed');

  v_score := public.compute_health_score(v_open, v_reply, v_bounce, v_spam);

  insert into public.domain_health(
    domain_id, snapshot_date, send_volume, bounce_rate, spam_complaints,
    ooo_rate, open_rate, reply_rate, score
  )
  values (
    p_domain, p_snapshot, coalesce(v_send, 0), v_bounce, v_spam,
    v_ooo, v_open, v_reply, v_score
  )
  on conflict (domain_id, snapshot_date) do update
    set send_volume = excluded.send_volume,
        bounce_rate = excluded.bounce_rate,
        spam_complaints = excluded.spam_complaints,
        ooo_rate = excluded.ooo_rate,
        open_rate = excluded.open_rate,
        reply_rate = excluded.reply_rate,
        score = excluded.score,
        created_at = now();
end;
$$;

create or replace function public.rollup_all_domains()
returns void
language plpgsql
as $$
begin
  perform public.rollup_domain_health(d.id, (now()::date - 1))
  from public.sending_domains d;
end;
$$;

create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'health_rollup_nightly') then
    perform cron.unschedule('health_rollup_nightly');
  end if;
  perform cron.schedule('health_rollup_nightly', '15 2 * * *', $$select public.rollup_all_domains();$$);
end;
$$;

-- Reputation guardrails
create or replace function public.apply_reputation_guards()
returns void
language plpgsql
as $$
declare
  r record;
  v_cap int;
  v_last int;
  v_avg_score int;
  v_spam_count int;
  v_sent_sum int;
  v_bounce_sum int;
  v_bounce_rate numeric;
begin
  -- Low aggregate score throttles
  for r in
    select d.id as domain_id,
           coalesce(avg(h.score)::int, 100) as avg_score,
           (
             select dh.send_volume
             from public.domain_health dh
             where dh.domain_id = d.id
             order by dh.snapshot_date desc
             limit 1
           ) as last_volume
    from public.sending_domains d
    left join public.domain_health h
      on h.domain_id = d.id
     and h.snapshot_date >= (current_date - 7)
    group by d.id
  loop
    v_avg_score := coalesce(r.avg_score, 100);
    v_last := coalesce(r.last_volume, 0);
    if v_avg_score < 60 then
      v_cap := greatest(200, floor(0.6 * v_last)::int);
      insert into public.send_throttles(scope, domain_id, max_per_day, max_per_hour, reason)
      values ('domain', r.domain_id, v_cap, 15, 'auto_low_health')
      on conflict on constraint send_throttles_scope_idx
      do update set
        max_per_day = excluded.max_per_day,
        max_per_hour = excluded.max_per_hour,
        reason = excluded.reason,
        updated_at = now();
    end if;
  end loop;

  -- Bounce rate hard stop (yesterday)
  for r in
    select domain_id
    from public.domain_health
    where snapshot_date = (current_date - 1)
      and bounce_rate >= 0.10
  loop
    insert into public.send_throttles(scope, domain_id, max_per_day, max_per_hour, reason)
    values ('domain', r.domain_id, 0, 0, 'domain_health_block')
    on conflict on constraint send_throttles_scope_idx
    do update set
      max_per_day = 0,
      max_per_hour = 0,
      reason = excluded.reason,
      updated_at = now();
  end loop;

  -- Warmup auto-pause
  for r in
    select i.id as inbox_id, i.domain_id
    from public.sending_inboxes i
    where i.warmup_enabled = true
  loop
    select coalesce(sum(case when wr.spam_hits > 0 then 1 else 0 end), 0),
           coalesce(sum(wr.sent_count), 0),
           coalesce(sum(wr.bounces), 0)
      into v_spam_count, v_sent_sum, v_bounce_sum
    from (
      select *
      from public.warmup_runs wr
      where wr.inbox_id = r.inbox_id
      order by wr.created_at desc
      limit 3
    ) wr;

    if v_spam_count > 0 then
      update public.sending_inboxes
        set warmup_stage = 'paused', warmup_enabled = false, is_active = false
      where id = r.inbox_id;

      update public.warmup_enrollments
        set active = false
      where inbox_id = r.inbox_id
        and active = true;

      insert into public.send_throttles(scope, inbox_id, max_per_day, max_per_hour, reason)
      values ('inbox', r.inbox_id, 0, 0, 'auto_spam_pause')
      on conflict on constraint send_throttles_scope_idx
      do update set
        max_per_day = 0,
        max_per_hour = 0,
        reason = excluded.reason,
        updated_at = now();
      continue;
    end if;

    if v_sent_sum > 0 then
      v_bounce_rate := v_bounce_sum::numeric / v_sent_sum::numeric;
      if v_bounce_rate > 0.05 then
        update public.sending_inboxes
          set warmup_stage = 'paused', warmup_enabled = false, is_active = false
        where id = r.inbox_id;

        update public.warmup_enrollments
          set active = false
        where inbox_id = r.inbox_id
          and active = true;

        insert into public.send_throttles(scope, inbox_id, max_per_day, max_per_hour, reason)
        values ('inbox', r.inbox_id, 0, 0, 'auto_bounce_pause')
        on conflict on constraint send_throttles_scope_idx
        do update set
          max_per_day = 0,
          max_per_hour = 0,
          reason = excluded.reason,
          updated_at = now();
      end if;
    end if;
  end loop;
end;
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'rep_guards') then
    perform cron.unschedule('rep_guards');
  end if;
  perform cron.schedule('rep_guards', '30 2 * * *', $$select public.apply_reputation_guards();$$);
end;
$$;



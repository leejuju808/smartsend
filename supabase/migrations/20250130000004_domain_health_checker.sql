-- Block 124: Link & Domain Health Checker (SPF/DKIM/DMARC + shortener detect + cache cron)
-- Idempotent migration for domain health checking system

-- 1) Update domain_health table with missing columns
alter table if exists public.domain_health
  add column if not exists mx_ok boolean,
  add column if not exists https_ok boolean,
  add column if not exists shortener boolean not null default false;

-- 2) Create domain_health_queue table
create table if not exists public.domain_health_queue (
  domain text primary key,
  enqueued_at timestamptz not null default now(),
  priority int not null default 100,     -- smaller = sooner
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now()
);

create index if not exists idx_dhq_next on public.domain_health_queue (next_attempt_at, priority);

-- 3) Helper to enqueue (used by preflight or webhook paths)
create or replace function public.enqueue_domain_check(p_domain text, p_priority int default 100)
returns void
language sql
security definer
as $$
  insert into public.domain_health_queue(domain, priority)
  values (lower(trim(p_domain)), p_priority)
  on conflict (domain) do update
    set priority = least(public.domain_health_queue.priority, excluded.priority),
        next_attempt_at = now();
$$;

-- 4) Ensure email_domain function exists (may already exist from other migrations)
create or replace function public.email_domain(p text)
returns text language sql immutable as $$
  select case when p is null then null else lower(split_part(p,'@',2)) end
$$;

-- 5) Update is_shortener function to include lnkd.in
create or replace function public.is_shortener(host text)
returns boolean language sql immutable as $$
  select lower(host) in (
    'bit.ly','t.co','goo.gl','tinyurl.com','rb.gy','rebrand.ly','cutt.ly','ow.ly','is.gd','s.id','lnkd.in'
  )
$$;

-- 6) Trigger function: enqueue domains from send_queue
create or replace function public.enqueue_links_for_health()
returns trigger language plpgsql as $$
declare hosts text[];
begin
  hosts := public.extract_link_hosts(new.body_html);
  if hosts is not null then
    perform public.enqueue_domain_check(h) from unnest(hosts) as h;
  end if;

  -- also sender + recipient domains
  if new.from_address is not null then
    perform public.enqueue_domain_check(public.email_domain(new.from_address), 50);
  end if;
  if new.to is not null then
    perform public.enqueue_domain_check(public.email_domain(new.to), 80);
  end if;
  return new;
end $$;

drop trigger if exists trg_queue_link_enq on public.send_queue;
create trigger trg_queue_link_enq
after insert or update of body_html, from_address, to on public.send_queue
for each row execute function public.enqueue_links_for_health();

-- 7) Trigger function: enqueue recipient domain on bounce/complaint
create or replace function public.enqueue_domain_on_event()
returns trigger language plpgsql as $$
begin
  if new.recipient_email is not null then
    perform public.enqueue_domain_check(public.email_domain(new.recipient_email), 70);
  end if;
  return new;
end $$;

drop trigger if exists trg_event_domain_enq on public.provider_event_logs;
create trigger trg_event_domain_enq
after insert on public.provider_event_logs
for each row execute function public.enqueue_domain_on_event();















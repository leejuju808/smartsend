-- Send queue retry hardening, helpers, and health views
-- Run in Supabase SQL (copy/paste into the SQL editor or psql)

-- A) Queue hardening for retries/backoff
alter table public.send_queue
  add column if not exists retry_at timestamptz,
  add column if not exists attempt_count int not null default 0,
  add column if not exists last_error_code text,
  add column if not exists last_error_msg text,
  add column if not exists failed_at timestamptz,
  add column if not exists dead_letter boolean not null default false;

create index if not exists idx_sq_status_retry on public.send_queue(status, retry_at);
create index if not exists idx_sq_dead_letter on public.send_queue(dead_letter) where dead_letter = true;


-- B) Optional policy knobs (global defaults; override per account/campaign later if needed)
create table if not exists public.retry_policy_defaults (
  id boolean primary key default true,
  max_attempts int not null default 8,
  base_seconds int not null default 30,
  max_seconds int not null default 3600
);

insert into public.retry_policy_defaults(id) values(true)
on conflict (id) do nothing;


-- C) Dead-letter mailbox (immutable snapshot)
create table if not exists public.dead_letters (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  queue_id uuid references public.send_queue(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  account_id uuid references public.connected_accounts(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  error_code text,
  error_msg text,
  attempt_count int not null default 0,
  payload jsonb,
  provider text,
  provider_message_id text,
  meta jsonb
);

-- ensure legacy columns remain compatible while adding new metadata
alter table public.dead_letters
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists account_id uuid,
  add column if not exists error_code text,
  add column if not exists error_msg text,
  add column if not exists attempt_count int not null default 0,
  add column if not exists payload jsonb,
  add column if not exists provider text,
  add column if not exists provider_message_id text,
  add column if not exists meta jsonb;

alter table public.dead_letters alter column attempt_count set default 0;

-- allow queue/campaign/account/lead to be cleared if source rows disappear to preserve dead-letter history
alter table if exists public.dead_letters alter column queue_id drop not null;
alter table if exists public.dead_letters alter column campaign_id drop not null;
alter table if exists public.dead_letters alter column lead_id drop not null;

alter table if exists public.dead_letters drop constraint if exists dead_letters_queue_id_fkey;
alter table if exists public.dead_letters add constraint dead_letters_queue_id_fkey foreign key (queue_id) references public.send_queue(id) on delete set null;

alter table if exists public.dead_letters drop constraint if exists dead_letters_campaign_id_fkey;
alter table if exists public.dead_letters add constraint dead_letters_campaign_id_fkey foreign key (campaign_id) references public.campaigns(id) on delete set null;

alter table if exists public.dead_letters drop constraint if exists dead_letters_account_id_fkey;
alter table if exists public.dead_letters add constraint dead_letters_account_id_fkey foreign key (account_id) references public.connected_accounts(id) on delete set null;

alter table if exists public.dead_letters drop constraint if exists dead_letters_lead_id_fkey;
alter table if exists public.dead_letters add constraint dead_letters_lead_id_fkey foreign key (lead_id) references public.leads(id) on delete set null;

create index if not exists idx_dl_campaign on public.dead_letters(campaign_id, created_at desc);
create index if not exists idx_dl_account on public.dead_letters(account_id, created_at desc);


-- D) Helper: exponential backoff with decorrelated jitter (AWS style)
create or replace function public.exponential_backoff_seconds(p_attempt int)
returns int
language plpgsql
stable
as $$
declare
  v_base int;
  v_max int;
  v_prev int;
  v_next int;
begin
  select base_seconds, max_seconds into v_base, v_max from public.retry_policy_defaults where id = true;
  v_prev := greatest(v_base, v_base * (2 ^ greatest(p_attempt - 1, 0)));
  v_next := ceil((random() * v_prev)::numeric);
  return least(greatest(v_next, v_base), v_max);
end;
$$;


-- E) Helper: classify retryable vs permanent (extend as providers evolve)
create or replace function public.classify_retryable(p_provider text, p_code text, p_msg text)
returns boolean
language plpgsql
stable
as $$
begin
  if coalesce(p_code,'') ~* '(550|5\.1\.1|user unknown|mailbox unavailable|blocked|policy|domain not found|spf|dmarc)' then
    return false;
  end if;

  if coalesce(p_code,'') ~* '(421|429|4\.)' or coalesce(p_msg,'') ~* '(rate|quota|busy|temporary|try again)' then
    return true;
  end if;

  return true;
end;
$$;


-- F) RPC: record failure -> retry or dead-letter; returns 'deferred' | 'dead_letter'
create or replace function public.record_send_failure(
  p_queue uuid,
  p_provider text,
  p_error_code text,
  p_error_msg text,
  p_retryable boolean default null,
  p_now timestamptz default now()
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_retryable boolean;
  v_attempts int;
  v_max int;
  v_delay int;
  v_row public.send_queue%rowtype;
begin
  select * into v_row from public.send_queue where id = p_queue for update;
  if not found then
    raise exception 'queue row not found';
  end if;

  select max_attempts into v_max from public.retry_policy_defaults where id = true;
  v_retryable := coalesce(p_retryable, public.classify_retryable(p_provider, p_error_code, p_error_msg));

  v_attempts := coalesce(v_row.attempt_count, 0) + 1;

  if not v_retryable or v_attempts >= v_max then
    insert into public.dead_letters(queue_id, campaign_id, account_id, lead_id, error_code, error_msg, attempt_count, payload, provider, provider_message_id, meta)
    values (v_row.id, v_row.campaign_id, v_row.account_id, v_row.lead_id, p_error_code, left(p_error_msg, 2000), v_attempts, v_row.payload, p_provider, v_row.provider_message_id, jsonb_build_object('status', v_row.status))
    on conflict (id) do nothing;

    update public.send_queue
      set status = 'failed',
          dead_letter = true,
          failed_at = p_now,
          last_error_code = p_error_code,
          last_error_msg = left(p_error_msg, 2000),
          attempt_count = v_attempts,
          locked_at = null,
          retry_at = null,
          updated_at = p_now
    where id = v_row.id;

    return 'dead_letter';
  end if;

  v_delay := public.exponential_backoff_seconds(v_attempts);

  update public.send_queue
    set status = 'deferred',
        retry_at = p_now + make_interval(secs => v_delay),
        last_error_code = p_error_code,
        last_error_msg = left(p_error_msg, 2000),
        attempt_count = v_attempts,
        locked_at = null,
        updated_at = p_now
  where id = v_row.id;

  return 'deferred';
end;
$$;


-- G) RPC: record success -> clear retry state
create or replace function public.record_send_success(p_queue uuid, p_now timestamptz default now())
returns void
language sql
security definer
set search_path = public
as $$
  update public.send_queue
     set status = 'sent',
         retry_at = null,
         dead_letter = false,
         failed_at = null,
         locked_at = null,
         last_error_code = null,
         last_error_msg = null,
         updated_at = p_now
   where id = p_queue;
$$;


-- H) RPC: resurrect a dead-letter back to the queue (admin tool)
create or replace function public.dead_letter_resubmit(p_deadletter uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dl public.dead_letters%rowtype;
begin
  select * into v_dl from public.dead_letters where id = p_deadletter;
  if not found then
    raise exception 'dead-letter not found';
  end if;

  update public.send_queue
     set status = 'pending',
         not_before = now(),
         retry_at = null,
         dead_letter = false,
         failed_at = null,
         attempt_count = 0,
         last_error_code = null,
         last_error_msg = null,
         locked_at = null,
         updated_at = now()
   where id = v_dl.queue_id;

  return v_dl.queue_id;
end;
$$;


-- I) Views for dashboard health
create or replace view public.v_queue_health as
select
  now() as snapshot_at,
  count(*) filter (where status = 'pending')  as pending,
  count(*) filter (where status = 'scheduled') as scheduled,
  count(*) filter (where status = 'deferred')  as deferred,
  count(*) filter (where status = 'sending')   as sending,
  count(*) filter (where status = 'sent')      as sent,
  count(*) filter (where status = 'failed')    as failed,
  count(*) filter (where dead_letter)          as dead_letters
from public.send_queue;


create or replace view public.v_retry_attempts_hist as
select
  attempt_count,
  count(*) as items
from public.send_queue
where status in ('pending','deferred','scheduled','sending')
group by 1
order by 1;


create or replace view public.v_dead_letters_recent as
select
  dl.id as deadletter_id,
  dl.created_at,
  dl.queue_id,
  dl.campaign_id,
  dl.account_id,
  dl.lead_id,
  dl.error_code,
  dl.error_msg,
  dl.attempt_count,
  coalesce(l.email, (dl.payload->>'to')) as email
from public.dead_letters dl
left join public.leads l on l.id = dl.lead_id
order by dl.created_at desc
limit 200;













-- 2025-11-05: API keys (hashed), scopes, rate-limit helpers, enqueue, webhook verify

-- Enable hashing
create extension if not exists pgcrypto;

-- A) API keys (store only SHA-256 hash + short prefix for lookup)
-- Replace any legacy table with new secure schema
drop table if exists public.api_keys cascade;

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  billing_account_id uuid references public.billing_accounts(id) on delete set null,
  name text not null,
  prefix text not null,                 -- first 10 chars for quick lookup
  key_hash bytea not null,              -- sha256(key)
  scopes text[] not null default '{leads.write,campaigns.trigger,webhooks.sign}',
  status text not null default 'active' check (status in ('active','revoked')),
  expires_at timestamptz
);

create unique index if not exists uq_api_keys_user_prefix on public.api_keys(user_id, prefix);
create index if not exists idx_api_keys_prefix on public.api_keys(prefix);

-- Comparator: compare provided hex digest to stored bytea
create or replace function public.compare_api_hash(p_api_key_id uuid, p_hex text)
returns boolean
language sql stable as $$
  select encode(key_hash, 'hex') = lower(p_hex) from public.api_keys where id = p_api_key_id
$$;

-- B) Create key: returns plaintext ONCE
create or replace function public.create_api_key(
  p_name text,
  p_scopes text[] default '{leads.write,campaigns.trigger,webhooks.sign}',
  p_expires_at timestamptz default null
)
returns table(key text, prefix text, api_key_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_prefix text := substr(v_key, 1, 10);
  v_hash bytea := digest(v_key, 'sha256');
  v_ba uuid;
begin
  -- Link to caller's billing account (ensure one exists)
  v_ba := public.ensure_billing_account();

  insert into public.api_keys(user_id, billing_account_id, name, prefix, key_hash, scopes, expires_at)
  values (auth.uid(), v_ba, p_name, v_prefix, v_hash, p_scopes, p_expires_at)
  returning id into api_key_id;

  key := v_key; prefix := v_prefix;
  return next;
end;
$$;

-- C) RLS (owner can list/revoke; value never exposed again)
alter table public.api_keys enable row level security;

drop policy if exists sel_api_keys on public.api_keys;
create policy sel_api_keys on public.api_keys
for select using (user_id = auth.uid());

drop policy if exists upd_api_keys on public.api_keys;
create policy upd_api_keys on public.api_keys
for update using (user_id = auth.uid())
with check (user_id = auth.uid());

-- D) Quick usage/rate helpers (re-use usage_ledger)
-- mark API call
create or replace function public.record_api_call(p_api_key uuid, p_endpoint text, p_ok boolean)
returns void language sql security definer set search_path=public as $$
  insert into public.usage_ledger(billing_account_id, resource, quantity, meta)
  select k.billing_account_id, 'api_call', 1, jsonb_build_object('endpoint', p_endpoint, 'ok', p_ok)
  from public.api_keys k where k.id = p_api_key;
$$;

-- calls in last minute for key
create or replace function public.api_calls_last_min(p_api_key uuid)
returns int language sql stable as $$
  select count(*)::int
  from public.usage_ledger u
  where u.resource='api_call'
    and u.created_at >= now() - interval '60 seconds'
    and u.billing_account_id = (select billing_account_id from public.api_keys where id=p_api_key)
$$;

-- soft limit checker (per key per minute; default 60)
create or replace function public.api_rate_ok(p_api_key uuid, p_limit int default 60)
returns boolean language sql stable as $$
  select coalesce(public.api_calls_last_min(p_api_key),0) < coalesce(p_limit,60)
$$;

-- E) First-step enqueue helper (start a sequence)
create or replace function public.enqueue_first_campaign_step(
  p_campaign uuid,
  p_lead uuid,
  p_start_at timestamptz default now()
)
returns void
language plpgsql security definer set search_path=public
as $$
declare
  v_step record;
  v_campaign_account uuid;
  v_ctx jsonb;
  v_subject text; v_body text;
  v_sched timestamptz;
begin
  -- first enabled step (step_no = 1)
  select id, step_no, offset_days, subject_template, body_html_template
    into v_step
  from public.campaign_steps
  where campaign_id = p_campaign and enabled and step_no = 1
  order by step_no limit 1;

  if not found then return; end if;

  select account_id into v_campaign_account from public.campaigns where id = p_campaign;

  -- base time = p_start_at (+ offset_days if you want a delay even for step 1)
  v_sched := public.business_windowed_send_time_for_step(v_campaign_account, p_start_at + (v_step.offset_days || ' days')::interval, v_step.id);

  -- personalization
  v_ctx := public.template_context_for_lead(p_campaign, p_lead);
  v_subject := public.render_template(v_step.subject_template, v_ctx);
  v_body    := public.render_template(v_step.body_html_template, v_ctx);

  insert into public.send_queue (campaign_id, lead_id, account_id, step_no, scheduled_for, subject, body_html, status, billing_account_id)
  select p_campaign, p_lead, v_campaign_account, 1, v_sched, v_subject, v_body, 'queued', c.billing_account_id
  from public.campaigns c where c.id = p_campaign;
end;
$$;

-- F) Optional: webhook secret support on billing_accounts
alter table public.billing_accounts
  add column if not exists webhook_secret text;

update public.billing_accounts
set webhook_secret = coalesce(webhook_secret, encode(gen_random_bytes(24), 'hex'))
where webhook_secret is null;



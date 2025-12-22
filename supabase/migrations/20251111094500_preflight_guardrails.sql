-- Preflight guardrails, sender health, and gating helpers

-- A) Campaign / account sending settings ------------------------------------
alter table public.campaigns
  add column if not exists daily_cap int;

alter table public.campaigns
  alter column daily_cap set default 250;

update public.campaigns
   set daily_cap = 250
 where daily_cap is null;

alter table public.campaigns
  alter column daily_cap set not null;

alter table public.campaigns
  add column if not exists cadence_min_minutes int;

alter table public.campaigns
  alter column cadence_min_minutes set default 36;

update public.campaigns
   set cadence_min_minutes = 36
 where cadence_min_minutes is null;

alter table public.campaigns
  alter column cadence_min_minutes set not null;

alter table public.campaigns
  add column if not exists office_hours jsonb;

alter table public.campaigns
  alter column office_hours set default '{"enable":false,"start":8,"end":18,"days":[1,2,3,4,5]}'::jsonb;

update public.campaigns
   set office_hours = '{"enable":false,"start":8,"end":18,"days":[1,2,3,4,5]}'::jsonb
 where office_hours is null;

alter table public.campaigns
  alter column office_hours set not null;


alter table auth.users
  add column if not exists daily_cap int;

alter table auth.users
  alter column daily_cap set default 500;

update auth.users
   set daily_cap = 500
 where daily_cap is null;

alter table auth.users
  alter column daily_cap set not null;


alter table public.send_queue
  add column if not exists body_html text,
  add column if not exists sender_email text,
  add column if not exists idem_key text;

alter table public.send_logs
  add column if not exists reason text,
  add column if not exists meta jsonb;

update public.send_logs
   set meta = '{}'::jsonb
 where meta is null;

alter table public.send_logs
  alter column meta set default '{}'::jsonb;

alter table public.send_logs
  alter column meta set not null;

alter table public.send_logs
  drop constraint if exists send_logs_status_check;

alter table public.send_logs
  add constraint send_logs_status_check
  check (status in ('queued','sending','sent','failed','blocked'));


-- B) Sender identity health --------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'sender_identities'
  ) then
    create table public.sender_identities (
      id uuid primary key default gen_random_uuid(),
      created_at timestamptz not null default now(),
      account_id uuid not null references auth.users(id) on delete cascade,
      email_from text not null,
      domain text not null,
      is_warmup boolean not null default false,
      warmup_stage text,
      spf_ok boolean,
      dkim_ok boolean,
      dmarc_ok boolean,
      mx_ok boolean,
      blocked_until timestamptz
    );
  end if;
end
$$;

alter table public.sender_identities
  add column if not exists account_id uuid references auth.users(id) on delete cascade,
  add column if not exists email_from text,
  add column if not exists domain text,
  add column if not exists is_warmup boolean not null default false,
  add column if not exists warmup_stage text,
  add column if not exists spf_ok boolean,
  add column if not exists dkim_ok boolean,
  add column if not exists dmarc_ok boolean,
  add column if not exists mx_ok boolean,
  add column if not exists blocked_until timestamptz;

update public.sender_identities
   set account_id = coalesce(account_id, user_id)
 where account_id is null
   and exists (
     select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'sender_identities'
       and column_name = 'user_id'
   );

update public.sender_identities
   set email_from = lower(coalesce(email_from, from_email))
 where email_from is null
   and exists (
     select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'sender_identities'
       and column_name = 'from_email'
   );

update public.sender_identities
   set domain = coalesce(domain,
                         case
                           when coalesce(email_from, '') like '%@%'
                             then split_part(lower(email_from), '@', 2)
                           when exists (
                             select 1 from information_schema.columns
                             where table_schema = 'public'
                               and table_name = 'sender_identities'
                               and column_name = 'from_email'
                           )
                             and coalesce(from_email, '') like '%@%'
                             then split_part(lower(from_email), '@', 2)
                           else null
                         end)
 where domain is null;

update public.sender_identities
   set account_id = user_id
 where account_id is null
   and exists (
     select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'sender_identities'
       and column_name = 'user_id'
   );

update public.sender_identities
   set email_from = lower(from_email)
 where email_from is null
   and exists (
     select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'sender_identities'
       and column_name = 'from_email'
   );

update public.sender_identities
   set domain = split_part(lower(email_from), '@', 2)
 where domain is null
   and email_from like '%@%';

alter table public.sender_identities
  alter column account_id set not null;

alter table public.sender_identities
  alter column email_from set not null;

alter table public.sender_identities
  alter column domain set not null;

create unique index if not exists uq_sender_identity
  on public.sender_identities(account_id, email_from);


-- C) Preflight logs ----------------------------------------------------------
create table if not exists public.preflight_logs (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  campaign_id uuid,
  lead_id uuid,
  to_email text,
  status text not null check (status in ('allow','block')),
  reason text not null,
  meta jsonb default '{}'::jsonb
);

create index if not exists idx_preflight_created
  on public.preflight_logs(created_at);


-- D) Send/day + last send helper views ---------------------------------------
create or replace view public.v_send_counts_today as
select
  s.campaign_id,
  coalesce(c.owner_id, c.user_id) as account_id,
  count(*) filter (where s.created_at::date = current_date)::int as sends_today
from public.send_logs s
join public.campaigns c on c.id = s.campaign_id
group by 1,2;

create or replace view public.v_lead_last_send as
select
  lead_id,
  max(created_at) as last_sent_at
from public.send_logs
where status in ('queued','sent','delivered','opened','clicked','replied','bounced')
group by 1;


-- E) Preflight RPC -----------------------------------------------------------
create or replace function public.preflight_check(
  p_campaign_id uuid,
  p_account_id uuid,
  p_lead_id uuid,
  p_to text,
  p_sender_email text,
  p_idem_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_block text;
  v_meta jsonb := '{}'::jsonb;
  v_c public.campaigns%rowtype;
  v_acc_cap int;
  v_camp_cap int;
  v_today int := 0;
  v_last timestamptz;
  v_office jsonb;
  v_sender public.sender_identities%rowtype;
  v_now timestamptz := now();
  v_day int := extract(isodow from v_now)::int;
  v_hour int := extract(hour from v_now)::int;
  v_idem_exists boolean := false;
  v_enable boolean := false;
begin
  -- Idempotency window: allow repeat within 2h if prior allow
  if p_idem_key is not null then
    select exists(
      select 1
      from public.preflight_logs
      where meta ->> 'idem_key' = p_idem_key
        and status = 'allow'
        and created_at >= now() - interval '2 hours'
    )
    into v_idem_exists;

    if v_idem_exists then
      return jsonb_build_object('ok', true, 'reason', 'idempotent-allow');
    end if;
  end if;

  -- Campaign context
  select *
    into v_c
  from public.campaigns
  where id = p_campaign_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'campaign-not-found');
  end if;

  v_acc_cap := (
    select coalesce(u.daily_cap, 500)
    from auth.users u
    where u.id = p_account_id
  );

  v_camp_cap := coalesce(v_c.daily_cap, 250);
  v_office := coalesce(v_c.office_hours, '{"enable":false,"start":8,"end":18,"days":[1,2,3,4,5]}'::jsonb);

  -- 1) Suppression
  if p_to is not null and public.is_suppressed(p_campaign_id, p_account_id, lower(p_to)) then
    v_block := 'suppressed';
    v_meta := jsonb_build_object('to', lower(p_to));
  end if;

  -- 2) account / campaign caps
  if v_block is null then
    select coalesce(sends_today, 0)
      into v_today
    from public.v_send_counts_today
    where campaign_id = p_campaign_id
      and account_id = coalesce(v_c.owner_id, v_c.user_id);

    if v_today >= v_camp_cap then
      v_block := 'campaign-daily-cap';
    end if;

    if v_block is null then
      select coalesce(sum(sends_today), 0)
        into v_today
      from public.v_send_counts_today
      where account_id = p_account_id;

      if v_today >= v_acc_cap then
        v_block := 'account-daily-cap';
      end if;
    end if;
  end if;

  -- 3) Mailbox warmup / DNS health
  if v_block is null then
    select *
      into v_sender
    from public.sender_identities
    where account_id = p_account_id
      and email_from = lower(p_sender_email);

    if v_sender.blocked_until is not null and v_now < v_sender.blocked_until then
      v_block := 'mailbox-blocked';
      v_meta := v_meta || jsonb_build_object('until', v_sender.blocked_until);
    elsif coalesce(v_sender.is_warmup, false) and coalesce(v_sender.warmup_stage, 'warming') <> 'ready' then
      v_block := 'mailbox-not-ready';
      v_meta := v_meta || jsonb_build_object('stage', v_sender.warmup_stage);
    elsif v_sender.email_from is not null then
      if v_sender.spf_ok is false or v_sender.dkim_ok is false or v_sender.mx_ok is false then
        v_block := 'dns-health-fail';
        v_meta := v_meta || jsonb_build_object(
          'spf', v_sender.spf_ok,
          'dkim', v_sender.dkim_ok,
          'mx', v_sender.mx_ok,
          'dmarc', v_sender.dmarc_ok
        );
      end if;
    end if;
  end if;

  -- 4) Cadence per lead
  if v_block is null and p_lead_id is not null then
    select last_sent_at
      into v_last
    from public.v_lead_last_send
    where lead_id = p_lead_id;

    if v_last is not null and v_now < v_last + make_interval(mins => v_c.cadence_min_minutes) then
      v_block := 'cadence-window';
      v_meta := v_meta || jsonb_build_object(
        'last_sent_at', v_last,
        'min_minutes', v_c.cadence_min_minutes
      );
    end if;
  end if;

  -- 5) Office hours (optional)
  if v_block is null then
    v_enable := coalesce((v_office ->> 'enable')::boolean, false);
    if v_enable then
      if not exists (
        select 1
        from jsonb_array_elements_text(coalesce(v_office -> 'days', '[]'::jsonb)) as d(day)
        where (d.day)::int = v_day
      ) then
        v_block := 'office-hours-day';
      else
        if not (
          v_hour between coalesce((v_office ->> 'start')::int, 8)
                  and coalesce((v_office ->> 'end')::int, 18)
        ) then
          v_block := 'office-hours-hour';
        end if;
      end if;
    end if;
  end if;

  -- Log outcome
  insert into public.preflight_logs (
    campaign_id,
    lead_id,
    to_email,
    status,
    reason,
    meta
  )
  values (
    p_campaign_id,
    p_lead_id,
    lower(p_to),
    case when v_block is null then 'allow' else 'block' end,
    coalesce(v_block, 'ok'),
    v_meta || jsonb_build_object('idem_key', p_idem_key)
  );

  if v_block is null then
    return jsonb_build_object('ok', true, 'reason', 'ok');
  else
    return jsonb_build_object('ok', false, 'error', v_block, 'meta', v_meta);
  end if;
end;
$$;


-- F) enqueue_send RPC patched with preflight ---------------------------------
create or replace function public.enqueue_send(
  p_campaign_id uuid,
  p_account_id uuid,
  p_lead_id uuid,
  p_to text,
  p_subject text,
  p_body text,
  p_sender_email text,
  p_idem_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gate jsonb;
  v_id uuid;
begin
  select public.preflight_check(
    p_campaign_id,
    p_account_id,
    p_lead_id,
    p_to,
    p_sender_email,
    p_idem_key
  )
  into v_gate;

  if coalesce((v_gate ->> 'ok')::boolean, false) = false then
    insert into public.send_logs(
      campaign_id,
      lead_id,
      to_email,
      subject,
      body_preview,
      status,
      error,
      reason,
      meta
    )
    values (
      p_campaign_id,
      p_lead_id,
      lower(p_to),
      p_subject,
      left(coalesce(p_body, ''), 500),
      'blocked',
      null,
      v_gate ->> 'error',
      (v_gate -> 'meta')
    );
    return null;
  end if;

  insert into public.send_queue(
    id,
    campaign_id,
    lead_id,
    to_email,
    subject,
    body_html,
    status,
    sender_email,
    idem_key
  )
  values (
    gen_random_uuid(),
    p_campaign_id,
    p_lead_id,
    lower(p_to),
    p_subject,
    p_body,
    'queued',
    lower(p_sender_email),
    p_idem_key
  )
  returning id
  into v_id;

  insert into public.send_logs(
    campaign_id,
    lead_id,
    to_email,
    subject,
    body_preview,
    status,
    reason,
    meta
  )
  values (
    p_campaign_id,
    p_lead_id,
    lower(p_to),
    p_subject,
    left(coalesce(p_body, ''), 500),
    'queued',
    'preflight-ok',
    jsonb_build_object('idem_key', p_idem_key)
  );

  return v_id;
end;
$$;



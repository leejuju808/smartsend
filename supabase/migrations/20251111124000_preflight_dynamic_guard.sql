-- Preflight safety: ensure schema, views, and RPCs support idempotent gating.

-- A) Ensure send queue columns exist for gating context -----------------------
alter table if exists public.send_queue
  add column if not exists to_email text,
  add column if not exists sender_email text,
  add column if not exists idem_key text;

-- B) Daily send counts + last send helper views -------------------------------
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

-- C) Preflight RPC ------------------------------------------------------------
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
  v_campaign public.campaigns%rowtype;
  v_sender public.sender_identities%rowtype;
  v_acc_cap int;
  v_camp_cap int;
  v_today int := 0;
  v_last timestamptz;
  v_office jsonb;
  v_now timestamptz := now();
  v_day int := extract(isodow from v_now)::int;
  v_hour int := extract(hour from v_now)::int;
  v_idem_exists boolean := false;
  v_office_enabled boolean := false;
begin
  -- Idempotency: allow repeat within 2h if prior allow with same key.
  if p_idem_key is not null then
    select exists (
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

  -- Load campaign context
  select *
    into v_campaign
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

  if v_acc_cap is null then
    v_acc_cap := 500;
  end if;

  v_camp_cap := coalesce(v_campaign.daily_cap, 250);
  v_office := coalesce(
    v_campaign.office_hours,
    '{"enable":false,"start":8,"end":18,"days":[1,2,3,4,5]}'::jsonb
  );

  -- 1) Suppression
  if p_to is not null and public.is_suppressed(p_campaign_id, p_account_id, lower(p_to)) then
    v_block := 'suppressed';
    v_meta := v_meta || jsonb_build_object('to', lower(p_to));
  end if;

  -- 2) Account / campaign caps
  if v_block is null then
    select coalesce(sends_today, 0)
      into v_today
    from public.v_send_counts_today
    where campaign_id = p_campaign_id
      and account_id = p_account_id;

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

  -- 4) Cadence window (per lead)
  if v_block is null and p_lead_id is not null then
    select last_sent_at
      into v_last
    from public.v_lead_last_send
    where lead_id = p_lead_id;

    if v_last is not null
       and v_now < v_last + make_interval(mins => v_campaign.cadence_min_minutes) then
      v_block := 'cadence-window';
      v_meta := v_meta || jsonb_build_object(
        'last_sent_at', v_last,
        'min_minutes', v_campaign.cadence_min_minutes
      );
    end if;
  end if;

  -- 5) Office hours (optional)
  if v_block is null then
    v_office_enabled := coalesce((v_office ->> 'enable')::boolean, false);
    if v_office_enabled then
      if not exists (
        select 1
        from jsonb_array_elements_text(coalesce(v_office -> 'days', '[]'::jsonb)) as d(day)
        where d.day::int = v_day
      ) then
        v_block := 'office-hours-day';
      elsif not (
        v_hour between coalesce((v_office ->> 'start')::int, 8)
                     and coalesce((v_office ->> 'end')::int, 18)
      ) then
        v_block := 'office-hours-hour';
      end if;
    end if;
  end if;

  -- Log decision
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
  end if;

  return jsonb_build_object('ok', false, 'error', v_block, 'meta', v_meta);
end;
$$;

-- D) enqueue_send RPC patched to capture queue + logs ------------------------
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
  v_queue_id uuid;
  v_body_preview text;
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
      coalesce(v_gate ->> 'error', 'preflight-block'),
      coalesce(v_gate -> 'meta', '{}'::jsonb)
    );
    return null;
  end if;

  v_body_preview := left(coalesce(p_body, ''), 500);

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
  returning id into v_queue_id;

  insert into public.send_logs(
    queue_id,
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
    v_queue_id,
    p_campaign_id,
    p_lead_id,
    lower(p_to),
    p_subject,
    v_body_preview,
    'queued',
    'preflight-ok',
    jsonb_build_object('idem_key', p_idem_key)
  );

  return v_queue_id;
end;
$$;

-- E) dequeue helper includes gating context ----------------------------------
create or replace function public.dequeue_send_job(
  p_worker text,
  p_account uuid,
  p_backoff_seconds int default 5
)
returns table(
  id uuid,
  campaign_id uuid,
  lead_id uuid,
  thread_id uuid,
  subject text,
  body_html text,
  provider_thread_id text,
  to_email text,
  sender_email text,
  idem_key text,
  account_owner uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_available timestamptz;
begin
  select case
           when sr.last_sent_at is null then now()
           else sr.last_sent_at + make_interval(secs => sr.min_seconds_between)
         end
    into v_next_available
  from public.send_rate sr
  where sr.account_id = p_account;

  if v_next_available is not null and v_next_available > now() then
    return;
  end if;

  return query
  with next_job as (
    select q.*, c.owner_id
    from public.send_queue q
    join public.campaigns c on c.id = q.campaign_id
    where q.status = 'queued'
      and coalesce(q.send_after, q.not_before, now()) <= now()
      and c.account_id = p_account
    order by q.priority desc nulls last,
             coalesce(q.send_after, q.not_before) nulls last,
             q.created_at
    for update skip locked
    limit 1
  ),
  updated as (
    update public.send_queue x
      set status = 'sending',
          picked_at = now(),
          picked_by = p_worker
    where x.id in (select id from next_job)
    returning x.*, (
      select owner_id from public.campaigns c where c.id = x.campaign_id
    ) as owner_id
  )
  select
    id,
    campaign_id,
    lead_id,
    thread_id,
    subject,
    body_html,
    provider_thread_id,
    to_email,
    sender_email,
    idem_key,
    owner_id
  from updated;
end;
$$;

grant execute on function public.dequeue_send_job(text, uuid, int) to authenticated, service_role;

-- F) Admin: sender health updater --------------------------------------------
create or replace function public.update_sender_health(
  p_account_id uuid,
  p_email_from text,
  p_fields jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fields jsonb := coalesce(p_fields, '{}'::jsonb);
  v_email text := lower(coalesce(p_email_from, ''));
  v_domain text;
begin
  if position('@' in v_email) > 0 then
    v_domain := nullif(split_part(v_email, '@', 2), '');
  else
    v_domain := null;
  end if;

  insert into public.sender_identities(account_id, email_from, domain)
  values (
    p_account_id,
    v_email,
    coalesce(v_domain, nullif(split_part(v_email, '@', 2), ''))
  )
  on conflict (account_id, email_from)
  do update set
    is_warmup = coalesce((v_fields ->> 'is_warmup')::boolean, sender_identities.is_warmup),
    warmup_stage = coalesce(v_fields ->> 'warmup_stage', sender_identities.warmup_stage),
    spf_ok = coalesce((v_fields ->> 'spf_ok')::boolean, sender_identities.spf_ok),
    dkim_ok = coalesce((v_fields ->> 'dkim_ok')::boolean, sender_identities.dkim_ok),
    dmarc_ok = coalesce((v_fields ->> 'dmarc_ok')::boolean, sender_identities.dmarc_ok),
    mx_ok = coalesce((v_fields ->> 'mx_ok')::boolean, sender_identities.mx_ok),
    blocked_until = coalesce((v_fields ->> 'blocked_until')::timestamptz, sender_identities.blocked_until)
  where sender_identities.account_id = p_account_id
    and sender_identities.email_from = v_email;
end;
$$;

grant execute on function public.update_sender_health(uuid, text, jsonb) to service_role;


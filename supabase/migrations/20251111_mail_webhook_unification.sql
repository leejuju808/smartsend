-- Mail webhook ingestion, suppression helpers, and reputation health

create extension if not exists citext;
create extension if not exists pgcrypto;

-- A) Raw webhook intake --------------------------------------------------------

create table if not exists public.mail_webhooks_raw (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  provider text not null,
  event text not null,
  payload jsonb not null
);

create index if not exists idx_mwr_created
  on public.mail_webhooks_raw (created_at desc);

-- B) Normalized mail events ----------------------------------------------------

create table if not exists public.mail_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  provider text not null,
  event text not null check (event in (
    'delivered','deferred','bounce_soft','bounce_hard','complaint','blocked','reject'
  )),
  account_id uuid references public.accounts(id) on delete set null,
  queue_id uuid references public.send_queue(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  sender_email citext,
  recipient_email citext,
  message_id text,
  reason text,
  details jsonb
);

create index if not exists idx_me_account_time
  on public.mail_events (account_id, created_at desc);

create index if not exists idx_me_recipient
  on public.mail_events (recipient_email);

-- C) Rolling reputation metrics (7 day window) ---------------------------------

create materialized view if not exists public.mail_health_7d as
select
  coalesce(sender_email, '*'::citext) as sender_email,
  coalesce(split_part(sender_email::text, '@', 2), '*') as sender_domain,
  count(*) filter (where event = 'delivered') as delivered,
  count(*) filter (where event = 'bounce_soft') as soft_bounces,
  count(*) filter (where event = 'bounce_hard') as hard_bounces,
  count(*) filter (where event = 'complaint') as complaints,
  count(*) filter (where event in ('blocked','reject')) as blocks
from public.mail_events
where created_at >= now() - interval '7 days'
group by 1, 2;

create unique index if not exists idx_mhealth7d_sender
  on public.mail_health_7d (sender_email, sender_domain);

-- D) Helper to refresh the materialized view -----------------------------------

create or replace function public.refresh_mail_health()
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  begin
    refresh materialized view concurrently public.mail_health_7d;
  exception
    when others then
      refresh materialized view public.mail_health_7d;
  end;
end;
$$;

grant execute on function public.refresh_mail_health() to authenticated;

-- E) Bounce/complaint reason catalog -------------------------------------------

create table if not exists public.bounce_reasons (
  code text primary key,
  severity text not null default 'soft' check (severity in ('soft','hard')),
  description text
);

insert into public.bounce_reasons (code, severity, description) values
  ('invalid_recipient','hard','Recipient address does not exist'),
  ('mailbox_full','soft','Recipient mailbox is full'),
  ('policy','hard','Provider policy/blocked'),
  ('dmarc','hard','DMARC failure'),
  ('spf','hard','SPF failure'),
  ('dkim','hard','DKIM failure'),
  ('unknown','soft','Unknown bounce')
on conflict (code) do nothing;

-- F) Suppression helper --------------------------------------------------------

create or replace function public.apply_suppression_from_event(
  p_account uuid,
  p_email citext,
  p_domain citext,
  p_kind text,
  p_reason text
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_scope text;
  v_reason text;
begin
  v_scope := case when p_account is null then 'global' else 'account' end;
  v_reason := coalesce(nullif(trim(p_reason), ''), p_kind);

  if p_email is not null then
    perform public.add_suppression(
      v_scope,
      'email',
      p_email::text,
      v_reason,
      p_account,
      null,
      p_kind
    );
  end if;

  if p_kind in ('complaint','policy','reject')
     and p_domain is not null then
    perform public.add_suppression(
      v_scope,
      'domain',
      p_domain::text,
      v_reason,
      p_account,
      null,
      p_kind
    );
  end if;

  if p_account is not null and p_email is not null then
    update public.send_queue
       set state = 'skipped',
           last_error = trim(both ' ' from coalesce(last_error, '') || ' SUPPRESSED')
     where account_id = p_account
       and recipient_email = p_email
       and state in ('queued','inflight');
  end if;

  -- Optional backoff hook: insert into send_events as needed (omitted for now)
end;
$$;

grant execute on function public.apply_suppression_from_event(uuid, citext, citext, text, text) to authenticated;

-- G) Sender pause registry -----------------------------------------------------

create table if not exists public.sender_pauses (
  key text primary key,
  reason text,
  until timestamptz not null
);

-- H) Evaluate sender/domain health ---------------------------------------------

create or replace function public.evaluate_sender_health()
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  r record;
  comp_rate numeric;
  hb_rate numeric;
  v_scope text;
begin
  for r in select * from public.mail_health_7d loop
    if r.delivered > 0 then
      comp_rate := r.complaints::numeric / r.delivered;
      hb_rate := r.hard_bounces::numeric / r.delivered;
    else
      comp_rate := 0;
      hb_rate := 0;
    end if;

    if comp_rate > 0.003 or hb_rate > 0.05 then
      insert into public.sender_pauses (key, reason, until)
      values (
        case
          when r.sender_email is not null and r.sender_email <> '*'::citext
            then 'sender:' || lower(r.sender_email::text)
          else 'domain:' || lower(coalesce(r.sender_domain, '*'))
        end,
        'health_threshold',
        now() + interval '6 hours'
      )
      on conflict (key) do update
        set until = greatest(public.sender_pauses.until, excluded.until),
            reason = excluded.reason;
    end if;
  end loop;
end;
$$;

grant execute on function public.evaluate_sender_health() to authenticated;

-- I) Cron wiring ---------------------------------------------------------------

do $$
begin
  perform cron.unschedule('sender-health-eval');
exception
  when undefined_function then
    null;
end;
$$;

select cron.schedule(
  'sender-health-eval',
  '15 * * * *',
  $$select public.refresh_mail_health(); select public.evaluate_sender_health();$$
) where exists (select 1 from pg_extension where extname = 'pg_cron');

-- J) Post-install refresh ------------------------------------------------------

do $$
begin
  begin
    perform public.refresh_mail_health();
  exception
    when others then
      null;
  end;
exception
  when undefined_function then
    null;
end;
$$;






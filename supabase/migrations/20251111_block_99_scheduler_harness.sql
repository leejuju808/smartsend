-- QA scheduler harness (Block 99)
-- Seed helpers, assertion utilities, and supporting catalog for scheduler QA scenarios.

begin;

create schema if not exists qa;

create table if not exists qa.scheduler_cases (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  account_id uuid not null references public.accounts(id) on delete cascade,
  params jsonb not null,
  expect jsonb not null
);

create or replace function qa.reset_account(p_account uuid)
returns void
language plpgsql
as $$
begin
  delete from public.send_outcomes where account_id = p_account;
  delete from public.domain_reputation where account_id = p_account;

  delete from public.mx_cache
  where domain in ('acme.com', 'contoso.com', 'yahoo-test.com', 'zoho-test.com');

  delete from public.isp_caps where account_id = p_account;

  delete from public.threads
  where account_id = p_account
    and lead_id in (
      select id
      from public.leads
      where account_id = p_account
        and email ilike any(array['%@acme.com', '%@contoso.com', '%@yahoo-test.com', '%@zoho-test.com'])
    );

  delete from public.leads
  where account_id = p_account
    and email ilike any(array['%@acme.com', '%@contoso.com', '%@yahoo-test.com', '%@zoho-test.com']);
end
$$;

create or replace function qa.seed_scheduler_matrix(p_account uuid, p_counts jsonb)
returns jsonb
language plpgsql
as $$
declare
  gmail_ct int := coalesce((p_counts ->> 'gmail')::int, 20);
  outlook_ct int := coalesce((p_counts ->> 'outlook')::int, 20);
  yahoo_ct int := coalesce((p_counts ->> 'yahoo')::int, 6);
  other_ct int := coalesce((p_counts ->> 'other')::int, 6);
  i int;
  lid uuid;
begin
  for i in 1..gmail_ct loop
    insert into public.leads (id, account_id, email, first_name, last_name, company_name)
    values (gen_random_uuid(), p_account, format('lead%sg@acme.com', i), 'Gina', i::text, 'Acme')
    returning id into lid;

    insert into public.threads (id, account_id, lead_id, created_at)
    values (gen_random_uuid(), p_account, lid, now());
  end loop;

  for i in 1..outlook_ct loop
    insert into public.leads (id, account_id, email, first_name, last_name, company_name)
    values (gen_random_uuid(), p_account, format('lead%so@contoso.com', i), 'Owen', i::text, 'Contoso')
    returning id into lid;

    insert into public.threads (id, account_id, lead_id, created_at)
    values (gen_random_uuid(), p_account, lid, now());
  end loop;

  for i in 1..yahoo_ct loop
    insert into public.leads (id, account_id, email, first_name, last_name, company_name)
    values (gen_random_uuid(), p_account, format('lead%sy@yahoo-test.com', i), 'Yara', i::text, 'YahooTest')
    returning id into lid;

    insert into public.threads (id, account_id, lead_id, created_at)
    values (gen_random_uuid(), p_account, lid, now());
  end loop;

  for i in 1..other_ct loop
    insert into public.leads (id, account_id, email, first_name, last_name, company_name)
    values (gen_random_uuid(), p_account, format('lead%sz@zoho-test.com', i), 'Zara', i::text, 'ZohoTest')
    returning id into lid;

    insert into public.threads (id, account_id, lead_id, created_at)
    values (gen_random_uuid(), p_account, lid, now());
  end loop;

  insert into public.mx_cache (domain, mx_host, isp_key, fetched_at)
  values
    ('acme.com', 'aspmx.l.google.com', 'gmail', now()),
    ('contoso.com', 'contoso.mail.protection.outlook.com', 'outlook', now()),
    ('yahoo-test.com', 'mx.yahoodns.net', 'yahoo', now()),
    ('zoho-test.com', 'mx.zoho.com', 'other', now())
  on conflict (domain) do update
    set mx_host = excluded.mx_host,
        isp_key = excluded.isp_key,
        fetched_at = excluded.fetched_at;

  return jsonb_build_object(
    'ok', true,
    'gmail_leads', gmail_ct,
    'outlook_leads', outlook_ct,
    'yahoo_leads', yahoo_ct,
    'other_leads', other_ct
  );
end
$$;

create or replace function qa.set_isp_caps(p_account uuid, p_caps jsonb)
returns void
language plpgsql
as $$
begin
  insert into public.isp_caps (account_id, isp_key, hourly_cap, daily_cap, max_concurrency, jitter_ms_min, jitter_ms_max)
  values
    (
      p_account,
      'gmail',
      coalesce((p_caps ->> 'gmail_hourly')::int, 10),
      coalesce((p_caps ->> 'gmail_daily')::int, 200),
      2,
      200,
      500
    ),
    (
      p_account,
      'outlook',
      coalesce((p_caps ->> 'outlook_hourly')::int, 8),
      coalesce((p_caps ->> 'outlook_daily')::int, 150),
      2,
      200,
      500
    ),
    (
      p_account,
      'yahoo',
      coalesce((p_caps ->> 'yahoo_hourly')::int, 5),
      coalesce((p_caps ->> 'yahoo_daily')::int, 100),
      1,
      200,
      500
    ),
    (
      p_account,
      'other',
      coalesce((p_caps ->> 'other_hourly')::int, 5),
      coalesce((p_caps ->> 'other_daily')::int, 100),
      1,
      200,
      500
    )
  on conflict (account_id, isp_key)
  do update
  set
    hourly_cap = excluded.hourly_cap,
    daily_cap = excluded.daily_cap,
    max_concurrency = excluded.max_concurrency,
    jitter_ms_min = excluded.jitter_ms_min,
    jitter_ms_max = excluded.jitter_ms_max;
end
$$;

create or replace function qa.set_domain_rep(
  p_account uuid,
  p_domain text,
  p_band int,
  p_rep numeric,
  p_hourly int,
  p_daily int,
  p_backoff_seconds int default 0
)
returns void
language plpgsql
as $$
begin
  insert into public.domain_reputation (
    account_id,
    domain,
    warmup_band,
    rep_score,
    hourly_cap,
    daily_cap,
    last_backoff_until
  )
  values (
    p_account,
    p_domain,
    p_band,
    p_rep,
    p_hourly,
    p_daily,
    case
      when p_backoff_seconds > 0 then now() + make_interval(secs => p_backoff_seconds)
      else null
    end
  )
  on conflict (account_id, domain, coalesce(mailbox, '*'))
  do update
  set
    warmup_band = excluded.warmup_band,
    rep_score = excluded.rep_score,
    hourly_cap = excluded.hourly_cap,
    daily_cap = excluded.daily_cap,
    last_backoff_until = excluded.last_backoff_until,
    updated_at = now();
end
$$;

create or replace function qa.sim_outcomes(p_account uuid, p_domain text, p_sent int, p_bounced int, p_spam int)
returns void
language plpgsql
as $$
declare
  i int;
  v_isp text;
begin
  select coalesce(mc.isp_key, 'other')
  into v_isp
  from public.mx_cache mc
  where mc.domain = p_domain;

  if v_isp is null then
    v_isp := 'other';
  end if;

  for i in 1..p_sent loop
    insert into public.send_outcomes (account_id, domain, outcome, created_at, isp_key)
    values (p_account, p_domain, 'sent', now(), v_isp);
  end loop;

  for i in 1..p_bounced loop
    insert into public.send_outcomes (account_id, domain, outcome, created_at, isp_key)
    values (p_account, p_domain, 'bounced', now(), v_isp);
  end loop;

  for i in 1..p_spam loop
    insert into public.send_outcomes (account_id, domain, outcome, created_at, isp_key)
    values (p_account, p_domain, 'spam', now(), v_isp);
  end loop;
end
$$;

commit;


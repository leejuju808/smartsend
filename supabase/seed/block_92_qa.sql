-- Block 92 QA seed data

insert into public.mx_cache (domain, mx_host, isp_key, fetched_at) values
  ('acme.com', 'aspmx.l.google.com', 'gmail', now()),
  ('contoso.com', 'contoso.mail.protection.outlook.com', 'outlook', now())
on conflict (domain) do update
  set mx_host = excluded.mx_host,
      isp_key = excluded.isp_key,
      fetched_at = excluded.fetched_at;

insert into public.isp_caps (account_id, isp_key, hourly_cap, daily_cap, max_concurrency, jitter_ms_min, jitter_ms_max)
values ('00000000-0000-0000-0000-000000000001', 'gmail', 5, 50, 1, 500, 1200)
on conflict (account_id, isp_key) do update
  set hourly_cap = excluded.hourly_cap,
      daily_cap = excluded.daily_cap,
      max_concurrency = excluded.max_concurrency,
      jitter_ms_min = excluded.jitter_ms_min,
      jitter_ms_max = excluded.jitter_ms_max;


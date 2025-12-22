-- Block 100 QA seeds — quiet hours guard
\set acct '00000000-0000-0000-0000-000000000001'

-- Force base quiet hours to cover entire day for deterministic testing
update public.accounts
set timezone = 'America/Los_Angeles',
    quiet_hours = '{"enabled":true,"start":"00:00","end":"23:59"}'
where id = :'acct';

-- Gmail override disabled (should still be quiet via base)
insert into public.isp_quiet_overrides(account_id, isp_key, enabled, start_hhmm, end_hhmm)
values (:'acct','gmail',false,'00:00','00:00')
on conflict (account_id, isp_key) do update set enabled = excluded.enabled;

-- Probe helper
select public.is_quiet_for_isp(:'acct','gmail') as gmail_quiet;
select public.is_quiet_for_isp(:'acct','outlook') as outlook_quiet;

-- Enable Gmail override with custom window (22:00–06:00 local) and enabled flag
update public.isp_quiet_overrides
set enabled = true,
    start_hhmm = '22:00',
    end_hhmm = '06:00'
where account_id = :'acct'
  and isp_key = 'gmail';

-- After this update, Gmail should be outside quiet hours if current time ≈ 19:00 PT
select public.is_quiet_for_isp(:'acct','gmail') as gmail_quiet_after_override;


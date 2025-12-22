-- Block 81 QA seed data

-- Set a narrow window to see it working
insert into public.send_time_policies (account_id, name, windows, min_hour, max_hour)
values (
  '00000000-0000-0000-0000-000000000001',
  'Default',
  '{"mon":[9,10],"tue":[9,10],"wed":[9,10],"thu":[9,10],"fri":[9,10],"sat":null,"sun":null}'::jsonb,
  8,
  18
)
on conflict (account_id, name) do update
  set windows = excluded.windows,
      min_hour = excluded.min_hour,
      max_hour = excluded.max_hour;

-- Give a lead a timezone
update public.leads
set timezone = 'America/Los_Angeles'
where account_id = '00000000-0000-0000-0000-000000000001'
limit 1;


alter table public.profiles
  add column if not exists plan_interval text;

-- keep data clean (nullable allowed; when set must be 'month' or 'year')
alter table public.profiles
  add constraint if not exists chk_profiles_plan_interval
  check (plan_interval in ('month','year') or plan_interval is null);

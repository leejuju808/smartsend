-- Usage helper functions
-- 11_usage_helpers.sql

create or replace function count_user_sends_last_minute(p_user_id uuid)
returns int language sql security definer as $$
  select count(*)::int
  from email_sends es
  join email_jobs j on j.id = es.job_id
  where j.user_id = p_user_id and es.created_at >= now() - interval '60 seconds';
$$;

create or replace function inc_monthly_usage(p_user_id uuid, p_period text)
returns void language plpgsql security definer as $$
begin
  update usage_monthly
  set sent_count = sent_count + 1, updated_at = now()
  where user_id = p_user_id and period_ym = p_period;
end $$;
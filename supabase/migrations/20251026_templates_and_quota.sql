-- Campaign templates (subject/text/html). You can use either text or html or both.
alter table if exists public.campaigns
  add column if not exists subject_tpl text,
  add column if not exists text_tpl text,
  add column if not exists html_tpl text;

-- Rate window ledger (per provider account, minute buckets)
create table if not exists public.send_rate_windows (
  account_id uuid not null,
  bucket_ts timestamptz not null,  -- truncated to minute
  used int not null default 0,
  primary key (account_id, bucket_ts)
);

-- Reserve quota atomically for current minute.
create or replace function public.reserve_send_quota(
  p_account_id uuid,
  p_want int,
  p_per_min int
) returns int
language plpgsql
security definer
as $$
declare
  v_bucket timestamptz := date_trunc('minute', now());
  v_used int;
  v_can int;
  v_take int;
begin
  -- Ensure row exists
  insert into public.send_rate_windows (account_id, bucket_ts, used)
  values (p_account_id, v_bucket, 0)
  on conflict (account_id, bucket_ts) do nothing;

  -- Lock the row then compute available
  select used into v_used
  from public.send_rate_windows
  where account_id = p_account_id and bucket_ts = v_bucket
  for update;

  v_can := greatest(p_per_min - v_used, 0);
  v_take := least(p_want, v_can);

  update public.send_rate_windows
     set used = used + v_take
   where account_id = p_account_id and bucket_ts = v_bucket;

  return v_take;
end;
$$;

revoke all on function public.reserve_send_quota(uuid, int, int) from public;
grant execute on function public.reserve_send_quota(uuid, int, int) to service_role;
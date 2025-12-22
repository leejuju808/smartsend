alter table public.connected_accounts
  add column if not exists provider text,
  add column if not exists access_token text,
  add column if not exists refresh_token text,
  add column if not exists expires_at timestamptz,
  add column if not exists email text,
  add column if not exists meta jsonb default '{}'::jsonb;

create index if not exists idx_conn_provider on public.connected_accounts(provider);
create index if not exists idx_conn_user on public.connected_accounts(user_id);
create index if not exists idx_conn_exp on public.connected_accounts(expires_at);

create table if not exists public.oauth_refresh_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null,
  provider text not null,
  result text not null,
  reason text,
  next_expires_at timestamptz,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists idx_oauth_logs_acc on public.oauth_refresh_logs(account_id, created_at desc);

create or replace function public._oauth_update_tokens(
  p_account_id uuid,
  p_access_token text,
  p_expires_at timestamptz
) returns void
language sql
security definer
set search_path = public
as $$
  update public.connected_accounts
     set access_token = p_access_token,
         expires_at   = p_expires_at
   where id = p_account_id;
$$;

revoke all on function public._oauth_update_tokens(uuid, text, timestamptz) from public;
grant execute on function public._oauth_update_tokens(uuid, text, timestamptz) to service_role;

create or replace view public.v_accounts_expiring_soon as
select *
from public.connected_accounts
where refresh_token is not null
  and expires_at is not null
  and expires_at <= now() + interval '5 minutes';

create or replace function public.try_advisory_lock(p_key bigint) returns boolean
language plpgsql
as $$
declare
  ok boolean;
begin
  select pg_try_advisory_lock(p_key) into ok;
  return ok;
end;
$$;

create or replace function public.advisory_unlock(p_key bigint) returns void
language plpgsql
as $$
begin
  perform pg_advisory_unlock(p_key);
end;
$$;

create or replace function public._rate_ok(p_account uuid)
returns boolean
language sql
stable
as $$
  select coalesce((
    select count(*) < 60
    from public.send_logs
    where account_id = p_account
      and created_at > now() - interval '60 seconds'
  ), true);
$$;


-- Token Bucket Rate Limiting System
-- Implements per-account, per-provider token buckets for smooth send rate control
-- Works alongside daily quota caps (Block 112) to prevent burst-related 429 errors

-- A) Token bucket table
create table if not exists public.send_rate_buckets (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  provider text not null check (provider in ('gmail','outlook')),
  capacity int not null default 100,           -- max tokens in bucket
  refill_per_sec numeric not null default 1,   -- tokens added each second
  tokens numeric not null default 0,           -- current tokens
  last_refill_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(account_id, provider)
);

create index if not exists idx_send_rate_buckets_account_provider 
  on public.send_rate_buckets(account_id, provider);

-- Enable RLS
alter table public.send_rate_buckets enable row level security;

-- RLS policy: service role can do everything
create policy "service_role_full_access" on public.send_rate_buckets
  for all
  to service_role
  using (true)
  with check (true);

-- RLS policy: authenticated users can read/update their own buckets
create policy "users_manage_own_buckets" on public.send_rate_buckets
  for all
  to authenticated
  using (
    exists (
      select 1 from public.accounts a
      where a.id = send_rate_buckets.account_id
      -- Adjust based on your accounts table structure (user_id or id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.accounts a
      where a.id = send_rate_buckets.account_id
    )
  );

-- Trigger to update updated_at
create or replace function public.update_send_rate_buckets_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_send_rate_buckets_updated_at
  before update on public.send_rate_buckets
  for each row
  execute function public.update_send_rate_buckets_updated_at();

-- B) Atomic token take function
-- Returns true if N tokens were granted, false if bucket is empty
create or replace function public.ratebucket_take(
  p_account uuid, 
  p_provider text, 
  p_n int default 1
) returns boolean
language plpgsql
security definer
as $$
declare
  v_capacity int;
  v_refill_per_sec numeric;
  v_tokens numeric;
  v_last timestamptz;
  v_now timestamptz := now();
  v_elapsed numeric;
  v_newtokens numeric;
  v_granted boolean := false;
begin
  -- upsert row if missing (with defaults)
  insert into public.send_rate_buckets(account_id, provider)
  values (p_account, p_provider)
  on conflict (account_id, provider) do nothing;

  -- lock the row to compute/refill/take atomically
  select capacity, refill_per_sec, tokens, last_refill_at
  into v_capacity, v_refill_per_sec, v_tokens, v_last
  from public.send_rate_buckets
  where account_id = p_account and provider = p_provider
  for update;

  -- calculate elapsed time and refill tokens
  v_elapsed := greatest(extract(epoch from (v_now - v_last)), 0);
  v_newtokens := least(v_capacity::numeric, v_tokens + v_refill_per_sec * v_elapsed);

  -- try to take N tokens
  if v_newtokens >= p_n then
    v_newtokens := v_newtokens - p_n;
    v_granted := true;
  end if;

  -- update bucket state
  update public.send_rate_buckets
  set tokens = v_newtokens,
      last_refill_at = v_now,
      updated_at = v_now
  where account_id = p_account and provider = p_provider;

  return v_granted;
end $$;

-- Grant execute permission
grant execute on function public.ratebucket_take(uuid, text, int) to authenticated, service_role;
















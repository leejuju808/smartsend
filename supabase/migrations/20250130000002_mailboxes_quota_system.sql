-- Mailboxes table with OAuth tokens, quotas, and send_queue extensions
-- Provider tokens per connected mailbox

-- Ensure accounts table has user_id for RLS
alter table public.accounts
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create index if not exists idx_accounts_user_id on public.accounts(user_id);

-- Create mailboxes table
create table if not exists public.mailboxes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  provider text not null check (provider in ('gmail','outlook')),
  email text not null,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,  -- when access_token expires
  scope text,
  send_quota_per_day int not null default 200, -- configurable per mailbox
  send_quota_used int not null default 0,
  quota_reset_at timestamptz,                  -- next reset time (UTC midnight by default)
  enabled boolean not null default true,
  per_minute_cap int not null default 15,      -- optional warmup pacing guard
  unique(account_id, email)
);

alter table public.mailboxes enable row level security;

-- RLS policy: users can only access mailboxes through their accounts
-- Note: This assumes accounts.id maps to auth.users.id (one-to-one) OR accounts.user_id exists
-- If accounts.id = auth.users.id directly, can simplify to: account_id = auth.uid()
create policy "acct owns its mailboxes" on public.mailboxes
  using (
    exists (
      select 1 from public.accounts a
      where a.id = mailboxes.account_id
        and (a.user_id = auth.uid() OR a.id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.accounts a
      where a.id = mailboxes.account_id
        and (a.user_id = auth.uid() OR a.id = auth.uid())
    )
  );

create index if not exists idx_mailboxes_account on public.mailboxes(account_id);
create index if not exists idx_mailboxes_enabled_quota on public.mailboxes(enabled, send_quota_used, send_quota_per_day);

-- Extend send_queue for mailbox routing + pacing
alter table public.send_queue
  add column if not exists mailbox_id uuid references public.mailboxes(id) on delete set null,
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists attempt int not null default 0,
  add column if not exists last_error text,
  add column if not exists html text,
  add column if not exists raw text,
  add column if not exists provider_payload jsonb;

create index if not exists send_queue_sched on public.send_queue(status, next_attempt_at);
create index if not exists send_queue_mailbox on public.send_queue(mailbox_id, status, next_attempt_at);

-- Helper: roll quota reset daily at 00:00 UTC
create or replace function public.reset_mailbox_quota()
returns void language sql as $$
  update public.mailboxes
     set send_quota_used = 0,
         quota_reset_at = date_trunc('day', now() at time zone 'utc') + interval '1 day'
   where coalesce(quota_reset_at, now() - interval '1 minute') <= now();
$$;

grant execute on function public.reset_mailbox_quota() to authenticated;

-- Optional: warmup pacing guard (per-minute cap)
create or replace function public.block_minute_burst()
returns trigger language plpgsql as $$
declare
  sent_last_min int;
  per_min_cap int;
begin
  if new.mailbox_id is null then
    return new;
  end if;

  select per_minute_cap into per_min_cap
  from public.mailboxes
  where id = new.mailbox_id;

  select count(*) into sent_last_min
  from public.send_queue
  where mailbox_id = new.mailbox_id
    and status = 'sent'
    and created_at >= now() - interval '1 minute';

  if sent_last_min >= coalesce(per_min_cap, 15) then
    new.next_attempt_at := now() + interval '60 seconds';
  end if;

  return new;
end$$;

drop trigger if exists trg_block_minute_burst on public.send_queue;
create trigger trg_block_minute_burst
before insert on public.send_queue
for each row execute function public.block_minute_burst();


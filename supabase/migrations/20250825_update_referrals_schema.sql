-- Align referrals schema to: id, inviter, invitee, email, status, created_at
-- Be tolerant to existing columns/user_id,referred_id from prior migrations

-- Ensure table exists
create table if not exists public.referrals (
  id uuid default gen_random_uuid() primary key,
  inviter uuid references public.profiles(id) on delete cascade,
  invitee uuid references public.profiles(id) on delete set null,
  email text,
  status text default 'pending', -- pending|joined|converted
  created_at timestamptz default now()
);

-- Add/rename columns to match spec
do $$
begin
  -- inviter
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'referrals' and column_name = 'inviter'
  ) then
    alter table public.referrals add column inviter uuid;
  end if;

  -- invitee
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'referrals' and column_name = 'invitee'
  ) then
    alter table public.referrals add column invitee uuid;
  end if;

  -- email (set default '' to allow not null without backfilling old rows)
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'referrals' and column_name = 'email'
  ) then
    alter table public.referrals add column email text;
  end if;

  -- status
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'referrals' and column_name = 'status'
  ) then
    alter table public.referrals add column status text default 'pending';
  end if;

  -- created_at
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'referrals' and column_name = 'created_at'
  ) then
    alter table public.referrals add column created_at timestamptz default now();
  end if;
end $$;

-- Backfill inviter/invitee from legacy columns if present
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='referrals' and column_name='user_id') then
    update public.referrals set inviter = coalesce(inviter, user_id);
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='referrals' and column_name='referred_id') then
    update public.referrals set invitee = coalesce(invitee, referred_id);
  end if;
end $$;

-- Constraints and FKs
do $$
begin
  -- FK inviter
  if not exists (
    select 1 from pg_constraint where conname = 'referrals_inviter_fkey'
  ) then
    alter table public.referrals
      add constraint referrals_inviter_fkey foreign key (inviter)
      references public.profiles(id) on delete cascade;
  end if;

  -- FK invitee
  if not exists (
    select 1 from pg_constraint where conname = 'referrals_invitee_fkey'
  ) then
    alter table public.referrals
      add constraint referrals_invitee_fkey foreign key (invitee)
      references public.profiles(id) on delete set null;
  end if;
end $$;

-- Make email NOT NULL with default '' to satisfy spec while tolerating old rows
alter table public.referrals alter column email set default '';
update public.referrals set email = coalesce(email, '');
alter table public.referrals alter column email set not null;

-- Ensure status is NOT NULL and constrained to allowed values via a check
alter table public.referrals alter column status set default 'pending';
update public.referrals set status = coalesce(status, 'pending');
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'referrals_status_check'
  ) then
    alter table public.referrals
      add constraint referrals_status_check check (status in ('pending','joined','converted'));
  end if;
end $$;

-- Helpful indexes
create index if not exists referrals_inviter_idx on public.referrals(inviter);
create index if not exists referrals_invitee_idx on public.referrals(invitee);
create index if not exists referrals_status_idx on public.referrals(status);

-- Unique per inviter+email to avoid duplicates
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'referrals_inviter_email_key'
  ) then
    alter table public.referrals add constraint referrals_inviter_email_key unique (inviter, email);
  end if;
end $$;

-- RLS: enable and allow owners to see their referrals
alter table public.referrals enable row level security;
drop policy if exists "Users view own referrals" on public.referrals;
create policy "Users view own referrals" on public.referrals
  for select using (auth.uid() = inviter or auth.uid() = invitee);


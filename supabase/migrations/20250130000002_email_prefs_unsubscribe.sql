-- Email Preferences and Unsubscribe System
-- Implements per-lead email preferences, unsubscribe tokens, and send queue guards

-- 1) per-lead email preferences
create table if not exists public.email_prefs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  unsubscribed boolean not null default false,
  paused_until date,                   -- snooze
  frequency text not null default 'normal' check (frequency in ('low','normal','high','none')),
  topics text[] not null default '{}'::text[]
);

create unique index if not exists email_prefs_uq on public.email_prefs(account_id, lead_id);

-- 2) signed link tokens (short-lived optional; we also support HMAC)
create table if not exists public.unsubscribe_tokens (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  email_id uuid references public.emails(id) on delete set null,
  token text not null unique,
  expires_at timestamptz
);

-- 3) ensure suppression cohesion
alter table public.leads add column if not exists unsubscribed boolean not null default false;

-- Ensure suppressions table has the structure we need (account_id, lead_id, email, reason, source)
-- Check if suppressions table exists and has the right columns
do $$
begin
  -- Add columns if they don't exist
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'suppressions') then
    alter table public.suppressions add column if not exists account_id uuid references public.accounts(id) on delete cascade;
    alter table public.suppressions add column if not exists lead_id uuid references public.leads(id) on delete set null;
    alter table public.suppressions add column if not exists email text;
    alter table public.suppressions add column if not exists reason text;
    alter table public.suppressions add column if not exists source text;
    alter table public.suppressions add column if not exists details jsonb default '{}'::jsonb;
    
    -- Create unique index if it doesn't exist
    create unique index if not exists suppressions_account_email_uq on public.suppressions(account_id, email) where account_id is not null and email is not null;
  end if;
end $$;

-- RLS
alter table public.email_prefs enable row level security;
alter table public.unsubscribe_tokens enable row level security;

create policy "acct manages its prefs" on public.email_prefs
  using (account_id = auth.uid()) with check (account_id = auth.uid());

create policy "acct manages its tokens" on public.unsubscribe_tokens
  using (account_id = auth.uid()) with check (account_id = auth.uid());

-- helper to apply unsubscribe
create or replace function public.apply_unsubscribe(p_account_id uuid, p_lead_id uuid, p_reason text default 'user_link')
returns void language plpgsql security definer as $$
begin
  insert into public.email_prefs (account_id, lead_id, unsubscribed)
  values (p_account_id, p_lead_id, true)
  on conflict (account_id, lead_id) do update set unsubscribed = true, updated_at = now();

  update public.leads set unsubscribed = true where id = p_lead_id;

  -- Insert into suppressions if table exists and has required columns
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'suppressions' 
    and column_name = 'account_id'
  ) then
    insert into public.suppressions (account_id, lead_id, email, reason, source, details)
    select p_account_id, l.id, l.email, 'unsubscribe', p_reason, jsonb_build_object('source', p_reason)
    from public.leads l where l.id = p_lead_id
    on conflict (account_id, email) do update set reason = 'unsubscribe', details = jsonb_build_object('source', p_reason);
  end if;
end$$;

grant execute on function public.apply_unsubscribe(uuid, uuid, text) to authenticated;

-- send-queue guard (reuse from Block 110): block if lead unsubscribed/pref 'none'
create or replace function public.block_prefs_sends()
returns trigger language plpgsql as $$
declare v_pref record;
begin
  select unsubscribed, paused_until, frequency into v_pref
  from public.email_prefs where account_id=new.account_id and lead_id=new.lead_id;

  if exists (select 1 from public.leads where id=new.lead_id and unsubscribed)
     or (v_pref.unsubscribed is true)
     or (v_pref.frequency = 'none')
     or (v_pref.paused_until is not null and v_pref.paused_until >= current_date)
  then
    -- Handle both 'status' and 'state' columns
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'send_queue' and column_name = 'status') then
      new.status := 'cancelled';
    end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'send_queue' and column_name = 'state') then
      new.state := 'canceled';
    end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'send_queue' and column_name = 'suppressed') then
      new.suppressed := true;
    end if;
  end if;

  return new;
end$$;

-- Check if send_queue has status and suppressed columns, add if needed
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'send_queue') then
    alter table public.send_queue add column if not exists status text;
    alter table public.send_queue add column if not exists suppressed boolean default false;
  end if;
end $$;

drop trigger if exists trg_block_prefs_sends on public.send_queue;
create trigger trg_block_prefs_sends
before insert on public.send_queue
for each row execute function public.block_prefs_sends();


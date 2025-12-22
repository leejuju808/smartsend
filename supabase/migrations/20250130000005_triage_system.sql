-- Block 122 — Human-in-the-Loop Triage (batched review + one-click fixes + bulk release)
-- Idempotent migration for triage queue, assignments, and helper functions

-- A) Triage sessions (optional; for auditing reviewer actions)
create table if not exists public.triage_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  reviewer_id uuid not null,                       -- auth.uid()
  account_id uuid not null references public.accounts(id) on delete cascade,
  note text
);

create index if not exists idx_triage_sessions_reviewer on public.triage_sessions(reviewer_id, created_at desc);
create index if not exists idx_triage_sessions_account on public.triage_sessions(account_id, created_at desc);

-- B) Triage items (mirror held rows with reviewer state)
create table if not exists public.triage_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  queue_id uuid not null references public.send_queue(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,

  status text not null check (status in ('open','in_review','fixed','released','dismissed')),
  reasons text[] not null default '{}',

  claimed_by uuid,               -- reviewer user_id
  claimed_at timestamptz,

  fix_actions jsonb not null default '[]'::jsonb,  -- array of action objects applied
  resolution_note text
);

create unique index if not exists uniq_triage_queue on public.triage_items(queue_id);
create index if not exists idx_triage_items_status on public.triage_items(status, created_at);
create index if not exists idx_triage_items_account on public.triage_items(account_id, status);
create index if not exists idx_triage_items_claimed on public.triage_items(claimed_by, status) where claimed_by is not null;

-- Trigger to update updated_at
create or replace function public.set_triage_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_triage_items_updated_at on public.triage_items;
create trigger trg_triage_items_updated_at
before update on public.triage_items
for each row execute function public.set_triage_updated_at();

-- C) Auto enqueue trigger when a row becomes held_preflight
create or replace function public.enqueue_triage() returns trigger
language plpgsql as $$
begin
  if new.status = 'held_preflight' then
    insert into public.triage_items(queue_id, account_id, status, reasons)
    values (new.id, new.account_id, 'open', coalesce(new.preflight_reasons,'{}'))
    on conflict (queue_id) do update
      set updated_at = now(), status = 'open', reasons = excluded.reasons;
  end if;
  return new;
end $$;

drop trigger if exists trg_queue_to_triage on public.send_queue;
create trigger trg_queue_to_triage
after insert or update of status, preflight_reasons on public.send_queue
for each row execute function public.enqueue_triage();

-- D) Simple RLS: reviewers can see their account triage
alter table public.triage_items enable row level security;
alter table public.triage_sessions enable row level security;

-- Ensure accounts table has owner_id (add if missing)
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
      and table_name = 'accounts' 
      and column_name = 'owner_id'
  ) then
    -- Try to add owner_id, but if accounts doesn't exist or has different structure, handle gracefully
    begin
      alter table public.accounts add column owner_id uuid references auth.users(id) on delete cascade;
    exception when others then
      -- If accounts table doesn't exist or column can't be added, we'll use alternative RLS
      null;
    end;
  end if;
end $$;

-- RLS policies for triage_items
do $$ 
begin
  -- Drop existing policies if they exist
  drop policy if exists triage_select on public.triage_items;
  drop policy if exists triage_update on public.triage_items;
  drop policy if exists triage_insert on public.triage_items;
  
  -- Check if accounts has owner_id column
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
      and table_name = 'accounts' 
      and column_name = 'owner_id'
  ) then
    -- Use owner_id-based RLS
    create policy triage_select on public.triage_items
    for select using (
      account_id in (select id from public.accounts where owner_id = auth.uid())
      or claimed_by = auth.uid()
    );
    
    create policy triage_update on public.triage_items
    for update using (
      account_id in (select id from public.accounts where owner_id = auth.uid())
      or claimed_by = auth.uid()
    );
    
    create policy triage_insert on public.triage_items
    for insert with check (
      account_id in (select id from public.accounts where owner_id = auth.uid())
    );
  else
    -- Fallback: allow if user has access to the account (via send_queue or other means)
    -- This is a more permissive policy - adjust based on your actual auth model
    create policy triage_select on public.triage_items
    for select using (
      exists (
        select 1 from public.send_queue sq
        where sq.id = triage_items.queue_id
        and sq.account_id::text = auth.uid()::text
      )
      or claimed_by = auth.uid()
    );
    
    create policy triage_update on public.triage_items
    for update using (
      exists (
        select 1 from public.send_queue sq
        where sq.id = triage_items.queue_id
        and sq.account_id::text = auth.uid()::text
      )
      or claimed_by = auth.uid()
    );
    
    create policy triage_insert on public.triage_items
    for insert with check (true); -- Trigger handles insertion
  end if;
end $$;

-- RLS policies for triage_sessions
do $$
begin
  drop policy if exists triage_sessions_select on public.triage_sessions;
  drop policy if exists triage_sessions_insert on public.triage_sessions;
  
  create policy triage_sessions_select on public.triage_sessions
  for select using (reviewer_id = auth.uid());
  
  create policy triage_sessions_insert on public.triage_sessions
  for insert with check (reviewer_id = auth.uid());
end $$;

-- E) Helper RPCs

-- Claim items for review
create or replace function public.triage_claim(p_queue_ids uuid[])
returns void language plpgsql security definer as $$
declare uid uuid := auth.uid(); rec uuid;
begin
  foreach rec in array p_queue_ids loop
    update public.triage_items
    set status = 'in_review', claimed_by = uid, claimed_at = now(), updated_at = now()
    where queue_id = rec and (claimed_by is null or claimed_by = uid);
  end loop;
end $$;

-- Release items back to pending
-- Note: Setting status='pending' makes items eligible for dispatcher claimers (Block 112/114/115)
-- Dispatchers only claim rows with status='pending', so held_preflight rows are automatically ignored
create or replace function public.triage_release(p_queue_ids uuid[], p_note text default null)
returns void language plpgsql security definer as $$
declare rec uuid;
begin
  foreach rec in array p_queue_ids loop
    -- 1) move queue item back to pending (eligible for dispatcher)
    update public.send_queue
      set status='pending', released_at = now()
    where id = rec and status='held_preflight';

    -- 2) mark triage item
    update public.triage_items
      set status='released', resolution_note = p_note, updated_at = now()
    where queue_id = rec;
  end loop;
end $$;

-- Dismiss items (keep held)
create or replace function public.triage_dismiss(p_queue_ids uuid[], p_note text default null)
returns void language plpgsql security definer as $$
declare rec uuid;
begin
  foreach rec in array p_queue_ids loop
    update public.triage_items
      set status='dismissed', resolution_note = p_note, updated_at = now()
    where queue_id = rec;
  end loop;
end $$;

-- Take quick fixes in one shot (allowlist/link blocklist/warmup toggle) and keep held
create or replace function public.triage_fix(
  p_account uuid,
  p_action text,                    -- 'allow_link_domain' | 'block_link_domain' | 'add_spam_phrase' | 'disable_warmup' | 'enable_warmup'
  p_value text,                     -- domain/phrase/empty
  p_queue_ids uuid[]
) returns void language plpgsql security definer as $$
declare rec uuid;
begin
  if p_action in ('allow_link_domain','block_link_domain','add_spam_phrase') then
    insert into public.preflight_rules(account_id, kind, value)
    values (p_account, case
        when p_action='allow_link_domain' then 'allow_link_domain'
        when p_action='block_link_domain' then 'block_link_domain'
        else 'spam_phrase' end, lower(p_value))
    on conflict do nothing;
  elsif p_action in ('disable_warmup','enable_warmup') then
    update public.account_warmup_profiles
    set enabled = (p_action='enable_warmup')
    where account_id = p_account;
  end if;

  foreach rec in array p_queue_ids loop
    update public.triage_items
      set fix_actions = coalesce(fix_actions,'[]'::jsonb) || jsonb_build_object(
        'action', p_action, 'value', p_value, 'at', now()
      ),
      updated_at = now(),
      status = 'fixed'
    where queue_id = rec;
  end loop;
end $$;

-- Optional: Release and re-check (auto-re-evaluate on release)
create or replace function public.triage_release_and_recheck(p_queue_ids uuid[], p_note text default null)
returns void language plpgsql security definer as $$
declare rec uuid; v_decision preflight_decision;
begin
  foreach rec in array p_queue_ids loop
    -- Re-evaluate preflight
    select public.preflight_apply(rec) into v_decision;
    
    if v_decision = 'allow' then
      -- If now allowed, move to pending
      update public.send_queue set status='pending', released_at = now() where id = rec;
    end if;
    
    -- Mark triage item as released
    update public.triage_items 
    set status='released', resolution_note = p_note, updated_at = now() 
    where queue_id = rec;
  end loop;
end $$;

-- Grant execute permissions
grant execute on function public.triage_claim(uuid[]) to authenticated;
grant execute on function public.triage_release(uuid[], text) to authenticated;
grant execute on function public.triage_dismiss(uuid[], text) to authenticated;
grant execute on function public.triage_fix(uuid, text, text, uuid[]) to authenticated;
grant execute on function public.triage_release_and_recheck(uuid[], text) to authenticated;

-- F) Quality-of-life: Auto-unclaim items if in_review > 2 hours without activity
-- This can be run via cron or pg_cron
create or replace function public.triage_auto_unclaim()
returns int language plpgsql security definer as $$
declare
  v_count int;
begin
  update public.triage_items
  set status = 'open', claimed_by = null, claimed_at = null, updated_at = now()
  where status = 'in_review'
    and claimed_at < now() - interval '2 hours';
  
  get diagnostics v_count = row_count;
  return v_count;
end $$;

grant execute on function public.triage_auto_unclaim() to authenticated;

-- G) Metrics hooks: triage activity logs for dashboard counts
create table if not exists public.triage_activity_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  triage_item_id uuid references public.triage_items(id) on delete set null,
  account_id uuid not null references public.accounts(id) on delete cascade,
  reviewer_id uuid not null,
  action text not null check (action in ('claimed','released','dismissed','fixed')),
  queue_id uuid references public.send_queue(id) on delete set null
);

create index if not exists idx_triage_activity_account on public.triage_activity_logs(account_id, created_at);
create index if not exists idx_triage_activity_reviewer on public.triage_activity_logs(reviewer_id, created_at);
create index if not exists idx_triage_activity_action on public.triage_activity_logs(action, created_at);

-- Trigger to log triage activities
create or replace function public.log_triage_activity()
returns trigger language plpgsql as $$
begin
  if (old.status is distinct from new.status) or (old.claimed_by is distinct from new.claimed_by) then
    insert into public.triage_activity_logs(triage_item_id, account_id, reviewer_id, action, queue_id)
    values (
      new.id,
      new.account_id,
      coalesce(new.claimed_by, old.claimed_by, auth.uid()),
      case
        when new.status = 'in_review' and old.status = 'open' then 'claimed'
        when new.status = 'released' then 'released'
        when new.status = 'dismissed' then 'dismissed'
        when new.status = 'fixed' then 'fixed'
        else 'claimed'
      end,
      new.queue_id
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_log_triage_activity on public.triage_items;
create trigger trg_log_triage_activity
after update on public.triage_items
for each row execute function public.log_triage_activity();

-- Enable RLS on activity logs
alter table public.triage_activity_logs enable row level security;

create policy triage_activity_select on public.triage_activity_logs
for select using (
  account_id in (
    select id from public.accounts 
    where owner_id = auth.uid()
  )
  or reviewer_id = auth.uid()
);


-- Seat locks, guards, and webhook helpers (idempotent)
-- Ensure account seats reflect lock state and centralize guardrails for invites and sending.

-- A) Extend account_seats with lock metadata ---------------------------------
alter table public.account_seats
  add column if not exists over_limit boolean not null default false,
  add column if not exists locked_at timestamptz;


-- B) Central account lock table ----------------------------------------------
create table if not exists public.account_locks (
  account_id uuid primary key,
  sending_locked boolean not null default false,
  invites_locked boolean not null default false,
  reason text,
  updated_at timestamptz not null default now()
);


-- C) Helper to recompute lock state from seats --------------------------------
create or replace function public.apply_seat_lock(p_account uuid)
returns void
language plpgsql
as $$
declare
  v_used int;
  v_purchased int;
  v_over boolean;
begin
  select seats_in_use, seats_purchased
    into v_used, v_purchased
  from public.account_seats
  where account_id = p_account;

  if v_used is null and v_purchased is null then
    -- No seat record to evaluate; nothing to do.
    return;
  end if;

  v_over := coalesce(v_used, 0) > coalesce(v_purchased, 0);

  update public.account_seats
     set over_limit = v_over,
         locked_at = case when v_over then now() else null end,
         updated_at = now()
   where account_id = p_account;

  insert into public.account_locks(account_id, sending_locked, invites_locked, reason, updated_at)
  values (
    p_account,
    v_over,
    v_over,
    case when v_over then 'Over seat limit' else null end,
    now()
  )
  on conflict (account_id) do update
    set sending_locked = excluded.sending_locked,
        invites_locked = excluded.invites_locked,
        reason = excluded.reason,
        updated_at = now();
end;
$$;


-- D) Member change hook ------------------------------------------------------
create or replace function public.on_member_change_lock()
returns trigger
language plpgsql
as $$
declare
  v_account uuid;
begin
  v_account := coalesce(new.account_id, old.account_id);
  if v_account is null then
    return coalesce(new, old);
  end if;

  perform public.recompute_seats(v_account);
  perform public.apply_seat_lock(v_account);

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_member_after on public.team_members;
create trigger trg_member_after
after insert or delete or update on public.team_members
for each row
execute function public.on_member_change_lock();


-- E) Invite guard -------------------------------------------------------------
create or replace function public.guard_invites()
returns trigger
language plpgsql
as $$
declare
  v_locked boolean;
  v_reason text;
begin
  select coalesce(l.invites_locked, false), l.reason
    into v_locked, v_reason
  from public.account_locks l
  where l.account_id = new.account_id;

  if v_locked then
    raise exception 'Invites locked: %', coalesce(v_reason, 'Over seat limit')
      using errcode = 'SEATLOCK';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_invites on public.team_invites;
create trigger trg_guard_invites
before insert on public.team_invites
for each row
execute function public.guard_invites();


-- F) Sending guard ------------------------------------------------------------
create or replace function public.guard_sending_lock()
returns trigger
language plpgsql
as $$
declare
  v_account uuid;
  v_locked boolean;
  v_reason text;
begin
  select c.account_id
    into v_account
  from public.campaigns c
  where c.id = new.campaign_id;

  if v_account is null then
    return new;
  end if;

  select coalesce(l.sending_locked, false), l.reason
    into v_locked, v_reason
  from public.account_locks l
  where l.account_id = v_account;

  if v_locked then
    new.status := 'skipped';
    new.last_error := coalesce(v_reason, 'seat_over_limit');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_sending_lock on public.send_queue;
create trigger trg_guard_sending_lock
before insert on public.send_queue
for each row
execute function public.guard_sending_lock();





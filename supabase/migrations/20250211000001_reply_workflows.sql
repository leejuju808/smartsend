-- Reply Composer Enhancements: drafts, AI suggestions, scheduled bumps

-- A) Reply drafts (autosave-friendly)
create table if not exists public.reply_drafts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  account_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null references public.reply_threads(id) on delete cascade,
  identity_id uuid references public.send_identities(id) on delete set null,
  subject text,
  html_body text not null default '',
  autosaved boolean not null default true
);

alter table public.reply_drafts enable row level security;

do $$
begin
  create policy if not exists reply_drafts_rw on public.reply_drafts
    for all using (account_id = auth.uid())
    with check (account_id = auth.uid());
exception when duplicate_object then
  null;
end $$;


-- B) AI suggestions (retain latest 10 per account/thread)
create table if not exists public.reply_suggestions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null references public.reply_threads(id) on delete cascade,
  label text,
  variant text not null,
  subject text,
  html_body text not null,
  tokens int,
  meta jsonb not null default '{}'::jsonb
);

alter table public.reply_suggestions enable row level security;

do $$
begin
  create policy if not exists reply_suggestions_rw on public.reply_suggestions
    for all using (account_id = auth.uid())
    with check (account_id = auth.uid());
exception when duplicate_object then
  null;
end $$;


-- C) Scheduled bumps (queued follow-ups)
create table if not exists public.scheduled_bumps (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null references public.reply_threads(id) on delete cascade,
  identity_id uuid not null references public.send_identities(id) on delete restrict,
  run_at timestamptz not null,
  subject text not null,
  html_body text not null,
  status text not null default 'queued' check (status in ('queued','sent','cancelled','skipped')),
  reason text
);

create index if not exists idx_scheduled_bumps_run on public.scheduled_bumps(status, run_at);

alter table public.scheduled_bumps enable row level security;

do $$
begin
  create policy if not exists scheduled_bumps_rw on public.scheduled_bumps
    for all using (account_id = auth.uid())
    with check (account_id = auth.uid());
exception when duplicate_object then
  null;
end $$;


-- D) Helpers & triggers

-- Keep updated_at fresh on draft modifications
create or replace function public.set_reply_draft_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = coalesce(new.updated_at, now());
  if (new.updated_at = old.updated_at) then
    new.updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reply_drafts_updated_at on public.reply_drafts;
create trigger trg_reply_drafts_updated_at
  before update on public.reply_drafts
  for each row
  execute procedure public.set_reply_draft_updated_at();


-- Ensure only latest 10 suggestions persist per account/thread
create or replace function public.prune_reply_suggestions()
returns trigger
language plpgsql
as $$
begin
  delete from public.reply_suggestions rs
  where rs.account_id = new.account_id
    and rs.thread_id = new.thread_id
    and rs.id <> new.id
    and rs.id in (
      select id
      from public.reply_suggestions
      where account_id = new.account_id
        and thread_id = new.thread_id
      order by created_at desc, id desc
      offset 10
    );

  return new;
end;
$$;

drop trigger if exists trg_reply_suggestions_prune on public.reply_suggestions;
create trigger trg_reply_suggestions_prune
  after insert on public.reply_suggestions
  for each row
  execute procedure public.prune_reply_suggestions();


-- Guard: skip bump if new inbound arrives just before run time
create or replace function public.should_skip_bump(p_thread uuid, p_run_at timestamptz)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.inbound_messages
    where thread_id = p_thread
      and received_at >= (p_run_at - interval '1 minute')
  );
$$;


-- Recommended bump run time helper (next business morning +30m)
create or replace function public.default_bump_time(p_thread uuid)
returns timestamptz
language plpgsql
immutable
as $$
declare
  out_ts timestamptz;
begin
  select public.next_in_recipient_window(
           now() + interval '1 day',
           coalesce(l.timezone, 'Etc/UTC'),
           jsonb_build_object('start', 9, 'end', 17),
           '["Mon","Tue","Wed","Thu","Fri"]'::jsonb
         ) + interval '30 minutes'
    into out_ts
  from public.reply_threads t
  join public.leads l on l.id = t.lead_id
  where t.id = p_thread;

  return out_ts;
end;
$$;


-- Cleanup helper: mark bumps as skipped if cancelled explicitly (no-op if policy already ensures)
create or replace function public.cancel_scheduled_bump(p_bump uuid, p_reason text default null)
returns void
language sql
as $$
  update public.scheduled_bumps
     set status = 'cancelled',
         reason = coalesce(p_reason, reason),
         created_at = created_at
   where id = p_bump;
$$;



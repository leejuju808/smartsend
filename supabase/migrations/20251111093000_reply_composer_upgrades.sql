-- Reply composer upgrades: drafts, AI suggestions, scheduled bumps

-- A) Drafts (autosave while composing or inserting suggestions)
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

create index if not exists idx_reply_drafts_thread on public.reply_drafts(account_id, thread_id, updated_at desc);

drop trigger if exists reply_drafts_set_updated_at on public.reply_drafts;
create trigger reply_drafts_set_updated_at
before update on public.reply_drafts
for each row
execute function public.set_updated_at();

alter table public.reply_drafts enable row level security;

do $$
begin
  create policy if not exists reply_drafts_rw on public.reply_drafts
    for all
    using (account_id = auth.uid())
    with check (account_id = auth.uid());
exception
  when duplicate_object then null;
end $$;


-- B) AI suggestions per thread (retain latest 10 variants)
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

create index if not exists idx_reply_suggestions_thread_created on public.reply_suggestions(thread_id, created_at desc);

create or replace function public.prune_reply_suggestions()
returns trigger
language plpgsql
as $$
begin
  delete from public.reply_suggestions rs
  where rs.thread_id = new.thread_id
    and rs.id <> new.id
    and rs.id in (
      select id
      from public.reply_suggestions
      where thread_id = new.thread_id
      order by created_at desc, id desc
      offset 10
    );
  return new;
end
$$;

drop trigger if exists reply_suggestions_prune on public.reply_suggestions;
create trigger reply_suggestions_prune
after insert on public.reply_suggestions
for each row
execute function public.prune_reply_suggestions();

alter table public.reply_suggestions enable row level security;

do $$
begin
  create policy if not exists reply_suggestions_rw on public.reply_suggestions
    for all
    using (account_id = auth.uid())
    with check (account_id = auth.uid());
exception
  when duplicate_object then null;
end $$;


-- C) Scheduled follow-up bumps (thread-safe; processed by dispatcher)
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
create index if not exists idx_scheduled_bumps_thread on public.scheduled_bumps(thread_id, status, run_at);

alter table public.scheduled_bumps enable row level security;

do $$
begin
  create policy if not exists scheduled_bumps_rw on public.scheduled_bumps
    for all
    using (account_id = auth.uid())
    with check (account_id = auth.uid());
exception
  when duplicate_object then null;
end $$;


-- D) Guard: skip if thread receives new inbound near run time
create or replace function public.should_skip_bump(p_thread uuid, p_run_at timestamptz)
returns boolean
language sql
stable
as $$
  select exists(
    select 1
    from public.inbound_messages im
    where im.thread_id = p_thread
      and im.received_at >= (p_run_at - interval '1 minute')
  );
$$;


-- E) Business-hour default for scheduling bumps
create or replace function public.default_bump_time(p_thread uuid)
returns timestamptz
language plpgsql
immutable
as $$
declare
  v_thread record;
begin
  select t.id, l.timezone
  into v_thread
  from public.reply_threads t
  join public.leads l on l.id = t.lead_id
  where t.id = p_thread;

  if not found then
    return public.next_in_recipient_window(
      now() + interval '1 day',
      'Etc/UTC',
      jsonb_build_object('start', 9, 'end', 17),
      '["Mon","Tue","Wed","Thu","Fri"]'::jsonb
    ) + interval '30 minutes';
  end if;

  return public.next_in_recipient_window(
    now() + interval '1 day',
    coalesce(v_thread.timezone, 'Etc/UTC'),
    jsonb_build_object('start', 9, 'end', 17),
    '["Mon","Tue","Wed","Thu","Fri"]'::jsonb
  ) + interval '30 minutes';
end
$$;



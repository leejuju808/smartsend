-- Calendar integrations, meeting holds, and booking workflow

create table if not exists public.calendars (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google','microsoft')),
  account_email text not null,
  tz text not null default 'America/Los_Angeles',
  access_token text not null,
  refresh_token text not null,
  token_expires_at timestamptz not null,
  is_primary boolean not null default false,
  unique (user_id, account_email)
);

alter table if exists public.calendars enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'calendars' and policyname = 'calendars_owner_select') then
    create policy calendars_owner_select on public.calendars
      for select
      using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'calendars' and policyname = 'calendars_owner_modify') then
    create policy calendars_owner_modify on public.calendars
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end;
$$;

create table if not exists public.meeting_prefs (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  duration_min int not null default 30,
  tz text,
  workdays int[] not null default '{1,2,3,4,5}',
  start_hour int not null default 9,
  end_hour int not null default 17,
  buffer_min int not null default 15
);

create table if not exists public.meeting_holds (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  calendar_id uuid not null references public.calendars(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  provider_event_id text,
  status text not null default 'hold',
  expires_at timestamptz not null,
  unique (calendar_id, provider_event_id)
);

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  hold_id uuid references public.meeting_holds(id) on delete set null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  attendees jsonb not null,
  location text,
  provider text not null,
  provider_event_id text not null
);

create or replace view public.v_thread_is_scheduled as
select
  t.id as thread_id,
  exists(select 1 from public.meetings m where m.thread_id = t.id) as scheduled
from public.inbox_threads t;

create or replace function public.after_meeting_roi()
returns trigger
language plpgsql
as $$
begin
  insert into public.campaign_roi (campaign_id, thread_id, event_type, amount, meta)
  select t.campaign_id, new.thread_id, 'booking', null,
         jsonb_build_object('provider', new.provider, 'start', new.start_at)
  from public.inbox_threads t
  where t.id = new.thread_id;

  update public.sla_timers
    set resolved_at = now()
  where thread_id = new.thread_id
    and resolved_at is null;

  return new;
end;
$$;

drop trigger if exists trg_meeting_roi on public.meetings;

create trigger trg_meeting_roi
after insert on public.meetings
for each row execute function public.after_meeting_roi();

create or replace function public.expire_holds()
returns void
language sql
as $$
  update public.meeting_holds
     set status = 'expired'
   where status = 'hold'
     and expires_at < now();
$$;

create extension if not exists pg_cron with schema cron;

select cron.unschedule('expire-holds-15m') where exists (
  select 1 from cron.job where jobname = 'expire-holds-15m'
);

select cron.schedule(
  'expire-holds-15m',
  '*/15 * * * *',
  $$select public.expire_holds();$$
);


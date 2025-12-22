++ 0
-- Block 76 – Meeting Bridge calendar push + helpers

-- 1) Enum + intent columns for calendar push
do $$
begin
  create type calendar_provider as enum ('google', 'outlook', 'none');
exception
  when duplicate_object then null;
end
$$;

alter table if exists public.meeting_intents
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists account_id uuid references public.accounts(id) on delete set null,
  add column if not exists start_ts timestamptz,
  add column if not exists end_ts timestamptz,
  add column if not exists organizer_name text,
  add column if not exists organizer_email text,
  add column if not exists timezone text,
  add column if not exists location_url text,
  add column if not exists location_label text,
  add column if not exists ics_uid text,
  add column if not exists ics_text text,
  add column if not exists push_provider calendar_provider default 'none',
  add column if not exists push_status text default 'pending' check (push_status in ('pending', 'drafted', 'sent', 'failed')),
  add column if not exists external_event_id text,
  add column if not exists pushed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists message_id uuid references public.inbox_messages(id) on delete set null,
  add column if not exists raw jsonb default '{}'::jsonb;

update public.meeting_intents
set id = gen_random_uuid()
where id is null;

update public.meeting_intents
set message_id = coalesce(message_id, source_message_id)
where message_id is null;

alter table if exists public.meeting_intents
  alter column id set not null,
  alter column updated_at set default now();

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints tc
    where tc.table_schema = 'public'
      and tc.table_name = 'meeting_intents'
      and tc.constraint_type = 'PRIMARY KEY'
      and tc.constraint_name = 'meeting_intents_pkey'
  ) then
    execute 'alter table public.meeting_intents drop constraint meeting_intents_pkey';
  end if;
exception
  when undefined_table then null;
end
$$;

alter table if exists public.meeting_intents
  add constraint meeting_intents_pkey primary key (id);

alter table if exists public.meeting_intents
  add constraint meeting_intents_thread_unique unique (thread_id);

create index if not exists idx_meeting_intents_account on public.meeting_intents(account_id);
create index if not exists idx_meeting_intents_push_status on public.meeting_intents(push_status);
create index if not exists idx_meeting_intents_pushed_at on public.meeting_intents(pushed_at);

create or replace function public.fn_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_meeting_intents on public.meeting_intents;

create trigger trg_touch_meeting_intents
before update on public.meeting_intents
for each row execute function public.fn_touch_updated_at();

-- 2) OAuth connections table; create if missing (minimal)
create table if not exists public.account_integrations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  provider calendar_provider not null,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz
);

create index if not exists idx_acc_int_account on public.account_integrations(account_id);

create or replace function public.fn_touch_account_integrations()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_account_integrations on public.account_integrations;

create trigger trg_touch_account_integrations
before update on public.account_integrations
for each row execute function public.fn_touch_account_integrations();

-- 3) ICS builder: returns single text blob
create or replace function public.fn_build_ics(
  p_uid text,
  p_summary text,
  p_dtstart timestamptz,
  p_dtend timestamptz,
  p_organizer_name text,
  p_organizer_email text,
  p_location_url text,
  p_description text
) returns text
language plpgsql
as $$
declare
  v text;
begin
  v := 'BEGIN:VCALENDAR'||E'\n'||
       'VERSION:2.0'||E'\n'||
       'PRODID:-//SmartSend//MeetingBridge//EN'||E'\n'||
       'BEGIN:VEVENT'||E'\n'||
       'UID:'||coalesce(p_uid, gen_random_uuid()::text)||E'\n'||
       'DTSTAMP:'||to_char(now() at time zone 'UTC','YYYYMMDD"T"HH24MISS"Z"')||E'\n'||
       'DTSTART:'||to_char(p_dtstart at time zone 'UTC','YYYYMMDD"T"HH24MISS"Z"')||E'\n'||
       case when p_dtend is not null then 'DTEND:'||to_char(p_dtend at time zone 'UTC','YYYYMMDD"T"HH24MISS"Z"')||E'\n' else '' end||
       case when p_summary is not null then 'SUMMARY:'||replace(p_summary,E'\n',' ')||E'\n' else 'SUMMARY:Meeting'||E'\n' end||
       case when p_location_url is not null then 'LOCATION:'||replace(p_location_url,':','\\:')||E'\n' else '' end||
       case when p_description is not null then 'DESCRIPTION:'||replace(p_description,E'\n',' ')||E'\n' else '' end||
       case when p_organizer_email is not null then 'ORGANIZER;CN='||coalesce(p_organizer_name,'')||':mailto:'||p_organizer_email||E'\n' else '' end||
       'END:VEVENT'||E'\n'||
       'END:VCALENDAR';
  return v;
end
$$;

-- 4) RPC: finalize intent → generate ICS and set provider
create or replace function public.rpc_finalize_meeting_intent(
  p_intent_id uuid,
  p_summary text default 'Intro call',
  p_description text default null,
  p_provider calendar_provider default 'none'
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  v_uid text;
  v_ics text;
  v_start timestamptz;
  v_end timestamptz;
begin
  select *
    into v
  from public.meeting_intents
  where id = p_intent_id;

  if not found then
    raise exception 'meeting_intent not found';
  end if;

  v_start := coalesce(v.start_ts, v.window_start);
  v_end := coalesce(v.end_ts, v.window_end);

  if v_start is null then
    raise exception 'meeting_intent start_ts missing';
  end if;

  v_uid := coalesce(v.ics_uid, gen_random_uuid()::text);
  v_ics := public.fn_build_ics(
    v_uid,
    p_summary,
    v_start,
    v_end,
    v.organizer_name,
    v.organizer_email,
    coalesce(v.location_url, v.location_label),
    coalesce(p_description, 'Created via SmartSend Meeting Bridge')
  );

  update public.meeting_intents
     set ics_uid = v_uid,
         ics_text = v_ics,
         push_provider = p_provider,
         push_status = case when push_status = 'sent' then 'sent' else 'pending' end,
         updated_at = now()
   where id = p_intent_id;
end
$$;

grant execute on function public.rpc_finalize_meeting_intent(uuid, text, text, calendar_provider) to authenticated, service_role;

-- 5) Simple view for pushable intents
create or replace view public.v_meeting_intents_pushable as
select mi.*,
       ai.provider as connected_provider
from public.meeting_intents mi
left join lateral (
  select provider
  from public.account_integrations ai
  where ai.account_id = mi.account_id
  order by ai.updated_at desc
  limit 1
) ai on true
where mi.ics_text is not null
  and coalesce(mi.push_status, 'pending') in ('pending', 'failed');

comment on view public.v_meeting_intents_pushable is 'Meeting intents ready to be pushed to calendar providers';

-- TODO: Add RLS policies matching existing account-based access patterns



-- SLA policies, timers, audit trail, and automation

create table if not exists public.sla_policies (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  question_hours int not null default 2,
  positive_hours int not null default 2,
  neutral_hours int not null default 8,
  negative_hours int not null default 0,
  ooo_hours int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.sla_timers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  label text not null,
  due_at timestamptz not null,
  resolved_at timestamptz,
  escalated_at timestamptz,
  assigned_to uuid references auth.users(id),
  unique(thread_id)
);

create index if not exists sla_timers_due_idx on public.sla_timers (due_at) where resolved_at is null;
create index if not exists sla_timers_campaign_idx on public.sla_timers (campaign_id, resolved_at);

create table if not exists public.assign_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  actor uuid references auth.users(id),
  prev_user uuid references auth.users(id),
  next_user uuid references auth.users(id),
  reason text
);

create index if not exists assign_events_thread_idx on public.assign_events (thread_id, created_at desc);
create index if not exists assign_events_campaign_idx on public.assign_events (campaign_id, created_at desc);

create or replace view public.v_inbox_needs_response as
select
  t.id as thread_id,
  t.campaign_id,
  t.reply_type as label,
  t.assigned_to,
  s.due_at,
  (now() >= s.due_at and s.resolved_at is null) as is_overdue
from public.inbox_threads t
join public.sla_timers s on s.thread_id = t.id
where s.resolved_at is null;

create or replace view public.v_sla_status as
select
  campaign_id,
  count(*) filter (where resolved_at is null) as open,
  count(*) filter (where resolved_at is null and now() < due_at) as within_sla,
  count(*) filter (where resolved_at is null and now() >= due_at) as overdue,
  percentile_disc(0.5) within group (order by (extract(epoch from (resolved_at - created_at)) / 60.0))
    filter (where resolved_at is not null) as p50_resolve_min
from public.sla_timers
group by campaign_id;

create or replace function public.sla_hours_for(p_campaign uuid, p_label text)
returns int
language sql
stable
as $$
  select coalesce((
    select case lower(p_label)
      when 'question' then question_hours
      when 'positive' then positive_hours
      when 'neutral' then neutral_hours
      when 'negative' then negative_hours
      when 'ooo' then ooo_hours
      else 0 end
    from public.sla_policies
    where campaign_id = p_campaign
  ), 0);
$$;

create or replace function public.pick_assignee(p_campaign uuid)
returns uuid
language sql
stable
as $$
  with candidates as (
    select m.user_id
    from public.campaign_members m
    where m.campaign_id = p_campaign
      and m.role in ('owner', 'editor')
    order by m.created_at
  ),
  stats as (
    select count(*)::int as total from candidates
  ),
  assignments as (
    select coalesce(count(*)::int, 0) as taken
    from public.assign_events e
    where e.campaign_id = p_campaign
  )
  select user_id
  from candidates
  offset (
    select case when stats.total = 0 then 0 else assignments.taken % stats.total end
    from stats, assignments
  )
  limit 1;
$$;

create or replace function public.start_sla_if_needed()
returns trigger
language plpgsql
as $$
declare
  hrs int;
  assignee uuid;
  due timestamptz;
begin
  if new.reply_type is null then
    return new;
  end if;

  if new.reply_type not in ('question', 'positive', 'neutral') then
    return new;
  end if;

  select public.sla_hours_for(new.campaign_id, new.reply_type) into hrs;
  if coalesce(hrs, 0) = 0 then
    return new;
  end if;

  if new.assigned_to is null then
    select public.pick_assignee(new.campaign_id) into assignee;
    if assignee is not null then
      update public.inbox_threads set assigned_to = assignee where id = new.id;
      insert into public.assign_events(thread_id, campaign_id, actor, prev_user, next_user, reason)
      values (new.id, new.campaign_id, auth.uid(), null, assignee, 'auto_route');
    end if;
  else
    assignee := new.assigned_to;
  end if;

  due := now() + (hrs || ' hours')::interval;

  insert into public.sla_timers(thread_id, campaign_id, label, due_at, assigned_to)
  values (new.id, new.campaign_id, new.reply_type, due, assignee)
  on conflict (thread_id) do update
    set label = excluded.label,
        due_at = excluded.due_at,
        assigned_to = coalesce(excluded.assigned_to, public.sla_timers.assigned_to);

  return new;
end;
$$;

drop trigger if exists trg_start_sla_on_label on public.inbox_threads;
create trigger trg_start_sla_on_label
after update of reply_type on public.inbox_threads
for each row
execute function public.start_sla_if_needed();

create or replace function public.resolve_sla_on_replied()
returns trigger
language plpgsql
as $$
begin
  update public.sla_timers
     set resolved_at = now()
   where thread_id = new.thread_id
     and resolved_at is null;
  return new;
end;
$$;

drop trigger if exists trg_resolve_on_reply on public.inbox_messages;
create trigger trg_resolve_on_reply
after insert on public.inbox_messages
for each row
when (new.direction = 'outbound')
execute function public.resolve_sla_on_replied();

create or replace function public.sla_escalate_tick()
returns void
language plpgsql
as $$
declare
  rec record;
  backup uuid;
begin
  for rec in
    select s.*, t.campaign_id
    from public.sla_timers s
    join public.inbox_threads t on t.id = s.thread_id
    where s.resolved_at is null
      and s.escalated_at is null
      and now() >= s.due_at
  loop
    update public.sla_timers
       set escalated_at = now()
     where id = rec.id;

    select m.user_id
      into backup
      from public.campaign_members m
     where m.campaign_id = rec.campaign_id
       and m.role = 'owner'
     order by m.created_at
     limit 1;

    if backup is not null and rec.assigned_to is distinct from backup then
      update public.inbox_threads
         set assigned_to = backup
       where id = rec.thread_id;

      insert into public.assign_events(thread_id, campaign_id, actor, prev_user, next_user, reason)
      values (rec.thread_id, rec.campaign_id, null, rec.assigned_to, backup, 'escalate_overdue');
    end if;
  end loop;
end;
$$;

select cron.unschedule('sla-escalate-5m');
select cron.schedule(
  'sla-escalate-5m',
  '*/5 * * * *',
  $$select public.sla_escalate_tick();$$
);









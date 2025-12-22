-- A) User preferences (remember inbox filters)
create table if not exists public.user_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now(),
  inbox_filters jsonb not null default '{}'::jsonb
);

create or replace function public.tg_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

drop trigger if exists trg_user_prefs_touch on public.user_prefs;

create trigger trg_user_prefs_touch
before update on public.user_prefs
for each row
execute function public.tg_touch_updated_at();

-- B) Aging helper (minutes since last inbound)
create or replace function public.thread_minutes_since_inbound(p_thread uuid)
returns int
language sql
stable
as $$
  select coalesce(extract(epoch from (now() - t.last_inbound_at))::int / 60, 999999)
  from public.inbox_threads t
  where t.id = p_thread
$$;

-- C) Enriched my-queue view (assigned to me + needs reply)
create or replace view public.v_my_queue as
select
  t.id,
  t.campaign_id,
  t.lead_id,
  l.name as lead_name,
  l.company as lead_company,
  l.email as lead_email,
  t.last_inbound_at,
  t.replied_at,
  t.needs_reply,
  t.assigned_to,
  (t.snoozed_until is not null and t.snoozed_until > now()) as is_snoozed,
  t.snoozed_until,
  greatest(0, extract(epoch from (now() - coalesce(t.last_inbound_at, t.created_at)))::int / 60) as age_mins,
  case
    when coalesce(t.last_inbound_at, t.created_at) > now() - interval '1 hour' then 'new'
    when coalesce(t.last_inbound_at, t.created_at) > now() - interval '4 hours' then 'warm'
    when coalesce(t.last_inbound_at, t.created_at) > now() - interval '24 hours' then 'stale'
    else 'cold'
  end as age_bucket,
  (
    select nm.ai_label
    from public.normalized_messages nm
    where nm.linked_thread_id = t.id
      and nm.direction = 'inbound'
    order by nm.sent_at desc
    limit 1
  ) as last_inbound_label
from public.inbox_threads t
join public.leads l on l.id = t.lead_id
where t.needs_reply = true
  and t.assigned_to = auth.uid()
  and (t.snoozed_until is null or t.snoozed_until <= now());

alter view public.v_my_queue set (security_invoker = on);

-- D) Tiny counts for widget headers
create or replace view public.v_my_queue_counts as
select
  auth.uid() as user_id,
  count(*) filter (where age_bucket = 'new') as c_new,
  count(*) filter (where age_bucket = 'warm') as c_warm,
  count(*) filter (where age_bucket = 'stale') as c_stale,
  count(*) filter (where age_bucket = 'cold') as c_cold,
  count(*) as c_total
from public.v_my_queue;

alter view public.v_my_queue_counts set (security_invoker = on);




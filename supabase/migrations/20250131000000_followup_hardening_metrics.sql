-- A) Safeguards: ensure send_queue + send_logs are step-aware and fast

alter table public.send_queue
  add column if not exists step_no int not null default 1,
  add column if not exists status text not null default 'queued'
    check (status in ('queued','sending','sent','failed','cancelled'));

create index if not exists idx_sq_campaign_step_due
  on public.send_queue(campaign_id, step_no, scheduled_at)
  where status in ('queued','sending');

alter table public.send_logs
  add column if not exists step_no int not null default 1,
  add column if not exists status text not null default 'sent'
    check (status in ('sent','failed','skipped'));

create index if not exists idx_logs_campaign_step on public.send_logs(campaign_id, step_no);
create index if not exists idx_logs_created_at on public.send_logs(created_at);

-- Updated-at triggers (nice to have)
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname='trg_send_logs_touch') then
    create trigger trg_send_logs_touch before update on public.send_logs
    for each row execute function public.touch_updated_at();
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname='trg_send_queue_touch') then
    create trigger trg_send_queue_touch before update on public.send_queue
    for each row execute function public.touch_updated_at();
  end if;
end $$;

-- B) RLS for campaign_steps (mirror your campaigns access model)
alter table public.campaign_steps enable row level security;

-- Owner can do everything
create policy "campaign_steps_owner_rw"
on public.campaign_steps
for all
using (
  exists (
    select 1 from public.campaigns c
    where c.id = campaign_id and c.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.campaigns c
    where c.id = campaign_id and c.user_id = auth.uid()
  )
);

-- Shared access (viewer can read; editor can write)
-- Assumes campaign_shares(role in 'viewer','editor') exists.
drop policy if exists "campaign_steps_viewer_r" on public.campaign_steps;
create policy "campaign_steps_viewer_r"
on public.campaign_steps
for select
using (
  exists (
    select 1 from public.campaigns c
    where c.id = campaign_id and c.user_id = auth.uid()
  )
  or exists (
    select 1 from public.campaign_shares s
    where s.campaign_id = campaign_id and s.user_id = auth.uid()
  )
);

drop policy if exists "campaign_steps_editor_w" on public.campaign_steps;
create policy "campaign_steps_editor_w"
on public.campaign_steps
for insert with check (
  exists (
    select 1 from public.campaigns c
    where c.id = campaign_id and c.user_id = auth.uid()
  )
  or exists (
    select 1 from public.campaign_shares s
    where s.campaign_id = campaign_id and s.user_id = auth.uid() and s.role='editor'
  )
);

drop policy if exists "campaign_steps_editor_u" on public.campaign_steps;
create policy "campaign_steps_editor_u"
on public.campaign_steps
for update using (
  exists (
    select 1 from public.campaigns c
    where c.id = campaign_id and c.user_id = auth.uid()
  )
  or exists (
    select 1 from public.campaign_shares s
    where s.campaign_id = campaign_id and s.user_id = auth.uid() and s.role='editor'
  )
)
with check (
  exists (
    select 1 from public.campaigns c
    where c.id = campaign_id and c.user_id = auth.uid()
  )
  or exists (
    select 1 from public.campaign_shares s
    where s.campaign_id = campaign_id and s.user_id = auth.uid() and s.role='editor'
  )
);

-- C) Per-step metrics view
-- Note: delivery_events uses 'kind' column, adapt user's SQL to use 'kind' instead of 'event'
create or replace view public.v_campaign_step_metrics as
with sent as (
  select campaign_id, step_no, count(*)::int as sent_cnt
  from public.send_logs
  where status = 'sent'
  group by 1,2
),
deliv as (
  select sl.campaign_id, sl.step_no, count(*)::int as delivered_cnt
  from public.delivery_events de
  join public.send_logs sl on de.log_id = sl.id
  where de.kind in ('delivered','accepted')
    and sl.step_no is not null
  group by sl.campaign_id, sl.step_no
),
open as (
  select sl.campaign_id, sl.step_no, count(distinct de.log_id)::int as opens_cnt
  from public.delivery_events de
  join public.send_logs sl on de.log_id = sl.id
  where de.kind in ('open','opened')
    and sl.step_no is not null
  group by sl.campaign_id, sl.step_no
),
click as (
  select sl.campaign_id, sl.step_no, count(distinct de.log_id)::int as clicks_cnt
  from public.delivery_events de
  join public.send_logs sl on de.log_id = sl.id
  where de.kind in ('click','clicked')
    and sl.step_no is not null
  group by sl.campaign_id, sl.step_no
),
bounce as (
  select sl.campaign_id, sl.step_no, count(*)::int as bounces_cnt
  from public.delivery_events de
  join public.send_logs sl on de.log_id = sl.id
  where de.kind in ('bounce','rejected','dropped')
    and sl.step_no is not null
  group by sl.campaign_id, sl.step_no
),
reply as (
  -- reply attributed to step: join thread-> lead and max step_no at time of reply
  select sl.campaign_id, sl.step_no, count(distinct t.id)::int as replies_cnt
  from public.inbox_threads t
  join public.send_logs sl on sl.campaign_id = t.campaign_id and sl.lead_id = t.lead_id
  where t.replied_at is not null
    and sl.created_at = (
      select max(sl2.created_at)
      from public.send_logs sl2
      where sl2.campaign_id = sl.campaign_id
        and sl2.lead_id = sl.lead_id
        and sl2.created_at <= t.replied_at
    )
    and sl.step_no is not null
  group by sl.campaign_id, sl.step_no
)
select
  coalesce(s.campaign_id, d.campaign_id, o.campaign_id, c.campaign_id, b.campaign_id, r.campaign_id) as campaign_id,
  coalesce(s.step_no, d.step_no, o.step_no, c.step_no, b.step_no, r.step_no) as step_no,
  coalesce(s.sent_cnt,0)    as sent,
  coalesce(d.delivered_cnt,0) as delivered,
  coalesce(o.opens_cnt,0)   as opens,
  coalesce(c.clicks_cnt,0)  as clicks,
  coalesce(r.replies_cnt,0) as replies,
  coalesce(b.bounces_cnt,0) as bounces
from sent s
full join deliv d using (campaign_id, step_no)
full join open  o using (campaign_id, step_no)
full join click c using (campaign_id, step_no)
full join reply r using (campaign_id, step_no)
full join bounce b using (campaign_id, step_no);

-- Add step_no to delivery_events for faster joins (optional, but helpful)
alter table public.delivery_events
  add column if not exists step_no int;

-- Update step_no from send_logs for existing rows
update public.delivery_events de
set step_no = sl.step_no
from public.send_logs sl
where de.log_id = sl.id and de.step_no is null;

create index if not exists idx_delivery_events_campaign_step
  on public.delivery_events(campaign_id, step_no);

-- D) Function to schedule follow-ups for all campaigns
create or replace function public.schedule_followups_for_all_campaigns(p_limit int default 2000)
returns int
language plpgsql
security definer
set search_path=public
as $$
declare
  queued int := 0;
  rec record;
  max_step int;
begin
  for rec in select id from public.campaigns loop
    select max(step_no) into max_step from public.campaign_steps where campaign_id = rec.id and enabled = true;
    if max_step is null or max_step < 2 then continue; end if;

    for i in 1..(max_step-1) loop
      perform 1;
      queued := queued + coalesce((
        select public.schedule_followups_for_campaign(rec.id, i, p_limit)
      ),0);
    end loop;
  end loop;
  return queued;
end $$;


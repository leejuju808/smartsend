-- A) Per-campaign step templates

create table if not exists public.campaign_steps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  step_no int not null check (step_no >= 1),
  enabled boolean not null default true,
  offset_days int not null default 2,                     -- send this step N days after the prior step was SENT
  subject_template text,
  body_html_template text,
  send_start text,                                        -- optional HH:MM
  send_end text,                                          -- optional HH:MM
  unique (campaign_id, step_no)
);

create index if not exists idx_campaign_steps_campaign on public.campaign_steps(campaign_id);
create index if not exists idx_campaign_steps_enabled on public.campaign_steps(campaign_id, enabled);

-- B) Allow multiple steps per lead within a campaign
-- Ensure step_no column exists on send_queue
do $$ begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'send_queue' and column_name = 'step_no'
  ) then
    alter table public.send_queue add column step_no int not null default 1;
  end if;
end $$;

-- Drop old unique constraint if it exists
do $$ begin
  if exists (select 1 from pg_constraint where conname='uq_sq_campaign_lead') then
    alter table public.send_queue drop constraint uq_sq_campaign_lead;
  end if;
end $$;

-- Add new unique constraint for (campaign_id, lead_id, step_no)
do $$ begin
  if not exists (select 1 from pg_constraint where conname='uq_sq_campaign_lead_step') then
    alter table public.send_queue add constraint uq_sq_campaign_lead_step unique (campaign_id, lead_id, step_no);
  end if;
end $$;

-- C) Composer chooses step template if present, else campaign defaults

create or replace function public.compose_email_by_step(p_campaign uuid, p_lead uuid, p_step int)
returns table(to_email citext, subject text, html text)
language sql stable
set search_path=public
as $$
  with s as (
    select cs.subject_template, cs.body_html_template
    from public.campaign_steps cs
    where cs.campaign_id = p_campaign and cs.step_no = p_step and cs.enabled = true
  ),
  pick as (
    select
      coalesce(s.subject_template, c.subject_template, c.subject) as subj,
      coalesce(s.body_html_template, c.body_html_template, c.body_template) as body
    from public.campaigns c
    left join s on true
    where c.id = p_campaign
  )
  select
    l.email::citext as to_email,
    coalesce(
      replace(replace(replace(replace(replace(pick.subj,
        '{{first_name}}', coalesce(l.first_name,'')),
        '{{last_name}}',  coalesce(l.last_name,'')),
        '{{company}}',    coalesce(l.company,'')),
        '{{email}}',      coalesce(l.email,'')),
        '{{domain}}',     coalesce(l.domain::text,'')),
      '[No subject]'
    ) as subject,
    coalesce(
      replace(replace(replace(replace(replace(pick.body,
        '{{first_name}}', coalesce(l.first_name,'')),
        '{{last_name}}',  coalesce(l.last_name,'')),
        '{{company}}',    coalesce(l.company,'')),
        '{{email}}',      coalesce(l.email,'')),
        '{{domain}}',     coalesce(l.domain::text,'')),
      '<p>Hello,</p>'
    ) as html
  from public.leads l, pick
  where l.id = p_lead;
$$;

-- D) Helper: compute next scheduled_at respecting window

create or replace function public.apply_send_window(p_base timestamptz, p_start text, p_end text)
returns timestamptz language plpgsql immutable as $$
declare
  sh int; sm int; eh int; em int;
  d date := (p_base at time zone 'UTC')::date;
  s timestamptz; e timestamptz; t timestamptz := p_base;
begin
  if p_start is null or p_end is null then
    return p_base;
  end if;

  sh := split_part(p_start, ':', 1)::int; sm := split_part(p_start, ':', 2)::int;
  eh := split_part(p_end,   ':', 1)::int; em := split_part(p_end,   ':', 2)::int;

  s := make_timestamptz(extract(year from p_base)::int, extract(month from p_base)::int, extract(day from p_base)::int, sh, sm, 0);
  e := make_timestamptz(extract(year from p_base)::int, extract(month from p_base)::int, extract(day from p_base)::int, eh, em, 0);

  if t < s then return s; end if;
  if t > e then return s + interval '1 day'; end if;  -- next day's window start
  return t;
end $$;

-- E) Scheduler: generate next step for non-repliers, non-opted-out, non-bounced

--    Respects enabled step, offset_days, windows, and daily cap.

create or replace function public.schedule_followups_for_campaign(
  p_campaign uuid,
  p_from_step int default 1,
  p_limit int default 500
) returns int
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid;
  v_account uuid;
  v_daily_cap int;
  v_step int := p_from_step + 1;             -- we schedule the "next" step
  v_offset int := 2;
  v_start text; v_end text;
  v_count int := 0;

  v_today_start timestamptz := date_trunc('day', now());
  v_today_end   timestamptz := v_today_start + interval '1 day' - interval '1 millisecond';
  v_sent_today int := 0;
  v_remaining int := 0;
begin
  -- campaign context
  -- Get user_id and daily_cap from campaign
  -- For account_id, try to find from connected_accounts via user_id
  select c.user_id, 
         coalesce(c.daily_cap, 40) as daily_cap
    into v_user, v_daily_cap
  from public.campaigns c
  where c.id = p_campaign;
  
  -- Get account_id from connected_accounts (mailbox) for this user
  select id into v_account
  from public.connected_accounts
  where user_id = v_user
  limit 1;

  -- step config
  select offset_days, send_start, send_end
    into v_offset, v_start, v_end
  from public.campaign_steps
  where campaign_id = p_campaign and step_no = v_step and enabled = true;

  if v_offset is null then
    -- no enabled config for next step
    return 0;
  end if;

  -- compute today's remaining cap (sent today only)
  select count(*)::int into v_sent_today
  from public.send_logs
  where campaign_id = p_campaign and status='sent'
    and created_at between v_today_start and v_today_end;

  v_remaining := greatest(0, v_daily_cap - v_sent_today);
  if v_remaining = 0 then
    return 0;
  end if;
  v_remaining := least(v_remaining, p_limit);

  -- candidates:
  -- leads that got step p_from_step sent,
  -- have NOT replied (threads.replied_at is null),
  -- are not opted out / bounced,
  -- and do NOT already have queue/log for step v_step
  with last_sent as (
    select sl.lead_id, min(sl.created_at) as first_sent, max(sl.created_at) as last_sent
    from public.send_logs sl
    where sl.campaign_id = p_campaign and sl.status='sent' and sl.step_no = p_from_step
    group by 1
  ),
  eligible as (
    select ls.lead_id, ls.last_sent
    from last_sent ls
    left join public.inbox_threads t on t.campaign_id = p_campaign and t.lead_id = ls.lead_id
    left join public.leads l on l.id = ls.lead_id
    left join lateral (
      select 1 from public.send_logs x
      where x.campaign_id = p_campaign and x.lead_id = ls.lead_id and x.step_no = v_step
      limit 1
    ) sent_next on true
    left join lateral (
      select 1 from public.send_queue q
      where q.campaign_id = p_campaign and q.lead_id = ls.lead_id and q.step_no = v_step and q.status in ('queued','sending')
      limit 1
    ) queued_next on true
    where coalesce(t.replied_at, null) is null
      and coalesce(l.opted_out_at, null) is null
      and coalesce(l.bounced_at, null) is null
      and sent_next is null
      and queued_next is null
      and (t.ooo_until is null or t.ooo_until <= now())
  ),
  plan as (
    select
      e.lead_id,
      public.apply_send_window(e.last_sent + (v_offset || ' days')::interval, v_start, v_end) as scheduled_at
    from eligible e
    order by scheduled_at asc
    limit v_remaining
  )
  insert into public.send_queue (
    user_id, campaign_id, lead_id, scheduled_at, status, step_no
  )
  select v_user, p_campaign, p.lead_id,
         greatest(p.scheduled_at, now()), 'queued', v_step
  from plan p
  on conflict (campaign_id, lead_id, step_no) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end $$;


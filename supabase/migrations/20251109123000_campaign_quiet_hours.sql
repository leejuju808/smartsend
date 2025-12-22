-- A) Campaign send policy (lead-local windows by default)

create table if not exists public.campaign_send_policy (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  days_allowed int[] not null default '{1,2,3,4,5}',
  hour_start int not null default 8 check (hour_start between 0 and 23),
  hour_end int not null default 18 check (hour_end between 1 and 24),
  block_holidays boolean not null default true,
  tz_source text not null default 'lead' check (tz_source in ('lead','campaign')),
  campaign_tz text,
  campaign_country text,
  min_gap_minutes int not null default 30 check (min_gap_minutes between 0 and 1440)
);

alter table public.campaign_send_policy enable row level security;

drop policy if exists campaign_send_policy_read on public.campaign_send_policy;
create policy campaign_send_policy_read
  on public.campaign_send_policy
  for select
  using (public.is_campaign_viewer(campaign_id));

drop policy if exists campaign_send_policy_write_ins on public.campaign_send_policy;
create policy campaign_send_policy_write_ins
  on public.campaign_send_policy
  for insert
  with check (public.is_campaign_editor(campaign_id));

drop policy if exists campaign_send_policy_write_upd on public.campaign_send_policy;
create policy campaign_send_policy_write_upd
  on public.campaign_send_policy
  for update
  using (public.is_campaign_editor(campaign_id))
  with check (public.is_campaign_editor(campaign_id));

drop policy if exists campaign_send_policy_write_del on public.campaign_send_policy;
create policy campaign_send_policy_write_del
  on public.campaign_send_policy
  for delete
  using (public.is_campaign_editor(campaign_id));


-- B) Leads: ensure tz + country columns exist for policy lookup

alter table public.leads
  add column if not exists tz text,
  add column if not exists country text;


-- C) Holidays catalog (if you don’t have it yet)

create table if not exists public.holidays (
  country text not null,
  d date not null,
  name text not null,
  observed boolean not null default true,
  primary key (country, d)
);


-- D) Utility: is a date a holiday for a country?

create or replace function public.is_holiday(p_country text, p_d date)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.holidays h
    where upper(h.country) = upper(coalesce(p_country, ''))
      and h.d = p_d
      and h.observed = true
  );
$$;


-- E) Helper: last provider send timestamp by thread

create or replace view public.v_last_provider_send as
select distinct on (o.thread_id)
  o.thread_id,
  o.sent_at
from public.outbox_requests o
where o.status = 'sent'
order by o.thread_id, o.sent_at desc;


-- F) Compute next allowed send time for a (campaign, lead)

create or replace function public.next_allowed_send_at(
  p_campaign uuid,
  p_lead uuid,
  p_from timestamptz default now()
) returns timestamptz
language plpgsql
stable
as $$
declare
  r public.campaign_send_policy%rowtype;
  v_tz text;
  v_country text;
  v_local_ts timestamp;
  v_local_candidate timestamp;
  v_local_hour int;
  v_candidate timestamptz := coalesce(p_from, now());
  v_days int[];
  v_hstart int;
  v_hend int;
  v_is_holiday boolean;
  iter int := 0;
begin
  select *
    into r
  from public.campaign_send_policy
  where campaign_id = p_campaign;

  if not found then
    r.days_allowed := array[1,2,3,4,5];
    r.hour_start := 8;
    r.hour_end := 18;
    r.block_holidays := true;
    r.tz_source := 'lead';
    r.min_gap_minutes := 30;
  end if;

  if coalesce(r.tz_source, 'lead') = 'lead' then
    select tz, country
      into v_tz, v_country
    from public.leads
    where id = p_lead;
  else
    v_tz := r.campaign_tz;
    v_country := r.campaign_country;
  end if;

  v_tz := coalesce(nullif(v_tz, ''), 'UTC');
  v_country := nullif(v_country, '');

  v_days := coalesce(r.days_allowed, array[1,2,3,4,5]);
  v_hstart := coalesce(r.hour_start, 8);
  v_hend := coalesce(r.hour_end, 18);

  loop
    exit when iter >= 60;
    iter := iter + 1;

    v_local_ts := timezone(v_tz, v_candidate);
    v_local_hour := extract(hour from v_local_ts)::int;
    v_is_holiday := coalesce(r.block_holidays, true)
      and public.is_holiday(v_country, v_local_ts::date);

    if (extract(dow from v_local_ts))::int = any (v_days)
       and v_local_hour >= v_hstart
       and v_local_hour < v_hend
       and not v_is_holiday then
      return v_candidate;
    end if;

    if v_local_hour < v_hstart then
      v_local_candidate := date_trunc('day', v_local_ts) + make_interval(hours => v_hstart);
    else
      v_local_candidate := date_trunc('day', v_local_ts + interval '1 day') + make_interval(hours => v_hstart);
    end if;

    loop
      v_candidate := v_local_candidate at time zone v_tz;
      v_local_ts := timezone(v_tz, v_candidate);
      v_is_holiday := coalesce(r.block_holidays, true)
        and public.is_holiday(v_country, v_local_ts::date);

      exit when (extract(dow from v_local_ts))::int = any (v_days)
             and not v_is_holiday;

      v_local_candidate := v_local_candidate + interval '1 day';
    end loop;
  end loop;

  return v_candidate;
end;
$$;


-- G) Throttle helper: earliest time allowed by min_gap rule

create or replace function public.enforce_min_gap(
  p_campaign uuid,
  p_thread uuid,
  p_from timestamptz default now()
) returns timestamptz
language sql
stable
as $$
  with pol as (
    select coalesce(min_gap_minutes, 30) as mins
    from public.campaign_send_policy
    where campaign_id = p_campaign
  ),
  last as (
    select sent_at
    from public.v_last_provider_send
    where thread_id = p_thread
  )
  select case
    when (select sent_at from last) is null then p_from
    else greatest(
      p_from,
      (select sent_at from last) + make_interval(mins => coalesce((select mins from pol), 30))
    )
  end;
$$;


-- H) Outbox scheduling support (run_at + quiet hours aware enqueue)

alter table public.outbox_requests
  add column if not exists run_at timestamptz not null default now();

create index if not exists idx_outbox_status_runat on public.outbox_requests(status, run_at);


create or replace function public.enqueue_outbox_for_draft(p_draft uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  v_thread uuid;
  v_campaign uuid;
  v_lead uuid;
  v_subject text;
  v_body text;
  v_to text;
  v_from text;
  v_id uuid;
  v_run_at timestamptz;
  now_utc timestamptz := now();
begin
  select d.thread_id,
         d.campaign_id,
         d.lead_id,
         d.subject,
         d.body
    into v_thread,
         v_campaign,
         v_lead,
         v_subject,
         v_body
  from public.drafts d
  where d.id = p_draft;

  if v_thread is null then
    raise exception 'draft not found';
  end if;

  if not public.is_campaign_editor(v_campaign) then
    raise exception 'not authorized';
  end if;

  select email
    into v_to
  from public.leads
  where id = v_lead;

  select coalesce(t.account_email, t.from_email)
    into v_from
  from public.inbox_threads t
  where t.id = v_thread;

  v_run_at := public.next_allowed_send_at(v_campaign, v_lead, now_utc);
  v_run_at := public.enforce_min_gap(v_campaign, v_thread, v_run_at);

  insert into public.outbox_requests (
    thread_id,
    campaign_id,
    lead_id,
    draft_id,
    subject,
    body,
    from_email,
    to_email,
    run_at
  )
  values (
    v_thread,
    v_campaign,
    v_lead,
    p_draft,
    v_subject,
    v_body,
    v_from,
    v_to,
    v_run_at
  )
  returning id into v_id;

  update public.inbox_threads
     set needs_reply = false
   where id = v_thread;

  return v_id;
end;
$$;


create or replace function public.send_draft_now(p_draft uuid)
returns uuid
language plpgsql
security definer
as $$
begin
  return public.enqueue_outbox_for_draft(p_draft);
end;
$$;






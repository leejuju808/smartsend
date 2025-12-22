-- Out-of-office routing preferences, helpers, and automation

-- A) Campaign-level preferences
alter table public.campaigns
  add column if not exists ooo_followup_days int default 7,
  add column if not exists ooo_resume_same_step boolean default true,
  add column if not exists ooo_variant_override uuid references public.campaign_step_variants(id) on delete set null;

-- B) Routing table
create table if not exists public.ooo_routes (
  thread_id uuid primary key references public.inbox_threads(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  detected_at timestamptz not null default now(),
  parsed_return_at timestamptz,
  followup_due_at timestamptz,
  step_no int,
  variant_id uuid references public.campaign_step_variants(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','scheduled','canceled','done')),
  reason text,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists idx_ooo_campaign on public.ooo_routes(campaign_id, status);
create index if not exists idx_ooo_due on public.ooo_routes(status, followup_due_at);

-- C) Helper to pick resume step
drop function if exists public.pick_resume_step(uuid, uuid, boolean);
create or replace function public.pick_resume_step(p_campaign uuid, p_lead uuid, p_same boolean)
returns int
language plpgsql
stable
as $$
declare
  s record;
begin
  select step_no
    into s
  from public.send_logs
  where campaign_id = p_campaign
    and lead_id = p_lead
  order by created_at desc
  limit 1;

  if not found or s.step_no is null then
    return 1;
  end if;

  if p_same then
    return s.step_no;
  else
    return greatest(s.step_no + 1, 1);
  end if;
end;
$$;

-- D) Helper to parse naive return dates
drop function if exists public.parse_ooo_return_at(text, text);
create or replace function public.parse_ooo_return_at(p_body text, p_tz text default 'UTC')
returns timestamptz
language plpgsql
stable
as $$
declare
  body text := coalesce(p_body,'');
  m text;
  d date;
  guess timestamptz;
begin
  m := (regexp_match(body, '(?i)(?:back|returning|out.*until)\s+(?:on\s+)?((jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2})'))[1];
  if m is not null then
    d := to_date(m, 'Mon DD');
    if d is null then
      d := to_date(m, 'FMMonth DD');
    end if;
    if d is not null then
      guess := make_date(extract(year from now())::int, extract(month from d)::int, extract(day from d)::int)::timestamptz;
      if guess < now() then
        guess := guess + interval '1 year';
      end if;
      return guess at time zone 'UTC';
    end if;
  end if;

  m := (regexp_match(body, '(?i)(?:back|returning|until|on)\s+(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)'))[1];
  if m is not null then
    begin
      d := to_date(m, 'MM/DD/YYYY');
    exception when others then
      d := null;
    end;
    if d is null then
      begin
        d := to_date(m, 'DD/MM/YYYY');
      exception when others then
        d := null;
      end;
    end if;
    if d is null then
      begin
        d := to_date(m, 'MM/DD');
      exception when others then
        d := null;
      end;
      if d is null then
        begin
          d := to_date(m, 'DD/MM');
        exception when others then
          d := null;
        end;
      end if;
      if d is not null then
        d := make_date(extract(year from now())::int, extract(month from d)::int, extract(day from d)::int);
      end if;
    end if;
    if d is not null then
      guess := d::timestamptz;
      if guess < now() then
        guess := guess + interval '1 year';
      end if;
      return guess at time zone 'UTC';
    end if;
  end if;

  m := (regexp_match(body, '(?i)(?:back|returning|until)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)'))[1];
  if m is not null then
    declare
      tgt int;
      cur int;
      days_ahead int;
      tz text := coalesce(nullif(p_tz,''),'UTC');
      base timestamptz := now() at time zone tz;
    begin
      tgt := case lower(m)
        when 'mon' then 1 when 'monday' then 1
        when 'tue' then 2 when 'tuesday' then 2
        when 'wed' then 3 when 'wednesday' then 3
        when 'thu' then 4 when 'thursday' then 4
        when 'fri' then 5 when 'friday' then 5
        when 'sat' then 6 when 'saturday' then 6
        when 'sun' then 7 when 'sunday' then 7
      end;
      cur := extract(isodow from base)::int;
      days_ahead := mod(tgt - cur + 7, 7);
      if days_ahead = 0 then
        days_ahead := 7;
      end if;
      return ((base::date + days_ahead) + time '09:00') at time zone tz;
    end;
  end if;

  return null;
end;
$$;

-- E) Compute follow-up date based on parsed or fallback schedule
drop function if exists public.compute_ooo_followup(uuid, uuid, timestamptz, timestamptz);
create or replace function public.compute_ooo_followup(
  p_campaign uuid,
  p_lead uuid,
  p_base timestamptz,
  p_parsed_return timestamptz
) returns timestamptz
language plpgsql
stable
as $$
declare
  c record;
  l record;
  start_at timestamptz;
  snapped timestamptz;
begin
  select ooo_followup_days into c
  from public.campaigns
  where id = p_campaign;

  select coalesce(l.tz, l.meta->>'tz','UTC') as tz,
         upper(coalesce(l.country, l.meta->>'country')) as country
    into l
  from public.leads l
  where l.id = p_lead;

  start_at := coalesce(p_parsed_return, p_base + make_interval(days => coalesce(c.ooo_followup_days, 7)));

  snapped := public.next_window_utc(
    start_at,
    l.tz,
    '08:00',
    '17:00',
    array[1,2,3,4,5],
    true,
    l.country
  );

  return snapped;
end;
$$;

-- F) Trigger on inbound OOO detection
drop trigger if exists trg_autoroute_ooo on public.inbox_messages;
drop function if exists public._on_ooo_autoroute();
create or replace function public._on_ooo_autoroute()
returns trigger
language plpgsql
security definer
as $$
declare
  t record;
  c record;
  step int;
  parsed timestamptz;
  due timestamptz;
  base timestamptz := now();
  body text := coalesce(new.body_text, coalesce(new.body_html, ''));
begin
  if new.direction <> 'inbound' then
    return new;
  end if;

  if coalesce(new.ai_label,'') <> 'ooo' then
    return new;
  end if;

  select th.id as thread_id,
         th.campaign_id,
         th.lead_id,
         l.tz
    into t
  from public.inbox_threads th
  join public.leads l on l.id = th.lead_id
  where th.id = new.thread_id;

  if t.thread_id is null then
    return new;
  end if;

  select c.ooo_resume_same_step,
         c.ooo_followup_days,
         c.ooo_variant_override
    into c
  from public.campaigns c
  where c.id = t.campaign_id;

  step := public.pick_resume_step(t.campaign_id, t.lead_id, coalesce(c.ooo_resume_same_step, true));
  parsed := public.parse_ooo_return_at(body, t.tz);
  due := public.compute_ooo_followup(t.campaign_id, t.lead_id, base, parsed);

  insert into public.ooo_routes(thread_id, campaign_id, lead_id, detected_at, parsed_return_at, followup_due_at, step_no, variant_id, status, reason, meta)
  values (t.thread_id, t.campaign_id, t.lead_id, base, parsed, due, step, c.ooo_variant_override, 'pending', case when parsed is not null then 'parsed_date' else 'fallback_days' end, jsonb_build_object('message_id', new.id))
  on conflict (thread_id) do update
    set detected_at = excluded.detected_at,
        parsed_return_at = excluded.parsed_return_at,
        followup_due_at = excluded.followup_due_at,
        step_no = excluded.step_no,
        variant_id = excluded.variant_id,
        status = 'pending',
        reason = excluded.reason,
        meta = public.ooo_routes.meta || jsonb_build_object('message_id', new.id);

  return new;
end;
$$;

create trigger trg_autoroute_ooo
after insert on public.inbox_messages
for each row execute function public._on_ooo_autoroute();


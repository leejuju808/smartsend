
-- 0) Optional timezone column on leads ----------------------------------------
alter table public.leads
  add column if not exists tz text;

-- A) campaign_leads join table -------------------------------------------------
create table if not exists public.campaign_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  status text not null default 'new' check (status in ('new','queued','sent','replied','unsub','bounced','paused')),
  meta jsonb not null default '{}'::jsonb,
  unique (campaign_id, lead_id)
);

create index if not exists idx_campleads_campaign on public.campaign_leads(campaign_id);
create index if not exists idx_campleads_status on public.campaign_leads(campaign_id, status);


-- B) send_queue supporting index ----------------------------------------------
create index if not exists idx_send_queue_by_campaign_step
  on public.send_queue(campaign_id, step_no, due_at);


-- C) Attach helper -------------------------------------------------------------
create or replace function public.attach_leads_to_campaign(
  p_campaign uuid,
  p_leads uuid[]
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := 0;
  v_owner uuid;
begin
  select user_id into v_owner from public.campaigns where id = p_campaign;

  if v_owner is null then
    raise exception 'Campaign not found';
  end if;

  insert into public.campaign_leads (campaign_id, lead_id)
  select p_campaign, x
  from unnest(p_leads) as t(x)
  where x is not null
  on conflict (campaign_id, lead_id) do nothing;

  get diagnostics n = row_count;

  return n;
end;
$$;

revoke all on function public.attach_leads_to_campaign(uuid, uuid[]) from anon, authenticated;


create or replace function public.next_window_utc(
  p_from timestamptz,
  p_tz text,
  p_start text,
  p_end text,
  p_days int[] default array[1,2,3,4,5]
) returns timestamptz
language plpgsql
set search_path = public
as $$
declare
  local_from timestamp;
  d date;
  tod time;
  dow int;
  start_local timestamp;
  end_local timestamp;
  candidate_local timestamp;
  i int := 0;
begin
  if p_tz is null or trim(p_tz) = '' then
    p_tz := 'UTC';
  end if;

  local_from := p_from at time zone p_tz;
  d := date_trunc('day', local_from)::date;
  tod := local_from::time;

  loop
    exit when i > 14;
    dow := extract(isodow from d);

    if p_days is null or array_length(p_days, 1) is null or p_days @> array[dow] then
      start_local := d::timestamp + (p_start)::time;
      end_local := d::timestamp + (p_end)::time;

      if tod < (p_end)::time then
        if tod < (p_start)::time then
          candidate_local := start_local;
        else
          candidate_local := local_from;
        end if;

        if candidate_local <= end_local then
          return (candidate_local at time zone p_tz);
        end if;
      end if;
    end if;

    d := d + interval '1 day';
    tod := time '00:00';
    i := i + 1;
  end loop;

  return p_from;
end;
$$;

create or replace function public.enqueue_step_for_leads(
  p_campaign uuid,
  p_step_no int,
  p_leads uuid[],
  p_start_at timestamptz,
  p_per_min int default 20,
  p_jitter_seconds int default 45,
  p_business_hours boolean default false,
  p_window_start text default '08:00',
  p_window_end text default '17:00',
  p_days int[] default array[1,2,3,4,5]
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead uuid;
  i int := 0;
  batch_min int := greatest(coalesce(p_per_min, 1), 1);
  v_owner uuid;
  v_due timestamptz := p_start_at;
  v_tz text;
  v_due_effective timestamptz;
  v_jitter int;
begin
  select user_id into v_owner from public.campaigns where id = p_campaign;

  if v_owner is null then
    raise exception 'Campaign not found';
  end if;

  foreach v_lead in array p_leads loop
    continue when v_lead is null;

    if (i > 0 and i % batch_min = 0) then
      v_due := v_due + interval '1 minute';
    end if;

    select coalesce(l.tz, l.meta->>'tz', 'UTC')
      into v_tz
      from public.leads l
     where l.id = v_lead;

    if p_business_hours then
      v_due_effective := public.next_window_utc(v_due, v_tz, p_window_start, p_window_end, p_days);
    else
      v_due_effective := v_due;
    end if;

    v_jitter := case
      when coalesce(p_jitter_seconds, 0) <= 0 then 0
      else floor(random() * p_jitter_seconds)::int
    end;

    insert into public.send_queue (campaign_id, lead_id, step_no, due_at)
    select p_campaign, v_lead, p_step_no,
           v_due_effective + make_interval(secs => v_jitter)
    where not exists (
      select 1
      from public.send_queue q
      where q.campaign_id = p_campaign
        and q.lead_id = v_lead
        and q.step_no = p_step_no
    )
    on conflict do nothing;

    update public.campaign_leads
       set status = 'queued'
     where campaign_id = p_campaign
       and lead_id = v_lead
       and status = 'new';

    i := i + 1;
  end loop;

  return i;
end;
$$;

revoke all on function public.enqueue_step_for_leads(uuid, int, uuid[], timestamptz, int, int, boolean, text, text, int[])
  from anon, authenticated;

grant execute on function public.enqueue_step_for_leads(uuid, int, uuid[], timestamptz, int, int, boolean, text, text, int[])
  to service_role;


-- E) Import job helper view ----------------------------------------------------
create or replace view public.v_import_job_valid as
select
  r.job_id,
  count(*) filter (where r.valid) as valid_rows,
  count(*) filter (where not r.valid) as invalid_rows
from public.import_rows r
group by r.job_id;


-- F) RLS for campaign_leads ----------------------------------------------------
alter table public.campaign_leads enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'campaign_leads'
      and policyname = 'campleads_select_by_membership'
  ) then
    create policy campleads_select_by_membership on public.campaign_leads
      for select
      using (public.is_campaign_member(campaign_id));
  end if;
end $$;



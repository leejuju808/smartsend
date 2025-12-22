
-- 0) Optional lead timezone column -------------------------------------------
alter table public.leads
  add column if not exists tz text;

-- A) Join table: campaign ⇄ lead ------------------------------------------------
create table if not exists public.campaign_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  status text not null default 'new' check (status in ('new','queued','sent','replied','unsub','bounced','paused')),
  meta jsonb not null default '{}'::jsonb,
  unique (campaign_id, lead_id)
);

-- Ensure columns & constraints exist even on legacy tables
alter table public.campaign_leads
  add column if not exists id uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists status text,
  add column if not exists meta jsonb;

update public.campaign_leads
   set id = gen_random_uuid()
 where id is null;

alter table public.campaign_leads
  alter column id set default gen_random_uuid();

alter table public.campaign_leads
  alter column status set default 'new';

update public.campaign_leads
   set status = 'new'
 where status is null;

update public.campaign_leads
   set meta = '{}'::jsonb
 where meta is null;

alter table public.campaign_leads
  alter column status set not null,
  alter column meta set not null,
  alter column meta set default '{}'::jsonb;

do $$
begin
  if exists (
    select 1
    from pg_constraint c
    join pg_class cl on c.conrelid = cl.oid
    join pg_namespace n on cl.relnamespace = n.oid
    where n.nspname = 'public'
      and cl.relname = 'campaign_leads'
      and c.contype = 'p'
  ) then
    -- ensure primary key is on id column
    if not exists (
      select 1
      from pg_index i
      join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
      join pg_class cl on cl.oid = i.indrelid
      join pg_namespace n on n.oid = cl.relnamespace
      where n.nspname = 'public'
        and cl.relname = 'campaign_leads'
        and i.indisprimary
        and a.attname = 'id'
    ) then
      alter table public.campaign_leads drop constraint if exists campaign_leads_pkey;
      alter table public.campaign_leads add constraint campaign_leads_pkey primary key (id);
    end if;
  else
    alter table public.campaign_leads add constraint campaign_leads_pkey primary key (id);
  end if;
end $$;

-- Normalize status constraint
do $$
begin
  if exists (
    select 1
    from pg_constraint c
    join pg_class cl on c.conrelid = cl.oid
    join pg_namespace n on cl.relnamespace = n.oid
    where n.nspname = 'public'
      and cl.relname = 'campaign_leads'
      and c.conname = 'campaign_leads_status_check'
  ) then
    alter table public.campaign_leads drop constraint campaign_leads_status_check;
  end if;
  alter table public.campaign_leads
    add constraint campaign_leads_status_check
      check (status in ('new','queued','sent','replied','unsub','bounced','paused'));
exception
  when others then
    raise notice 'campaign_leads status constraint not updated: %', sqlerrm;
end $$;

create unique index if not exists uq_campaign_leads_campaign_lead
  on public.campaign_leads(campaign_id, lead_id);

create index if not exists idx_campleads_campaign on public.campaign_leads(campaign_id);
create index if not exists idx_campleads_status on public.campaign_leads(campaign_id, status);


-- B) Ensure send_queue pacing index (table assumed to exist) --------------------
alter table public.send_queue
  add column if not exists step_no int,
  add column if not exists due_at timestamptz;

update public.send_queue
   set step_no = 1
 where step_no is null;

alter table public.send_queue
  alter column step_no set default 1;

alter table public.send_queue
  alter column due_at set default now();

update public.send_queue
   set due_at = now()
 where due_at is null;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'send_queue'
      and column_name = 'scheduled_for'
  ) then
    update public.send_queue
       set due_at = scheduled_for
     where due_at = now()
       and scheduled_for is not null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'send_queue'
      and column_name = 'scheduled_at'
  ) then
    update public.send_queue
       set due_at = scheduled_at
     where due_at = now()
       and scheduled_at is not null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'send_queue'
      and column_name = 'planned_at'
  ) then
    update public.send_queue
       set due_at = planned_at
     where due_at = now()
       and planned_at is not null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'send_queue'
      and column_name = 'next_attempt_at'
  ) then
    update public.send_queue
       set due_at = next_attempt_at
     where due_at = now()
       and next_attempt_at is not null;
  end if;
end $$;

do $$
begin
  begin
    alter table public.send_queue alter column step_no set not null;
  exception
    when others then
      raise notice 'send_queue.step_no not enforced: %', sqlerrm;
  end;
  begin
    alter table public.send_queue alter column due_at set not null;
  exception
    when others then
      raise notice 'send_queue.due_at not enforced: %', sqlerrm;
  end;
end $$;

create index if not exists idx_send_queue_by_campaign_step
  on public.send_queue(campaign_id, step_no, due_at);


-- C) Helper: attach a set of leads to a campaign (idempotent) -------------------
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
  on conflict (campaign_id, lead_id) do nothing;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.attach_leads_to_campaign(uuid,uuid[]) from public;
grant execute on function public.attach_leads_to_campaign(uuid,uuid[]) to service_role;


-- D) Helper: enqueue step N for a set of leads with pacing/jitter ---------------
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
  i int := 0;
  batch_min int := greatest(p_per_min, 1);
  v_owner uuid;
  v_due timestamptz := p_start_at;
  v_lead uuid;
  v_tz text;
  v_due_effective timestamptz;
  v_jitter int;
begin
  select user_id into v_owner from public.campaigns where id = p_campaign;
  if v_owner is null then
    raise exception 'Campaign not found';
  end if;

  foreach v_lead in array p_leads loop
    if i > 0 and i % batch_min = 0 then
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

    v_jitter := case when p_jitter_seconds <= 0 then 0 else floor(random() * p_jitter_seconds)::int end;

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

revoke all on function public.enqueue_step_for_leads(uuid,int,uuid[],timestamptz,int,int,boolean,text,text,int[]) from public;
grant execute on function public.enqueue_step_for_leads(uuid,int,uuid[],timestamptz,int,int,boolean,text,text,int[]) to service_role;


-- E) Convenience view to preview import validity counts ------------------------
create or replace view public.v_import_job_valid as
select
  r.job_id,
  count(*) filter (where r.valid)     as valid_rows,
  count(*) filter (where not r.valid) as invalid_rows
from public.import_rows r
group by r.job_id;


-- #4) RLS — policies -----------------------------------------------------------
alter table public.campaign_leads enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'campaign_leads'
      and policyname = 'campleads_select_by_membership'
  ) then
    create policy campleads_select_by_membership
      on public.campaign_leads
      for select
      using (public.is_campaign_member(campaign_id));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'campaign_leads'
      and policyname = 'campleads_no_mutations_direct'
  ) then
    create policy campleads_no_mutations_direct
      on public.campaign_leads
      for all
      to authenticated, anon
      using (false)
      with check (false);
  end if;
end $$;

alter table public.import_rows enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'import_rows'
      and policyname = 'import_rows_owner_select'
  ) then
    create policy import_rows_owner_select
      on public.import_rows
      for select
      using (user_id = auth.uid());
  end if;
end $$;

alter table public.import_jobs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'import_jobs'
      and policyname = 'import_jobs_owner_select'
  ) then
    create policy import_jobs_owner_select
      on public.import_jobs
      for select
      using (user_id = auth.uid());
  end if;
end $$;



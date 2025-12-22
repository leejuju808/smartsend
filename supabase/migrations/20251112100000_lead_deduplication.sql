-- Lead deduplication foundations, RPC helpers, merge engine, and safety guards

-- 1) Fast search helpers ----------------------------------------------------
create extension if not exists pg_trgm;

alter table public.leads
  add column if not exists email_norm text generated always as (lower(trim(email))) stored,
  add column if not exists name_norm text generated always as (lower(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')))) stored,
  add column if not exists domain text generated always as (split_part(lower(email), '@', 2)) stored;

create index if not exists idx_leads_email_norm on public.leads (email_norm);
create index if not exists idx_leads_domain on public.leads (domain);
create index if not exists idx_leads_name_trgm on public.leads using gin (name_norm gin_trgm_ops);

-- 2) Dupe findings + merge audit --------------------------------------------
create table if not exists public.lead_dupe_candidates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  other_lead_id uuid not null references public.leads(id) on delete cascade,
  reason text not null,
  score real not null,
  unique (lead_id, other_lead_id, reason)
);

create table if not exists public.lead_merge_audit (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor uuid,
  from_lead uuid not null,
  into_lead uuid not null,
  summary jsonb not null
);

-- 3) Alias map ---------------------------------------------------------------
create table if not exists public.lead_aliases (
  email_norm text primary key,
  lead_id uuid not null references public.leads(id) on delete cascade
);

-- 4) Duplicate detection RPCs -----------------------------------------------
create or replace function public.find_dupes_by_email(p_email text)
returns table(lead_id uuid, reason text, score real)
language sql
stable
as $$
  select l.id, 'email'::text, 1.0::real
  from public.leads l
  where l.email_norm = lower(trim(p_email))
$$;

create or replace function public.find_dupes_by_fuzzy(p_lead uuid, p_threshold real default 0.72)
returns table(other_lead_id uuid, reason text, score real)
language sql
stable
as $$
  with me as (
    select id, domain, name_norm, lower(coalesce(company, '')) as company
    from public.leads
    where id = p_lead
  )
  select
    l.id,
    'domain_name_sim'::text,
    greatest(
      similarity(l.name_norm, me.name_norm),
      similarity(lower(coalesce(l.company, '')), me.company)
    ) as score
  from public.leads l
  join me on l.domain = me.domain
  where l.id <> me.id
    and l.domain is not null
    and greatest(
      similarity(l.name_norm, me.name_norm),
      similarity(lower(coalesce(l.company, '')), me.company)
    ) >= p_threshold
  order by score desc
$$;

create or replace function public.queue_dupe_candidates(p_lead uuid)
returns void
language plpgsql
as $$
declare
  r record;
  src_email text;
begin
  if p_lead is null then
    return;
  end if;

  select email into src_email from public.leads where id = p_lead;

  if src_email is not null then
    for r in
      select * from public.find_dupes_by_email(src_email)
    loop
      if r.lead_id = p_lead then
        continue;
      end if;
      insert into public.lead_dupe_candidates (lead_id, other_lead_id, reason, score)
      values (p_lead, r.lead_id, r.reason, r.score)
      on conflict (lead_id, other_lead_id, reason) do nothing;
    end loop;
  end if;

  for r in
    select * from public.find_dupes_by_fuzzy(p_lead)
  loop
    insert into public.lead_dupe_candidates (lead_id, other_lead_id, reason, score)
    values (p_lead, r.other_lead_id, r.reason, r.score)
    on conflict (lead_id, other_lead_id, reason) do nothing;
  end loop;
end;
$$;

-- 5) Merge engine ------------------------------------------------------------
create or replace function public.merge_leads(p_from uuid, p_into uuid, p_actor uuid default null)
returns void
language plpgsql
as $$
declare
  moved_threads int := 0;
  moved_queue int := 0;
  moved_events int := 0;
  kept jsonb;
  overwritten jsonb;
begin
  if p_from is null or p_into is null then
    raise exception 'merge_leads: missing ids';
  end if;

  if p_from = p_into then
    raise exception 'merge_leads: from == into';
  end if;

  update public.inbox_threads
  set lead_id = p_into
  where lead_id = p_from;
  get diagnostics moved_threads = row_count;

  update public.send_queue
  set lead_id = p_into
  where lead_id = p_from;
  get diagnostics moved_queue = row_count;

  update public.send_events
  set lead_id = p_into
  where lead_id = p_from;
  get diagnostics moved_events = row_count;

  update public.deliverability_events
  set lead_id = p_into
  where lead_id = p_from;

  update public.campaign_leads
  set lead_id = p_into
  where lead_id = p_from;

  insert into public.lead_aliases(email_norm, lead_id)
  select email_norm, p_into
  from public.leads
  where id = p_from
    and email_norm is not null
  on conflict (email_norm) do update set lead_id = excluded.lead_id;

  update public.leads as into_lead
  set
    first_name = coalesce(into_lead.first_name, src.first_name),
    last_name = coalesce(into_lead.last_name, src.last_name),
    company = coalesce(into_lead.company, src.company),
    title = coalesce(into_lead.title, src.title),
    phone = coalesce(into_lead.phone, src.phone),
    website = coalesce(into_lead.website, src.website)
  from (select * from public.leads where id = p_from) as src
  where into_lead.id = p_into;

  kept := jsonb_build_object('into', p_into);
  overwritten := jsonb_build_object('from', p_from);

  insert into public.lead_merge_audit(actor, from_lead, into_lead, summary)
  values (
    p_actor,
    p_from,
    p_into,
    jsonb_build_object(
      'moved_threads', moved_threads,
      'moved_queue', moved_queue,
      'moved_events', moved_events,
      'kept', kept,
      'overwritten', overwritten
    )
  );

  update public.leads
  set archived = true
  where id = p_from
    and not exists (
      select 1 from public.inbox_threads where lead_id = p_from
    );
end;
$$;

-- 6) Send-time guards --------------------------------------------------------
create or replace function public.prevent_duplicate_enqueue()
returns trigger
language plpgsql
as $$
declare
  em text;
begin
  select email_norm into em
  from public.leads
  where id = new.lead_id;

  if em is null then
    return new;
  end if;

  if exists (
    select 1
    from public.lead_aliases a
    where a.email_norm = em
      and a.lead_id <> new.lead_id
    limit 1
  ) then
    select a.lead_id into new.lead_id
    from public.lead_aliases a
    where a.email_norm = em
    limit 1;

    select email_norm into em
    from public.leads
    where id = new.lead_id;
  end if;

  if exists (
    select 1
    from public.send_queue q
    join public.leads l on l.id = q.lead_id
    where q.campaign_id = new.campaign_id
      and l.email_norm = em
      and q.created_at >= now() - interval '30 days'
      and q.status in ('pending', 'queued', 'sending', 'sent')
  ) then
    raise exception 'duplicate enqueue blocked for %', em;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_dup_enqueue on public.send_queue;
create trigger trg_prevent_dup_enqueue
before insert on public.send_queue
for each row execute function public.prevent_duplicate_enqueue();



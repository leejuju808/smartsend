-- Engagement Metrics & Send-Time Optimization
-- Implements lead/domain engagement facts, histograms, scoring, and STO helpers

-- ============================================================================
-- A) Lead engagement tallies
-- ============================================================================

alter table public.lead_scores
  add column if not exists score real not null default 0,
  add column if not exists opens_30d int not null default 0,
  add column if not exists clicks_30d int not null default 0,
  add column if not exists replies_30d int not null default 0,
  add column if not exists bounces_30d int not null default 0,
  add column if not exists last_event_at timestamptz;

create index if not exists idx_lead_scores_last_event on public.lead_scores(last_event_at desc nulls last);

-- ============================================================================
-- B) Domain scores
-- ============================================================================

create table if not exists public.domain_scores (
  domain text primary key,
  score real not null default 0,
  opens_30d int not null default 0,
  clicks_30d int not null default 0,
  replies_30d int not null default 0,
  bounces_30d int not null default 0,
  last_event_at timestamptz
);

comment on table public.domain_scores is 'Aggregated engagement metrics per email domain';

-- ============================================================================
-- C) Send-time histograms
-- ============================================================================

create table if not exists public.send_time_histograms (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('lead','domain')),
  key text not null,
  hour int not null check (hour between 0 and 23),
  weight real not null default 0,
  unique(scope, key, hour)
);

create index if not exists idx_sto_scope_key on public.send_time_histograms(scope, key);

comment on table public.send_time_histograms is 'Exponential-decay send-time preferences per lead/domain';

-- ============================================================================
-- D) Histogram decay helper
-- ============================================================================

create or replace function public.bump_hist(p_scope text, p_key text, p_ts timestamptz)
returns void
language plpgsql
as $$
declare
  h int := extract(hour from p_ts at time zone 'UTC');
begin
  -- 0.98 daily decay to keep recent behavior dominant
  update public.send_time_histograms sth
     set weight = sth.weight * 0.98
   where sth.scope = p_scope
     and sth.key = p_key;

  insert into public.send_time_histograms(scope, key, hour, weight)
  values (p_scope, p_key, h, 1.0)
  on conflict (scope, key, hour) do
    update set weight = public.send_time_histograms.weight + excluded.weight;
end;
$$;

comment on function public.bump_hist(text, text, timestamptz) is 'Decay and increment histogram weight for the specified scope/key/hour';

-- ============================================================================
-- E) Engagement ingest (opens, clicks, replies, bounces)
-- ============================================================================

create or replace function public.engagement_ingest()
returns void
language plpgsql
as $$
declare
  r record;
  v_domain text;
  v_lead uuid;
  v_now timestamptz := now();
begin
  -- Opens / Clicks in last day
  for r in
    select e.event_type, e.rcpt_email, e.created_at
    from public.deliverability_events e
    where e.event_type in ('open','click')
      and e.created_at >= v_now - interval '1 day'
  loop
    v_domain := null;
    v_lead := null;

    if r.rcpt_email is not null then
      v_domain := split_part(lower(r.rcpt_email), '@', 2);
      select id into v_lead
      from public.leads
      where lower(email) = lower(r.rcpt_email)
      limit 1;
    end if;

    if v_lead is not null then
      insert into public.lead_scores(lead_id, last_event_at)
      values (v_lead, r.created_at)
      on conflict (lead_id) do update
        set last_event_at = greatest(excluded.last_event_at, public.lead_scores.last_event_at);

      if r.event_type = 'open' then
        update public.lead_scores
           set opens_30d = opens_30d + 1
         where lead_id = v_lead;
      else
        update public.lead_scores
           set clicks_30d = clicks_30d + 1
         where lead_id = v_lead;
      end if;

      perform public.bump_hist('lead', v_lead::text, r.created_at);
    end if;

    if v_domain is not null then
      insert into public.domain_scores(domain, last_event_at)
      values (v_domain, r.created_at)
      on conflict (domain) do update
        set last_event_at = greatest(excluded.last_event_at, public.domain_scores.last_event_at);

      if r.event_type = 'open' then
        update public.domain_scores
           set opens_30d = opens_30d + 1
         where domain = v_domain;
      else
        update public.domain_scores
           set clicks_30d = clicks_30d + 1
         where domain = v_domain;
      end if;

      perform public.bump_hist('domain', v_domain, r.created_at);
    end if;
  end loop;

  -- Replies in last day
  for r in
    select m.created_at, l.email
    from public.inbox_messages m
    join public.inbox_threads t on t.id = m.thread_id
    join public.leads l on l.id = t.lead_id
    where m.direction = 'inbound'
      and m.created_at >= v_now - interval '1 day'
  loop
    v_domain := null;
    v_lead := null;

    if r.email is not null then
      v_domain := split_part(lower(r.email), '@', 2);
      select id into v_lead
      from public.leads
      where lower(email) = lower(r.email)
      limit 1;
    end if;

    if v_lead is not null then
      insert into public.lead_scores(lead_id, last_event_at)
      values (v_lead, r.created_at)
      on conflict (lead_id) do update
        set last_event_at = greatest(excluded.last_event_at, public.lead_scores.last_event_at);

      update public.lead_scores
         set replies_30d = replies_30d + 1
       where lead_id = v_lead;

      perform public.bump_hist('lead', v_lead::text, r.created_at);
    end if;

    if v_domain is not null then
      insert into public.domain_scores(domain, last_event_at)
      values (v_domain, r.created_at)
      on conflict (domain) do update
        set last_event_at = greatest(excluded.last_event_at, public.domain_scores.last_event_at);

      update public.domain_scores
         set replies_30d = replies_30d + 1
       where domain = v_domain;

      perform public.bump_hist('domain', v_domain, r.created_at);
    end if;
  end loop;

  -- Bounces in last day (penalty)
  update public.lead_scores ls
     set bounces_30d = ls.bounces_30d + x.cnt,
         last_event_at = coalesce(ls.last_event_at, v_now)
    from (
      select l.id as lead_id, count(*) cnt, max(e.created_at) max_created
      from public.deliverability_events e
      join public.leads l on lower(l.email) = lower(e.rcpt_email)
      where e.event_type = 'bounce'
        and e.created_at >= v_now - interval '1 day'
      group by l.id
    ) x
   where x.lead_id = ls.lead_id;

  update public.lead_scores ls
     set last_event_at = greatest(ls.last_event_at, x.max_created)
    from (
      select l.id as lead_id, max(e.created_at) max_created
      from public.deliverability_events e
      join public.leads l on lower(l.email) = lower(e.rcpt_email)
      where e.event_type = 'bounce'
        and e.created_at >= v_now - interval '1 day'
      group by l.id
    ) x
   where x.lead_id = ls.lead_id;

  update public.domain_scores ds
     set bounces_30d = ds.bounces_30d + x.cnt,
         last_event_at = greatest(ds.last_event_at, x.max_created)
    from (
      select split_part(lower(e.rcpt_email), '@', 2) as domain, count(*) cnt, max(e.created_at) max_created
      from public.deliverability_events e
      where e.event_type = 'bounce'
        and e.created_at >= v_now - interval '1 day'
      group by 1
    ) x
   where x.domain = ds.domain;
end;
$$;

comment on function public.engagement_ingest() is 'Incremental ingest of opens, clicks, replies, and bounces';

-- ============================================================================
-- F) Score recomputation (0–100)
-- ============================================================================

create or replace function public.recompute_scores()
returns void
language plpgsql
as $$
begin
  update public.lead_scores
     set score = greatest(0, least(100, 8 * replies_30d + 2 * clicks_30d + 1 * opens_30d - 10 * bounces_30d)),
         engagement_score = greatest(0, least(100, 8 * replies_30d + 2 * clicks_30d + 1 * opens_30d - 10 * bounces_30d)),
         priority = greatest(0, least(100, 8 * replies_30d + 2 * clicks_30d + 1 * opens_30d - 10 * bounces_30d)),
         updated_at = now()
    where true;

  update public.domain_scores
     set score = greatest(0, least(100, 5 * replies_30d + 1.5 * clicks_30d + 0.5 * opens_30d - 8 * bounces_30d));
end;
$$;

comment on function public.recompute_scores() is 'Recompute composite scores for leads and domains';

-- ============================================================================
-- G) Best hour selector (UTC)
-- ============================================================================

create or replace function public.best_hour(p_scope text, p_key text)
returns int
language sql
stable
as $$
  select hour
  from public.send_time_histograms
  where scope = p_scope
    and key = p_key
  order by weight desc, hour asc
  limit 1;
$$;

comment on function public.best_hour(text, text) is 'Best-performing UTC hour for the given scope/key based on histogram weight';

-- ============================================================================
-- H) Next-best send timestamp helper
-- ============================================================================

create or replace function public.next_best_send_ts(p_lead uuid, p_fallback_hour int default 15)
returns timestamptz
language plpgsql
as $$
declare
  dom text;
  bh int;
  tz_now timestamptz := now() at time zone 'UTC';
begin
  select split_part(lower(email), '@', 2)
    into dom
  from public.leads
  where id = p_lead;

  select public.best_hour('lead', p_lead::text) into bh;

  if bh is null and dom is not null then
    select public.best_hour('domain', dom) into bh;
  end if;

  if bh is null then
    bh := p_fallback_hour;
  end if;

  return date_trunc('hour', tz_now) + make_interval(hours => ((24 + bh - extract(hour from tz_now))::int % 24));
end;
$$;

comment on function public.next_best_send_ts(uuid, int) is 'Schedule next send window aligned to learned best hour (UTC)';

-- ============================================================================
-- I) STO helper for queueing
-- ============================================================================

create or replace function public.apply_sto(p_thread uuid, p_lead uuid)
returns timestamptz
language sql
stable
as $$
  select public.next_best_send_ts(p_lead);
$$;

comment on function public.apply_sto(uuid, uuid) is 'Compute the not_before timestamp using STO heuristics';

-- ============================================================================
-- J) Cron scheduling (idempotent)
-- ============================================================================

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'engagement-ingest-15m') then
    perform cron.schedule(
      'engagement-ingest-15m',
      '*/15 * * * *',
      $$select public.engagement_ingest();$$
    );
  end if;

  if not exists (select 1 from cron.job where jobname = 'engagement-recompute-hourly') then
    perform cron.schedule(
      'engagement-recompute-hourly',
      '5 * * * *',
      $$select public.recompute_scores();$$
    );
  end if;
end;
$$;

-- ============================================================================
-- K) Queue defaults & safety
-- ============================================================================

alter table public.send_queue
  add column if not exists not_before timestamptz,
  add column if not exists priority int default 0;

update public.send_queue
   set priority = least(100, greatest(0, coalesce(priority, 0)))
 where priority is distinct from least(100, greatest(0, coalesce(priority, 0)));

comment on column public.send_queue.not_before is 'Earliest UTC timestamp this item may be sent';
comment on column public.send_queue.priority is 'Higher priority items are processed sooner (0-100)';









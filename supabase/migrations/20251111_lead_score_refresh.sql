-- Lead score refresh: aggregated engagement weighting + daily recompute

--------------------------------------------------------------------------------
-- A) Ensure columns/indexes for lead_scores storage
--------------------------------------------------------------------------------

alter table public.lead_scores
  add column if not exists last_event timestamptz,
  add column if not exists computed_from jsonb default '{}'::jsonb;

create unique index if not exists uq_lead_scores_lead on public.lead_scores(lead_id);

--------------------------------------------------------------------------------
-- B) Aggregated engagement view
--------------------------------------------------------------------------------

create or replace view public.lead_score_events as
select
  l.id as lead_id,
  l.org_id,
  coalesce(sum(case when le.event_type = 'open' then 1 else 0 end), 0) * 2 as opens_score,
  coalesce(sum(case when le.event_type = 'click' then 1 else 0 end), 0) * 3 as clicks_score,
  coalesce(sum(case when le.event_type = 'reply' then 1 else 0 end), 0) * 10 as replies_score,
  coalesce(sum(case when le.event_type = 'meeting' then 1 else 0 end), 0) * 15 as meetings_score,
  greatest(
    extract(epoch from (now() - coalesce(max(le.occurred_at), l.created_at))) / 86400,
    0
  ) as days_since_last_activity,
  coalesce(max(le.occurred_at), l.created_at) as last_activity_at
from public.leads l
left join public.lead_events le on le.lead_id = l.id
group by l.id, l.org_id, l.created_at;

comment on view public.lead_score_events is 'Aggregated engagement weights and recency for leads.';

--------------------------------------------------------------------------------
-- C) Scoring function
--------------------------------------------------------------------------------

create or replace function public.update_lead_scores()
returns void
language plpgsql
as $$
declare
  v_now timestamptz := now();
begin
  insert into public.lead_scores (
    org_id,
    lead_id,
    score,
    last_event,
    last_event_at,
    computed_from,
    updated_at
  )
  select
    e.org_id,
    e.lead_id,
    greatest(
      0,
      least(
        100,
        e.opens_score + e.clicks_score + e.replies_score + e.meetings_score
        - (e.days_since_last_activity * 1.5)
      )
    ) as score,
    e.last_activity_at,
    e.last_activity_at,
    jsonb_build_object(
      'opens', e.opens_score,
      'clicks', e.clicks_score,
      'replies', e.replies_score,
      'meetings', e.meetings_score,
      'decay', e.days_since_last_activity * 1.5
    ),
    v_now
  from public.lead_score_events e
  on conflict (lead_id)
  do update
    set
      score = excluded.score,
      last_event = excluded.last_event,
      last_event_at = excluded.last_event_at,
      computed_from = excluded.computed_from,
      updated_at = v_now,
      engagement_score = excluded.score::numeric(5, 2),
      priority = excluded.score::numeric(5, 2);
end;
$$;

comment on function public.update_lead_scores() is 'Recompute lead scores using engagement weights and decay.';

--------------------------------------------------------------------------------
-- D) Daily cron schedule
--------------------------------------------------------------------------------

create extension if not exists pg_cron;

do $$
begin
  if not exists (
    select 1
    from cron.job
    where jobname = 'lead_score_update'
  ) then
    perform cron.schedule(
      'lead_score_update',
      '0 6 * * *',
      $$select public.update_lead_scores();$$
    );
  end if;
end;
$$;



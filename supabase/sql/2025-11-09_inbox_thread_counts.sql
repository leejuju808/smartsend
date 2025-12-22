create or replace function public.inbox_thread_counts(p_campaign_id uuid)
returns jsonb
language sql
stable
as $$
  with base as (
    select t.id, f.is_nudged, f.is_snoozed
    from public.inbox_threads t
    left join public.v_thread_flags f on f.thread_id = t.id
    where t.campaign_id = p_campaign_id
  ),
  agg as (
    select
      count(*)::int as all_cnt,
      count(*) filter (where coalesce(is_nudged, false))::int as nudged_cnt,
      count(*) filter (where coalesce(is_snoozed, false))::int as snoozed_cnt,
      count(*) filter (
        where not coalesce(is_snoozed, false)
          and not coalesce(is_nudged, false)
      )::int as needs_reply_cnt
    from base
  )
  select jsonb_build_object(
    'all', all_cnt,
    'nudged', nudged_cnt,
    'snoozed', snoozed_cnt,
    'needs_reply', needs_reply_cnt
  )
  from agg;
$$;



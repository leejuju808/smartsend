-- Overall metrics for a user
create or replace function public.metrics_overall(p_owner uuid)
returns table(sent bigint, open bigint, reply bigint)
language sql stable as $$
  select
    count(*)::bigint as sent,
    count(*) filter (where open_count > 0)::bigint as open,
    count(*) filter (where replied)::bigint as reply
  from public.outbound_messages
  where owner = p_owner;
$$;

-- Per-sequence metrics
create or replace function public.metrics_for_sequence(p_owner uuid, p_sequence uuid)
returns table(sent bigint, open bigint, reply bigint)
language sql stable as $$
  select
    count(*)::bigint as sent,
    count(*) filter (where open_count > 0)::bigint as open,
    count(*) filter (where replied)::bigint as reply
  from public.outbound_messages
  where owner = p_owner and sequence_id = p_sequence;
$$;


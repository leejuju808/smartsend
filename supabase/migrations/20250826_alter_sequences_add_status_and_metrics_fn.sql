-- Ensure 'status' exists on sequences
alter table public.sequences
  add column if not exists status text not null default 'draft'; -- draft|running|paused|completed|demo

-- Per-sequence metrics for an owner
create or replace function public.sequences_with_metrics(p_owner uuid)
returns table(
  id uuid,
  name text,
  status text,
  created_at timestamptz,
  sent bigint,
  open bigint,
  reply bigint
) language sql stable as $$
  select
    s.id, s.name, s.status, s.created_at,
    count(om.id)::bigint as sent,
    count(om.id) filter (where om.open_count > 0)::bigint as open,
    count(om.id) filter (where om.replied)::bigint as reply
  from public.sequences s
  left join public.outbound_messages om
    on om.sequence_id = s.id and om.owner = p_owner
  where s.owner = p_owner
  group by s.id, s.name, s.status, s.created_at
  order by s.created_at desc;
$$;


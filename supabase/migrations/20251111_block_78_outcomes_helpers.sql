-- Block 78: Helper routines for variant stats

-- Refresh function for MV
create or replace function public.refresh_mv_variant_stats()
returns void
language sql
as
$$
  refresh materialized view concurrently public.mv_variant_stats;
$$;

-- 30d slice (falls back to MV when fresh enough)
create or replace function public.rpc_variant_stats_30d()
returns table (
  variant_id uuid,
  preset_key text,
  variant_name text,
  weight numeric,
  status text,
  account_id uuid,
  sends bigint,
  opens bigint,
  clicks bigint,
  replies bigint,
  open_rate numeric,
  click_rate numeric,
  reply_rate numeric
)
language sql
as
$$
  select *
  from public.mv_variant_stats
  where account_id is not null
$$;


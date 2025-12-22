-- Block 189: Command Center RPC Functions
-- RPC functions for SmartSend Command Center dashboard

-- 1. Get Global Queue Stats
create or replace function get_global_queue_stats(account_id_param uuid)
returns json as $$
declare 
  result json;
begin
  select json_build_object(
    'pending', (
      select count(*)::int 
      from public.global_send_queue 
      where account_id = account_id_param and status = 'pending'
    ),
    'processing', (
      select count(*)::int 
      from public.global_send_queue 
      where account_id = account_id_param and status = 'processing'
    ),
    'failed', (
      select count(*)::int 
      from public.global_send_queue 
      where account_id = account_id_param and status = 'failed'
    ),
    'retries', (
      select count(*)::int 
      from public.global_send_queue 
      where account_id = account_id_param and attempts > 0
    ),
    'oldest', (
      select min(scheduled_at) 
      from public.global_send_queue 
      where account_id = account_id_param
    ),
    'newest', (
      select max(scheduled_at) 
      from public.global_send_queue 
      where account_id = account_id_param
    )
  ) into result;

  return coalesce(result, json_build_object(
    'pending', 0,
    'processing', 0,
    'failed', 0,
    'retries', 0,
    'oldest', null,
    'newest', null
  ));
end;
$$ language plpgsql security definer;

-- 2. Get Deliverability Overview
create or replace function get_deliverability_overview(account_id_param uuid)
returns json as $$
declare 
  result json;
begin
  select json_build_object(
    'avg_reputation', (
      select coalesce(avg(reputation_score), 100)::numeric(10,2)
      from public.deliverability_stats
      where account_id = account_id_param
    ),
    'bounces_24h', (
      select coalesce(sum(bounces_24h), 0)::int
      from public.deliverability_stats
      where account_id = account_id_param
    ),
    'unsubs_24h', (
      select coalesce(sum(unsubscribes_24h), 0)::int
      from public.deliverability_stats
      where account_id = account_id_param
    ),
    'sent_24h', (
      select coalesce(sum(sent_24h), 0)::int
      from public.deliverability_stats
      where account_id = account_id_param
    )
  ) into result;

  return coalesce(result, json_build_object(
    'avg_reputation', 100.0,
    'bounces_24h', 0,
    'unsubs_24h', 0,
    'sent_24h', 0
  ));
end;
$$ language plpgsql security definer;

-- 3. Get SmartList Stats
create or replace function get_smartlist_stats(account_id_param uuid)
returns json as $$
declare 
  result json;
begin
  select coalesce(
    json_agg(
      json_build_object(
        'id', id,
        'name', name,
        'last_refreshed', last_refreshed,
        'lead_count', (
          select count(*)::int
          from public.leads l
          where l.account_id = account_id_param
          -- Note: SmartList lead matching would require evaluating llm_rules
          -- For now, we return a placeholder count
          -- In production, you'd want to evaluate the SmartList rules here
        )
      )
      order by last_refreshed desc nulls last
    ),
    '[]'::json
  ) into result
  from public.shared_resources
  where smart = true 
    and kind = 'saved_view'
    and (
      account_id = account_id_param 
      or owner_id in (
        select user_id 
        from public.workspace_members 
        where workspace_id = account_id_param
      )
    );

  return coalesce(result, '[]'::json);
end;
$$ language plpgsql security definer;

-- Comments
comment on function get_global_queue_stats is 'Returns queue statistics for Command Center dashboard';
comment on function get_deliverability_overview is 'Returns deliverability metrics for Command Center dashboard';
comment on function get_smartlist_stats is 'Returns SmartList performance stats for Command Center dashboard';













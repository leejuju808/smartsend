-- Block 428 — AI Deliverability Coach v1
-- AI Analyzes Setup → Gives Fixes, Warnings, Optimizations, Health Score, Action Plan

-- ============================================
-- 1) RPC Function: Get Workspace Deliverability Data
-- ============================================
create or replace function get_workspace_deliverability(workspace uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  result jsonb;
begin
  result := jsonb_build_object(
    'domains', (
      select jsonb_agg(
        jsonb_build_object(
          'id', d.id,
          'domain', d.domain,
          'spf_valid', coalesce(d.spf_valid, false),
          'dkim_valid', coalesce(d.dkim_valid, false),
          'dmarc_valid', coalesce(d.dmarc_valid, false),
          'mx_valid', coalesce(d.mx_valid, false),
          'health', coalesce(d.health, 'poor'),
          'last_check', d.last_checked
        )
      )
      from sender_domains d
      where d.workspace_id = workspace
    ),
    'inboxes', (
      select jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'email', i.email,
          'provider', i.provider,
          'daily_limit', i.daily_limit,
          'warmup_enabled', coalesce(i.warmup_enabled, false),
          'connected', coalesce(i.connected, false),
          'health', (
            select jsonb_build_object(
              'spam_rate', coalesce(h.spam_rate, 0),
              'bounce_rate', coalesce(h.bounce_rate, 0),
              'open_rate', coalesce(h.open_rate, 0),
              'click_rate', coalesce(h.click_rate, 0),
              'warmup_stage', coalesce(h.warmup_stage, 0),
              'score', coalesce(h.score, 50)
            )
            from inbox_health h
            where h.inbox_id = i.id
            limit 1
          )
        )
      )
      from sender_inboxes i
      where i.workspace_id = workspace
    ),
    'workspace', (
      select jsonb_build_object(
        'spam_rate', coalesce(wd.spam_rate, 0),
        'bounce_rate', coalesce(wd.bounce_rate, 0),
        'avg_open_rate', coalesce(wd.avg_open_rate, 0),
        'avg_click_rate', coalesce(wd.avg_click_rate, 0),
        'updated_at', wd.updated_at
      )
      from workspace_deliverability wd
      where wd.workspace_id = workspace
      limit 1
    ),
    'sending_windows', (
      select jsonb_build_object(
        'timezone', coalesce(wsw.timezone, 'America/Los_Angeles'),
        'allowed_days', coalesce(wsw.allowed_days, array['mon','tue','wed','thu','fri']::text[]),
        'start_time', coalesce(wsw.start_time, '08:00'),
        'end_time', coalesce(wsw.end_time, '17:00')
      )
      from workspace_sending_windows wsw
      where wsw.workspace_id = workspace
      limit 1
    ),
    'campaigns', (
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'status', c.status,
          'daily_cap', c.daily_cap,
          'send_window_start', c.send_window_start,
          'send_window_end', c.send_window_end,
          'warmup_mode', coalesce(c.warmup_mode, false)
        )
      )
      from campaigns c
      where c.workspace_id = workspace
    )
  );
  
  return result;
end;
$$;

-- Grant execute permission to authenticated users
grant execute on function get_workspace_deliverability(uuid) to authenticated;
grant execute on function get_workspace_deliverability(uuid) to service_role;




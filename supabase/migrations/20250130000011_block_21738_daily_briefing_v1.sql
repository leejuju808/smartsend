-- =========================================================
-- Block 21738 — SmartSend Roofing Owner Daily Briefing v1
-- (Today's Money Snapshot: Hot Leads • Appointments • Call Queue)
-- =========================================================
-- 
-- This is the morning brain for the roofing owner.
-- Open SmartSend and instantly see:
-- "How much money is sitting in my inbox TODAY?"
-- 
-- Full block. Clean. Implementable.

-- ============================================================================
-- FUNCTION: daily_briefing()
-- ============================================================================
-- Returns a JSON object with:
-- - New hot leads (last 24h) - count and top 3
-- - Today's appointments - count and list
-- - Call queue - pending count and hot count
-- - New replies (last 24h) - count
-- - Projected revenue snapshot (rough)

CREATE OR REPLACE FUNCTION public.daily_briefing(p_workspace_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now timestamptz := now();
  v_today_start timestamptz := date_trunc('day', v_now);
  v_today_end timestamptz := v_today_start + interval '1 day';

  v_new_hot_leads int;
  v_new_hot_list json;

  v_today_appt_count int;
  v_today_appts json;

  v_call_pending int;
  v_call_pending_hot int;

  v_new_replies int;

  v_projected_revenue numeric;
BEGIN
  -- 1) New HOT leads in last 24h
  SELECT count(*) INTO v_new_hot_leads
  FROM public.leads
  WHERE workspace_id = p_workspace_id
    AND status = 'hot'
    AND last_activity_at >= (v_now - interval '24 hours');

  SELECT coalesce(json_agg(row_to_json(t)), '[]'::json)
  INTO v_new_hot_list
  FROM (
    SELECT 
      id, 
      COALESCE(
        NULLIF(TRIM(name), ''),
        NULLIF(TRIM(CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, ''))), ''),
        email
      ) as name,
      email, 
      city, 
      heat_score, 
      last_activity_at
    FROM public.leads
    WHERE workspace_id = p_workspace_id
      AND status = 'hot'
      AND last_activity_at >= (v_now - interval '24 hours')
    ORDER BY heat_score DESC NULLS LAST
    LIMIT 3
  ) t;

  -- 2) Today's appointments
  -- Query appointments using scheduled_for (from block 21736 schema)
  -- If appointments table has date/time columns instead, we'll handle that separately
  SELECT count(*) INTO v_today_appt_count
  FROM public.appointments a
  JOIN public.leads l ON l.id = a.lead_id
  WHERE l.workspace_id = p_workspace_id
    AND a.scheduled_for >= v_today_start
    AND a.scheduled_for < v_today_end;

  SELECT coalesce(json_agg(row_to_json(t)), '[]'::json)
  INTO v_today_appts
  FROM (
    SELECT 
      a.id,
      a.scheduled_for,
      COALESCE(a.source, 'manual') as source,
      COALESCE(
        NULLIF(TRIM(l.name), ''),
        NULLIF(TRIM(CONCAT(COALESCE(l.first_name, ''), ' ', COALESCE(l.last_name, ''))), ''),
        l.email
      ) as name,
      l.email,
      l.city,
      l.heat_score
    FROM public.appointments a
    JOIN public.leads l ON l.id = a.lead_id
    WHERE l.workspace_id = p_workspace_id
      AND a.scheduled_for >= v_today_start
      AND a.scheduled_for < v_today_end
    ORDER BY a.scheduled_for ASC
  ) t;

  -- 3) Call queue counts
  SELECT count(*) INTO v_call_pending
  FROM public.call_tasks ct
  JOIN public.leads l ON l.id = ct.lead_id
  WHERE l.workspace_id = p_workspace_id
    AND ct.status = 'pending';

  SELECT count(*) INTO v_call_pending_hot
  FROM public.call_tasks ct
  JOIN public.leads l ON l.id = ct.lead_id
  WHERE l.workspace_id = p_workspace_id
    AND ct.status = 'pending'
    AND l.status = 'hot';

  -- 4) New homeowner replies (last 24h)
  SELECT count(*) INTO v_new_replies
  FROM public.email_events ee
  JOIN public.leads l ON l.id = ee.lead_id
  WHERE l.workspace_id = p_workspace_id
    AND ee.event_type = 'reply'
    AND ee.created_at >= (v_now - interval '24 hours');

  -- 5) Projected revenue (simple v1)
  SELECT
    (SELECT count(*) FROM public.leads WHERE workspace_id = p_workspace_id AND status = 'hot') * 12000
    + (SELECT count(*) FROM public.leads WHERE workspace_id = p_workspace_id AND status = 'warm') * 6000
  INTO v_projected_revenue;

  RETURN json_build_object(
    'generated_at', v_now,
    'new_hot_leads_count', v_new_hot_leads,
    'new_hot_leads', v_new_hot_list,
    'today_appointments_count', v_today_appt_count,
    'today_appointments', v_today_appts,
    'call_queue_pending', v_call_pending,
    'call_queue_pending_hot', v_call_pending_hot,
    'new_replies_24h', v_new_replies,
    'projected_revenue', v_projected_revenue
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.daily_briefing(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.daily_briefing(UUID) TO service_role;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION public.daily_briefing IS 'Returns daily briefing data for roofing owners: new hot leads, today''s appointments, call queue, new replies, and projected revenue.';


-- Block 491 — SDR Command Center View
-- Global board: hot leads, recent replies, AI follow-ups, filters

-- Last reply per lead
CREATE OR REPLACE VIEW last_reply_per_lead AS
SELECT DISTINCT ON (lead_id)
  lead_id,
  id AS reply_id,
  created_at AS replied_at,
  intent_label,
  intent_confidence,
  meeting_readiness
FROM lead_replies
ORDER BY lead_id, created_at DESC;

-- Next pending autopilot job per lead
CREATE OR REPLACE VIEW next_autopilot_job_per_lead AS
SELECT DISTINCT ON (lead_id)
  lead_id,
  id AS autopilot_job_id,
  scheduled_at,
  status,
  template_key
FROM sdr_autopilot_queue
WHERE status = 'pending'
ORDER BY lead_id, scheduled_at ASC;

-- Last activity timestamp per lead
CREATE OR REPLACE VIEW last_activity_per_lead AS
SELECT DISTINCT ON (lead_id)
  lead_id,
  created_at AS last_activity_at,
  event_type AS last_event_type
FROM lead_activity_events
ORDER BY lead_id, created_at DESC;

-- Main SDR command center view
CREATE OR REPLACE VIEW sdr_command_center_view AS
SELECT
  l.id AS lead_id,
  l.email,
  l.first_name,
  l.last_name,
  l.company,
  l.title,
  l.pipeline_stage,
  l.conversion_score,
  l.do_not_contact,
  l.org_id,

  r.reply_id,
  r.replied_at,
  r.intent_label,
  r.intent_confidence,
  r.meeting_readiness,

  a.autopilot_job_id,
  a.scheduled_at AS next_autopilot_at,
  a.status AS autopilot_status,
  a.template_key AS autopilot_template_key,

  la.last_activity_at,
  la.last_event_type

FROM leads l
LEFT JOIN last_reply_per_lead r
  ON r.lead_id = l.id
LEFT JOIN next_autopilot_job_per_lead a
  ON a.lead_id = l.id
LEFT JOIN last_activity_per_lead la
  ON la.lead_id = l.id;

-- Grant access to authenticated users
GRANT SELECT ON sdr_command_center_view TO authenticated;
GRANT SELECT ON last_reply_per_lead TO authenticated;
GRANT SELECT ON next_autopilot_job_per_lead TO authenticated;
GRANT SELECT ON last_activity_per_lead TO authenticated;


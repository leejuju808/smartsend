-- =========================================================
-- Block 8700 — Follow-Up Tasks View
-- =========================================================

DROP VIEW IF EXISTS public.followup_tasks_with_lead;

CREATE VIEW public.followup_tasks_with_lead AS
SELECT
  t.id AS task_id,
  t.workspace_id,
  t.campaign_id,
  t.contact_id,
  t.reply_id,
  t.task_type,
  t.due_at,
  t.completed_at,
  t.created_at,
  l.id AS lead_id,
  l.name AS lead_name,
  l.email AS lead_email,
  l.estimated_value,
  l.currency,
  er.intent AS reply_intent,
  er.preview AS reply_preview,
  er.received_at AS reply_received_at
FROM public.followup_tasks t
LEFT JOIN public.leads l
  ON l.contact_id = t.contact_id
  AND l.workspace_id = t.workspace_id
LEFT JOIN public.email_replies er
  ON er.id = t.reply_id;

-- Grant access to authenticated users
GRANT SELECT ON public.followup_tasks_with_lead TO authenticated;



























































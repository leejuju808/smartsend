-- Block 11400 — Inbox Filters v2
-- Enhance reply_inbox_summary view to include contact status for efficient filtering

-- Add contact status to reply_inbox_summary view
DO $$
BEGIN
  -- Drop and recreate view with contact status
  DROP VIEW IF EXISTS public.reply_inbox_summary CASCADE;
  
  CREATE VIEW public.reply_inbox_summary AS
  SELECT
    rt.id,
    rt.workspace_id,
    rt.contact_id,
    rt.lead_id,
    rt.campaign_id,
    rt.thread_key,
    rt.latest_intent,
    rt.status,
    rt.assigned_to,
    rt.unread,
    rt.last_activity_at,
    rt.subject,
    rt.last_read_by,
    c.email AS contact_email,
    c.status AS contact_status, -- Block 11400: Add contact status for filtering
    CASE 
      WHEN c.first_name IS NOT NULL AND c.last_name IS NOT NULL THEN c.first_name || ' ' || c.last_name
      WHEN c.first_name IS NOT NULL THEN c.first_name
      WHEN c.last_name IS NOT NULL THEN c.last_name
      ELSE NULL
    END AS contact_name,
    COALESCE(
      CASE 
        WHEN c.first_name IS NOT NULL AND c.last_name IS NOT NULL THEN c.first_name || ' ' || c.last_name
        WHEN c.first_name IS NOT NULL THEN c.first_name
        WHEN c.last_name IS NOT NULL THEN c.last_name
        ELSE NULL
      END,
      c.email,
      l.email
    ) AS display_name,
    COALESCE(c.email, l.email) AS display_email,
    camp.name AS campaign_name,
    -- Assigned user info (from profiles or auth.users)
    assigned_user.email AS assigned_to_email,
    COALESCE(
      assigned_profile.full_name,
      assigned_user.raw_user_meta_data->>'full_name',
      assigned_user.email
    ) AS assigned_to_name,
    assigned_profile.avatar_url AS assigned_to_avatar
  FROM public.reply_threads rt
  LEFT JOIN public.contacts c ON c.id = rt.contact_id
  LEFT JOIN public.leads l ON l.id = rt.lead_id
  LEFT JOIN public.campaigns camp ON camp.id = rt.campaign_id
  LEFT JOIN auth.users assigned_user ON assigned_user.id = rt.assigned_to
  LEFT JOIN public.profiles assigned_profile ON assigned_profile.id = rt.assigned_to;
  
  -- Grant access to view
  GRANT SELECT ON public.reply_inbox_summary TO authenticated;
END $$;

-- Add index on contact status for performance (if contacts table has status column)
CREATE INDEX IF NOT EXISTS idx_contacts_status 
  ON public.contacts(workspace_id, status) 
  WHERE status IS NOT NULL;

-- Add index on contact_tags for tag filtering performance
CREATE INDEX IF NOT EXISTS idx_contact_tags_workspace_tag_contact 
  ON public.contact_tags(workspace_id, tag, contact_id);

-- Add index on campaign_contacts for campaign filtering performance
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_campaign_contact 
  ON public.campaign_contacts(campaign_id, contact_id);

COMMENT ON VIEW public.reply_inbox_summary IS 'Block 11400: Enhanced inbox summary view with contact status for advanced filtering';






























































-- Block 274 — Playbooks v1
-- Prebuilt Sequences, Campaign Blueprints, One-Click "Load & Launch" Flows
-- Migration: 294_playbooks.sql

-- ================================================
-- 1) Create playbooks table
-- ================================================

CREATE TABLE IF NOT EXISTS public.playbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE, -- null = global
  slug text NOT NULL,        -- "saas-founder-meetings", "reactivation", etc.
  name text NOT NULL,
  description text,
  category text,             -- "Outbound", "Reactivation", "Expansion", etc.
  config jsonb NOT NULL,     -- see config structure below
  is_global boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(slug, workspace_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_playbooks_workspace ON public.playbooks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_playbooks_global ON public.playbooks(is_global) WHERE is_global = true;
CREATE INDEX IF NOT EXISTS idx_playbooks_category ON public.playbooks(category);
CREATE INDEX IF NOT EXISTS idx_playbooks_slug ON public.playbooks(slug);

-- ================================================
-- 2) Add playbook_id to campaigns table
-- ================================================

ALTER TABLE public.campaigns
ADD COLUMN IF NOT EXISTS playbook_id uuid REFERENCES public.playbooks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_playbook ON public.campaigns(playbook_id) WHERE playbook_id IS NOT NULL;

-- ================================================
-- 3) Updated_at trigger
-- ================================================

CREATE OR REPLACE FUNCTION public.set_playbook_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_playbooks_updated_at ON public.playbooks;
CREATE TRIGGER trg_playbooks_updated_at
  BEFORE UPDATE ON public.playbooks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_playbook_updated_at();

-- ================================================
-- 4) RLS Policies
-- ================================================

ALTER TABLE public.playbooks ENABLE ROW LEVEL SECURITY;

-- Helper function to check workspace membership (uses both workspace_members and team_members)
CREATE OR REPLACE FUNCTION public.is_workspace_member_for_playbooks(p_workspace_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.user_id = p_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.workspace_id = p_workspace_id
      AND tm.user_id = p_user_id
      AND tm.status = 'active'
  );
$$;

-- Helper function to check workspace admin/owner
CREATE OR REPLACE FUNCTION public.is_workspace_admin_for_playbooks(p_workspace_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.user_id = p_user_id
      AND wm.role IN ('owner', 'admin')
  ) OR EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.workspace_id = p_workspace_id
      AND tm.user_id = p_user_id
      AND tm.role IN ('owner', 'admin')
      AND tm.status = 'active'
  );
$$;

-- RLS: Read global and workspace playbooks
DROP POLICY IF EXISTS "read global and workspace playbooks" ON public.playbooks;
CREATE POLICY "read global and workspace playbooks"
ON public.playbooks
FOR SELECT
USING (
  is_global = true
  OR (
    workspace_id IS NOT NULL
    AND is_workspace_member_for_playbooks(workspace_id)
  )
);

-- RLS: Insert workspace playbooks (only Owner/Admin)
DROP POLICY IF EXISTS "insert workspace playbooks" ON public.playbooks;
CREATE POLICY "insert workspace playbooks"
ON public.playbooks
FOR INSERT
WITH CHECK (
  (workspace_id IS NULL AND is_global = true) -- Global playbooks can only be inserted by service role
  OR (
    workspace_id IS NOT NULL
    AND is_workspace_admin_for_playbooks(workspace_id)
  )
);

-- RLS: Update workspace playbooks (only Owner/Admin)
DROP POLICY IF EXISTS "update workspace playbooks" ON public.playbooks;
CREATE POLICY "update workspace playbooks"
ON public.playbooks
FOR UPDATE
USING (
  (workspace_id IS NULL AND is_global = true) -- Global playbooks can only be updated by service role
  OR (
    workspace_id IS NOT NULL
    AND is_workspace_admin_for_playbooks(workspace_id)
  )
)
WITH CHECK (
  (workspace_id IS NULL AND is_global = true)
  OR (
    workspace_id IS NOT NULL
    AND is_workspace_admin_for_playbooks(workspace_id)
  )
);

-- RLS: Delete workspace playbooks (only Owner/Admin)
DROP POLICY IF EXISTS "delete workspace playbooks" ON public.playbooks;
CREATE POLICY "delete workspace playbooks"
ON public.playbooks
FOR DELETE
USING (
  (workspace_id IS NULL AND is_global = true) -- Global playbooks can only be deleted by service role
  OR (
    workspace_id IS NOT NULL
    AND is_workspace_admin_for_playbooks(workspace_id)
  )
);

-- ================================================
-- 5) Grants
-- ================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.playbooks TO authenticated;

-- ================================================
-- 6) Seed Global Playbooks
-- ================================================

-- Playbook 1: Cold Outbound – SaaS Founders (Book Calls)
INSERT INTO public.playbooks (slug, name, description, category, is_global, workspace_id, config)
VALUES (
  'saas-founder-meetings',
  'Cold Outbound – SaaS Founders (Book Calls)',
  'Book intro calls with SaaS founders using a 3-email sequence focused on quick value and meeting requests.',
  'Outbound',
  true,
  NULL,
  '{
    "campaign": {
      "name": "SaaS Founder Meetings",
      "from_mailbox_hint": "founder@ or julian@",
      "objective": "Book intro calls with SaaS founders"
    },
    "templates": [
      {
        "step": 1,
        "subject": "Quick idea for {{company}}",
        "body": "<p>Hi {{first_name}},</p><p>I noticed {{company}} is solving {{problem_area}}. I have a quick idea that might help you {{value_prop}}.</p><p>Worth a 15-min call this week?</p><p>Best,<br>{{your_name}}</p>",
        "variants": [
          {
            "label": "Short",
            "weight": 60,
            "subject": "Quick idea for {{company}}",
            "body": "<p>Hi {{first_name}},</p><p>Quick idea for {{company}} — worth a 15-min call?</p><p>Best,<br>{{your_name}}</p>"
          },
          {
            "label": "Long",
            "weight": 40,
            "subject": "Quick idea for {{company}}",
            "body": "<p>Hi {{first_name}},</p><p>I noticed {{company}} is solving {{problem_area}}. I have a quick idea that might help you {{value_prop}}.</p><p>Worth a 15-min call this week?</p><p>Best,<br>{{your_name}}</p>"
          }
        ]
      },
      {
        "step": 2,
        "subject": "Re: quick idea for {{company}}",
        "body": "<p>Hi {{first_name}},</p><p>Following up on my note about {{company}}. Still worth a quick chat?</p><p>Best,<br>{{your_name}}</p>"
      },
      {
        "step": 3,
        "subject": "Last try — {{company}}",
        "body": "<p>Hi {{first_name}},</p><p>Last try — if this isn''t relevant, I''ll move on. But if you''re interested in {{value_prop}}, happy to chat.</p><p>Best,<br>{{your_name}}</p>"
      }
    ],
    "followup_flow": {
      "nodes": [
        {
          "id": "start",
          "type": "send_step",
          "step": 1
        },
        {
          "id": "check_reply",
          "type": "condition",
          "if": "labels.contains(''meeting_intent'')",
          "then": "stop",
          "else": "step2"
        },
        {
          "id": "step2",
          "type": "send_step",
          "step": 2
        },
        {
          "id": "check_reply2",
          "type": "condition",
          "if": "replied",
          "then": "stop",
          "else": "step3"
        },
        {
          "id": "step3",
          "type": "send_step",
          "step": 3
        }
      ]
    },
    "send_settings": {
      "respect_local_timezones": true,
      "business_hours": {
        "start": "09:00",
        "end": "17:00"
      },
      "avoid_weekends": true
    },
    "scoring": {
      "boost_meeting_intent": 10,
      "boost_reply": 5
    },
    "recommended_segment": {
      "hints": [
        "Industry: SaaS",
        "Employees: 11–200",
        "Title includes: Founder, Co-founder, CEO"
      ]
    }
  }'::jsonb
) ON CONFLICT (slug, workspace_id) DO NOTHING;

-- Playbook 2: Reactivation – Old Leads (Last Touch > 90 Days)
INSERT INTO public.playbooks (slug, name, description, category, is_global, workspace_id, config)
VALUES (
  'reactivation-old-leads',
  'Reactivation – Old Leads (Last Touch > 90 Days)',
  'Re-engage leads who haven''t been contacted in 90+ days with a light-touch reactivation sequence.',
  'Reactivation',
  true,
  NULL,
  '{
    "campaign": {
      "name": "Reactivation – Old Leads",
      "from_mailbox_hint": "your@email.com",
      "objective": "Re-activate old leads with light touch"
    },
    "templates": [
      {
        "step": 1,
        "subject": "Checking in on {{company}}",
        "body": "<p>Hi {{first_name}},</p><p>It''s been a while since we connected. I wanted to check in and see how things are going at {{company}}.</p><p>Anything I can help with?</p><p>Best,<br>{{your_name}}</p>",
        "variants": []
      },
      {
        "step": 2,
        "subject": "Re: Checking in on {{company}}",
        "body": "<p>Hi {{first_name}},</p><p>Just following up — wanted to make sure you saw my note. Happy to help if you need anything.</p><p>Best,<br>{{your_name}}</p>"
      }
    ],
    "followup_flow": {
      "nodes": [
        {
          "id": "start",
          "type": "send_step",
          "step": 1
        },
        {
          "id": "check_reply",
          "type": "condition",
          "if": "replied",
          "then": "stop",
          "else": "step2"
        },
        {
          "id": "step2",
          "type": "send_step",
          "step": 2
        }
      ]
    },
    "send_settings": {
      "respect_local_timezones": true,
      "business_hours": {
        "start": "09:00",
        "end": "17:00"
      },
      "avoid_weekends": true
    },
    "scoring": {
      "boost_reply": 5
    },
    "recommended_segment": {
      "hints": [
        "Last contacted: > 90 days ago",
        "Status: Not converted"
      ]
    }
  }'::jsonb
) ON CONFLICT (slug, workspace_id) DO NOTHING;

-- Playbook 3: Post-Demo Follow-Up – Get to Decision
INSERT INTO public.playbooks (slug, name, description, category, is_global, workspace_id, config)
VALUES (
  'post-demo-followup',
  'Post-Demo Follow-Up – Get to Decision',
  'Follow up after product demos to move prospects toward a decision with a focused 4-email sequence.',
  'Expansion',
  true,
  NULL,
  '{
    "campaign": {
      "name": "Post-Demo Follow-Up",
      "from_mailbox_hint": "sales@ or your@email.com",
      "objective": "Get to decision after demo"
    },
    "templates": [
      {
        "step": 1,
        "subject": "Following up on our demo",
        "body": "<p>Hi {{first_name}},</p><p>Thanks for taking the time to see {{product_name}} in action. I wanted to follow up and see if you have any questions.</p><p>What did you think?</p><p>Best,<br>{{your_name}}</p>",
        "variants": []
      },
      {
        "step": 2,
        "subject": "Re: Following up on our demo",
        "body": "<p>Hi {{first_name}},</p><p>Following up on our demo. I''ve attached a quick pricing sheet — let me know if you want to discuss next steps.</p><p>Best,<br>{{your_name}}</p>"
      },
      {
        "step": 3,
        "subject": "Quick question about {{company}}",
        "body": "<p>Hi {{first_name}},</p><p>Quick question — are you still evaluating solutions, or have you moved forward with something else?</p><p>Happy to help if you need anything.</p><p>Best,<br>{{your_name}}</p>"
      },
      {
        "step": 4,
        "subject": "Last check-in — {{company}}",
        "body": "<p>Hi {{first_name}},</p><p>Last check-in — if you''re still interested, I''m here. Otherwise, I''ll close the loop.</p><p>Best,<br>{{your_name}}</p>"
      }
    ],
    "followup_flow": {
      "nodes": [
        {
          "id": "start",
          "type": "send_step",
          "step": 1
        },
        {
          "id": "check_reply",
          "type": "condition",
          "if": "replied",
          "then": "stop",
          "else": "step2"
        },
        {
          "id": "step2",
          "type": "send_step",
          "step": 2
        },
        {
          "id": "check_reply2",
          "type": "condition",
          "if": "replied",
          "then": "stop",
          "else": "step3"
        },
        {
          "id": "step3",
          "type": "send_step",
          "step": 3
        },
        {
          "id": "check_reply3",
          "type": "condition",
          "if": "replied",
          "then": "stop",
          "else": "step4"
        },
        {
          "id": "step4",
          "type": "send_step",
          "step": 4
        }
      ]
    },
    "send_settings": {
      "respect_local_timezones": true,
      "business_hours": {
        "start": "09:00",
        "end": "17:00"
      },
      "avoid_weekends": true
    },
    "scoring": {
      "boost_reply": 5,
      "boost_meeting_intent": 10
    },
    "recommended_segment": {
      "hints": [
        "Has completed demo",
        "Status: In evaluation"
      ]
    }
  }'::jsonb
) ON CONFLICT (slug, workspace_id) DO NOTHING;

-- Playbook 4: Nurture – Light Touch Check-Ins
INSERT INTO public.playbooks (slug, name, description, category, is_global, workspace_id, config)
VALUES (
  'nurture-light-touch',
  'Nurture – Light Touch Check-Ins',
  'Keep warm leads engaged with periodic value-driven check-ins over a longer timeline.',
  'Nurture',
  true,
  NULL,
  '{
    "campaign": {
      "name": "Nurture – Light Touch",
      "from_mailbox_hint": "your@email.com",
      "objective": "Light touch check-ins to stay top of mind"
    },
    "templates": [
      {
        "step": 1,
        "subject": "Quick check-in — {{company}}",
        "body": "<p>Hi {{first_name}},</p><p>Just checking in to see how things are going at {{company}}. Hope all is well!</p><p>Best,<br>{{your_name}}</p>",
        "variants": []
      },
      {
        "step": 2,
        "subject": "Thought you might find this interesting",
        "body": "<p>Hi {{first_name}},</p><p>Found this article about {{topic}} and thought of {{company}}. Thought you might find it interesting.</p><p>Best,<br>{{your_name}}</p>"
      }
    ],
    "followup_flow": {
      "nodes": [
        {
          "id": "start",
          "type": "send_step",
          "step": 1
        },
        {
          "id": "wait_30_days",
          "type": "wait",
          "wait_days": 30
        },
        {
          "id": "step2",
          "type": "send_step",
          "step": 2
        }
      ]
    },
    "send_settings": {
      "respect_local_timezones": true,
      "business_hours": {
        "start": "09:00",
        "end": "17:00"
      },
      "avoid_weekends": true
    },
    "scoring": {
      "boost_reply": 3
    },
    "recommended_segment": {
      "hints": [
        "Status: Warm lead",
        "Not ready to buy yet"
      ]
    }
  }'::jsonb
) ON CONFLICT (slug, workspace_id) DO NOTHING;

-- ================================================
-- 7) Comments for documentation
-- ================================================

COMMENT ON TABLE public.playbooks IS 'Prebuilt campaign sequences (playbooks) that can be instantiated into campaigns';
COMMENT ON COLUMN public.playbooks.workspace_id IS 'NULL for global playbooks, workspace_id for workspace-specific playbooks';
COMMENT ON COLUMN public.playbooks.slug IS 'URL-friendly identifier (e.g., "saas-founder-meetings")';
COMMENT ON COLUMN public.playbooks.config IS 'JSONB config containing campaign settings, templates, follow-up flow, send settings, scoring, and recommended segment hints';
COMMENT ON COLUMN public.playbooks.is_global IS 'True for global playbooks available to all workspaces';
COMMENT ON COLUMN public.campaigns.playbook_id IS 'Reference to the playbook this campaign was created from';









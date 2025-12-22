-- Block 20280 — Lead Tags & Service Types v1
-- Account-level tag library and conversation tagging system

-- ============================================================================
-- PART 1 — Master tag library per account
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.lead_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL,
  label TEXT NOT NULL,          -- e.g. 'Full replacement', 'Hail damage', 'Gutters'
  color TEXT,                   -- optional e.g. 'red', 'amber', 'green', etc.
  category TEXT,                -- 'service_type', 'damage_type', 'priority', etc
  is_active BOOLEAN DEFAULT TRUE,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_tags_account
ON public.lead_tags (account_id, is_active);

CREATE INDEX IF NOT EXISTS idx_lead_tags_category
ON public.lead_tags (account_id, category, is_active);

-- ============================================================================
-- PART 2 — Many-to-many between conversations (threads) and tags
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.conversation_tags (
  conversation_id UUID NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.lead_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (conversation_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_tags_conversation
ON public.conversation_tags (conversation_id);

CREATE INDEX IF NOT EXISTS idx_conversation_tags_tag
ON public.conversation_tags (tag_id);

-- ============================================================================
-- PART 3 — RLS Policies
-- ============================================================================

ALTER TABLE public.lead_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_tags ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view tags for accounts they have access to
CREATE POLICY "Users can view tags for their accounts"
ON public.lead_tags
FOR SELECT
USING (
  account_id IN (
    SELECT account_id FROM public.account_members WHERE user_id = auth.uid() AND is_active = true
  )
  OR account_id IN (
    SELECT id FROM public.accounts WHERE owner_user_id = auth.uid()
  )
  OR account_id = auth.uid() -- Fallback for single-user accounts
);

-- RLS: Users can create tags for accounts they have access to
CREATE POLICY "Users can create tags for their accounts"
ON public.lead_tags
FOR INSERT
WITH CHECK (
  account_id IN (
    SELECT account_id FROM public.account_members WHERE user_id = auth.uid() AND is_active = true
  )
  OR account_id IN (
    SELECT id FROM public.accounts WHERE owner_user_id = auth.uid()
  )
  OR account_id = auth.uid() -- Fallback for single-user accounts
);

-- RLS: Users can update tags for accounts they have access to
CREATE POLICY "Users can update tags for their accounts"
ON public.lead_tags
FOR UPDATE
USING (
  account_id IN (
    SELECT account_id FROM public.account_members WHERE user_id = auth.uid() AND is_active = true
  )
  OR account_id IN (
    SELECT id FROM public.accounts WHERE owner_user_id = auth.uid()
  )
  OR account_id = auth.uid() -- Fallback for single-user accounts
);

-- RLS: Users can view conversation tags for threads they have access to
CREATE POLICY "Users can view conversation tags for accessible threads"
ON public.conversation_tags
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.inbox_threads it
    JOIN public.campaigns c ON c.id = it.campaign_id
    WHERE it.id = conversation_tags.conversation_id
    AND (
      c.user_id = auth.uid()
      OR c.account_id IN (
        SELECT account_id FROM public.account_members WHERE user_id = auth.uid() AND is_active = true
      )
      OR c.account_id IN (
        SELECT id FROM public.accounts WHERE owner_user_id = auth.uid()
      )
      OR c.account_id = auth.uid()
      OR c.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
      )
    )
  )
);

-- RLS: Users can manage conversation tags for threads they have access to
CREATE POLICY "Users can manage conversation tags for accessible threads"
ON public.conversation_tags
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.inbox_threads it
    JOIN public.campaigns c ON c.id = it.campaign_id
    WHERE it.id = conversation_tags.conversation_id
    AND (
      c.user_id = auth.uid()
      OR c.account_id IN (
        SELECT account_id FROM public.account_members WHERE user_id = auth.uid() AND is_active = true
      )
      OR c.account_id IN (
        SELECT id FROM public.accounts WHERE owner_user_id = auth.uid()
      )
      OR c.account_id = auth.uid()
      OR c.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
      )
    )
  )
);


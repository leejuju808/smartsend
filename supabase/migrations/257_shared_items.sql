-- Block 242 — Team Sharing v1
-- Share Campaigns, Segments, Templates, & Lead Views With Teammates

-- Create shared_items table
CREATE TABLE IF NOT EXISTS public.shared_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('campaign', 'segment', 'template', 'lead_view')),
  item_id uuid NOT NULL,
  access text NOT NULL DEFAULT 'view' CHECK (access IN ('view', 'edit')),
  created_at timestamptz DEFAULT now(),
  
  -- Prevent duplicate shares
  UNIQUE(owner_id, target_user_id, item_type, item_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_shared_items_target_user ON public.shared_items(target_user_id, item_type);
CREATE INDEX IF NOT EXISTS idx_shared_items_owner ON public.shared_items(owner_id, item_type);
CREATE INDEX IF NOT EXISTS idx_shared_items_item ON public.shared_items(item_type, item_id);

-- Enable RLS
ALTER TABLE public.shared_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view shared items where they are the owner or target
CREATE POLICY "shared_items_select_own_or_target" ON public.shared_items
  FOR SELECT USING (
    owner_id = auth.uid() OR target_user_id = auth.uid()
  );

-- Users can create shares for items they own
CREATE POLICY "shared_items_insert_own" ON public.shared_items
  FOR INSERT WITH CHECK (owner_id = auth.uid());

-- Owners can update/delete their shares
CREATE POLICY "shared_items_update_own" ON public.shared_items
  FOR UPDATE USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "shared_items_delete_own" ON public.shared_items
  FOR DELETE USING (owner_id = auth.uid());











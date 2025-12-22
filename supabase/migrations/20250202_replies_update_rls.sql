-- Add RLS policy for replies updates
-- Allow owners to update replies in their workspace

-- Drop existing policy if exists to recreate
drop policy if exists "reply_update_same_workspace" on public.replies;

-- Allow authenticated users to update replies for leads in their workspace
create policy "reply_update_same_workspace" on public.replies
  for update using (
    exists (
      select 1 from public.leads l
      where l.id = replies.lead_id
      and (
        l.owner_id = auth.uid()
        or exists (
          select 1 from public.workspace_members wm
          where wm.workspace_id = l.workspace_id
          and wm.user_id = auth.uid()
        )
      )
    )
  );


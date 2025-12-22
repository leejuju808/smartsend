-- Block 10200: SmartSend Team Campaign Sharing v1
-- Per-campaign sharing with roles (owner, editor, viewer)

create table if not exists smartsend_campaign_shares (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer', -- 'viewer' | 'editor'
  created_at timestamptz default now(),
  unique (campaign_id, user_id)
);

create index if not exists idx_smartsend_campaign_shares_campaign on smartsend_campaign_shares (campaign_id);
create index if not exists idx_smartsend_campaign_shares_user on smartsend_campaign_shares (user_id);

-- Enable RLS
alter table smartsend_campaign_shares enable row level security;

-- RLS Policies
-- Users can see shares for campaigns they have access to
create policy "campaign_shares_select_accessible" on smartsend_campaign_shares
  for select
  using (
    -- Campaign owner can see all shares
    exists (
      select 1 from campaigns c
      where c.id = campaign_id and c.user_id = auth.uid()
    )
    or
    -- Shared users can see shares for campaigns they're shared on
    user_id = auth.uid()
    or
    exists (
      select 1 from smartsend_campaign_shares s
      where s.campaign_id = smartsend_campaign_shares.campaign_id
      and s.user_id = auth.uid()
    )
  );

-- Only campaign owner can insert/update/delete shares
create policy "campaign_shares_manage_owner" on smartsend_campaign_shares
  for all
  using (
    exists (
      select 1 from campaigns c
      where c.id = campaign_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from campaigns c
      where c.id = campaign_id and c.user_id = auth.uid()
    )
  );



































































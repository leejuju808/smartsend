-- RLS policies (secure by team)

-- Campaigns
alter table public.campaigns enable row level security;

drop policy if exists campaigns_read on public.campaigns;
create policy campaigns_read on public.campaigns
for select using (
  exists (select 1 from public.workspace_members wm where wm.workspace_id = campaigns.workspace_id and wm.user_id = auth.uid())
  or exists (select 1 from public.campaign_members cm where cm.campaign_id = campaigns.id and cm.user_id = auth.uid())
);

drop policy if exists campaigns_insert on public.campaigns;
create policy campaigns_insert on public.campaigns
for insert with check (
  exists (select 1 from public.workspace_members wm where wm.workspace_id = campaigns.workspace_id and wm.user_id = auth.uid() and wm.role in ('owner','admin','member'))
);

drop policy if exists campaigns_update on public.campaigns;
create policy campaigns_update on public.campaigns
for update using (
  exists (select 1 from public.workspace_members wm where wm.workspace_id = campaigns.workspace_id and wm.user_id = auth.uid() and wm.role in ('owner','admin'))
  or exists (select 1 from public.campaign_members cm where cm.campaign_id = campaigns.id and cm.user_id = auth.uid() and cm.role='admin')
);

-- Leads (scoped by workspace)
alter table public.leads enable row level security;

drop policy if exists leads_read on public.leads;
create policy leads_read on public.leads
for select using (
  exists (select 1 from public.workspace_members wm where wm.workspace_id = leads.workspace_id and wm.user_id = auth.uid())
);

drop policy if exists leads_write on public.leads;
create policy leads_write on public.leads
for insert with check (
  exists (select 1 from public.workspace_members wm where wm.workspace_id = leads.workspace_id and wm.user_id = auth.uid() and wm.role in ('owner','admin','member'))
);

drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads
for update using (
  exists (select 1 from public.workspace_members wm where wm.workspace_id = leads.workspace_id and wm.user_id = auth.uid() and wm.role in ('owner','admin','member'))
);

-- Email messages (join to lead)
alter table public.email_messages enable row level security;

drop policy if exists emails_read on public.email_messages;
create policy emails_read on public.email_messages
for select using (
  exists (
    select 1 from public.leads ld
    join public.workspace_members wm on wm.workspace_id = ld.workspace_id
    where ld.id = email_messages.lead_id and wm.user_id = auth.uid()
  )
);

drop policy if exists emails_insert_out on public.email_messages;
create policy emails_insert_out on public.email_messages
for insert with check (
  exists (
    select 1 from public.leads ld
    join public.workspace_members wm on wm.workspace_id = ld.workspace_id
    where ld.id = email_messages.lead_id and wm.user_id = auth.uid()
  )
);

drop policy if exists emails_update on public.email_messages;
create policy emails_update on public.email_messages
for update using (
  exists (
    select 1 from public.leads ld
    join public.workspace_members wm on wm.workspace_id = ld.workspace_id
    where ld.id = email_messages.lead_id and wm.user_id = auth.uid()
  )
);

-- Campaign members table
alter table public.campaign_members enable row level security;

drop policy if exists cm_read on public.campaign_members;
create policy cm_read on public.campaign_members
for select using (
  exists (select 1 from public.campaigns c where c.id = campaign_members.campaign_id)
  and (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = (select c.workspace_id from public.campaigns c where c.id=campaign_members.campaign_id) and wm.user_id = auth.uid())
    or campaign_members.user_id = auth.uid()
  )
);

drop policy if exists cm_manage on public.campaign_members;
create policy cm_manage on public.campaign_members
for all using (
  exists (
    select 1 from public.campaigns c
    where c.id = campaign_members.campaign_id
      and (
        exists (select 1 from public.workspace_members wm where wm.workspace_id=c.workspace_id and wm.user_id=auth.uid() and wm.role in ('owner','admin'))
        or exists (select 1 from public.campaign_members cm where cm.campaign_id=c.id and cm.user_id=auth.uid() and cm.role='admin')
      )
  )
)
with check (true);


-- CAMPAIGN_CONTACTS link table: campaigns ↔ contacts
create table if not exists public.campaign_contacts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_campaign_contacts_campaign on public.campaign_contacts (campaign_id);
create index if not exists idx_campaign_contacts_contact on public.campaign_contacts (contact_id);

-- Optional but helpful to prevent duplicate assignments
create unique index if not exists uniq_campaign_contact on public.campaign_contacts (campaign_id, contact_id);

alter table public.campaign_contacts enable row level security;

-- Allow a user to access rows for campaigns they own
create policy if not exists "campaign_contacts_select_own" on public.campaign_contacts
  for select using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_contacts.campaign_id and c.user_id = auth.uid()
    )
  );

create policy if not exists "campaign_contacts_insert_own" on public.campaign_contacts
  for insert with check (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_contacts.campaign_id and c.user_id = auth.uid()
    )
  );

create policy if not exists "campaign_contacts_update_own" on public.campaign_contacts
  for update using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_contacts.campaign_id and c.user_id = auth.uid()
    )
  );

create policy if not exists "campaign_contacts_delete_own" on public.campaign_contacts
  for delete using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_contacts.campaign_id and c.user_id = auth.uid()
    )
  );


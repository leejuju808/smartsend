-- Create email_replies table to store inbound replies linked to campaign_contacts
create table if not exists public.email_replies (
  id uuid default gen_random_uuid() primary key,
  campaign_contact_id uuid references public.campaign_contacts(id) on delete cascade,
  from_email text not null,
  subject text,
  body text,
  received_at timestamp with time zone default now()
);

create index if not exists email_replies_campaign_contact_id_idx on public.email_replies(campaign_contact_id);

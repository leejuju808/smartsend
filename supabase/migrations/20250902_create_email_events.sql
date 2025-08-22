-- Track opens
create table if not exists public.email_opens (
  id uuid default gen_random_uuid() primary key,
  campaign_contact_id uuid references public.campaign_contacts(id) on delete cascade,
  opened_at timestamp with time zone default now()
);

-- Track clicks
create table if not exists public.email_clicks (
  id uuid default gen_random_uuid() primary key,
  campaign_contact_id uuid references public.campaign_contacts(id) on delete cascade,
  url text not null,
  clicked_at timestamp with time zone default now()
);

create index if not exists email_opens_cc_idx on public.email_opens(campaign_contact_id);
create index if not exists email_clicks_cc_idx on public.email_clicks(campaign_contact_id);


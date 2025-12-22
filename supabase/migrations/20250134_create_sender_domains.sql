-- Create sender_domains table for email deliverability verification
create table if not exists public.sender_domains (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique,
  provider text default 'brevo', -- or 'mailersend'
  dkim_selector text default 'mail',
  tracking_subdomain text default 't',
  verified boolean default false,
  last_check jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create updated_at trigger function if it doesn't exist
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin 
  new.updated_at = now(); 
  return new; 
end $$;

-- Create trigger for updated_at
drop trigger if exists trg_sender_domains_touch on public.sender_domains;
create trigger trg_sender_domains_touch 
  before update on public.sender_domains
  for each row execute function public.touch_updated_at();

-- Add RLS policies
alter table public.sender_domains enable row level security;

-- Allow users to view domains (for verification status)
create policy "Users can view sender domains" on public.sender_domains
  for select using (true);

-- Allow authenticated users to insert/update their own domains
create policy "Users can manage sender domains" on public.sender_domains
  for all using (auth.role() = 'authenticated');

-- Create index for fast domain lookups
create index if not exists idx_sender_domains_domain on public.sender_domains(domain);
create index if not exists idx_sender_domains_verified on public.sender_domains(verified); 
-- Create click_actions table for dynamic click-based automation
create table if not exists public.click_actions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  match_url text not null,
  action text not null,   -- tag|followup_campaign|suppress
  value text,             -- e.g. tag name, campaign_id to start
  created_at timestamptz default now()
);

create index if not exists ca_campaign_idx on public.click_actions (campaign_id);

-- Add tags column to contacts table if not exists
alter table public.contacts add column if not exists tags jsonb default '[]'::jsonb;

-- Create helper RPC function for adding tags to contacts
create or replace function public.add_contact_tag(p_email text, p_tag text)
returns void as $$
begin
  update public.contacts
  set tags = case
    when not (tags ? p_tag) then tags || to_jsonb(array[p_tag])
    else tags
  end
  where lower(email) = lower(p_email);
end;
$$ language plpgsql;

-- Enable RLS on click_actions
alter table public.click_actions enable row level security;

-- Create policy for click_actions (users can only see/modify their own)
create policy "click_actions_own" on public.click_actions
  for all using (
    exists (
      select 1 from public.campaigns c
      where c.id = click_actions.campaign_id and c.user_id = auth.uid()
    )
  ); 
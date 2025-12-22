-- Create email_stats table for campaign analytics
create table if not exists email_stats (
  id uuid primary key default uuid_generate_v4(),
  campaign_name text not null,
  opens int default 0,
  clicks int default 0,
  deliveries int default 0,
  created_at timestamp default now()
);

-- Add RLS policies
alter table email_stats enable row level security;

-- Allow users to read their own stats (assuming user_id will be added later)
-- For now, allow all authenticated users to read
create policy "Allow authenticated users to read email_stats" on email_stats
  for select using (auth.role() = 'authenticated');

-- Allow users to insert their own stats
create policy "Allow authenticated users to insert email_stats" on email_stats
  for insert with check (auth.role() = 'authenticated');

-- Allow users to update their own stats
create policy "Allow authenticated users to update email_stats" on email_stats
  for update using (auth.role() = 'authenticated');

-- Add indexes for better performance
create index if not exists idx_email_stats_campaign_name on email_stats(campaign_name);
create index if not exists idx_email_stats_created_at on email_stats(created_at);
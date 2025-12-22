-- Create notifications table
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  type text not null, -- invite | quota | campaign | system
  title text not null,
  message text not null,
  read boolean default false,
  created_at timestamptz default now()
);

-- Enable row level security
alter table notifications enable row level security;

-- Create policies
create policy "allow read" on notifications for select using (true);
create policy "allow insert" on notifications for insert with check (true);

-- Create index for better performance
create index if not exists notifications_user_email_idx on notifications(user_email);
create index if not exists notifications_created_at_idx on notifications(created_at desc);
create index if not exists notifications_read_idx on notifications(read);
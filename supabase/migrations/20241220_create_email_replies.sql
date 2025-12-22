-- Create email_replies table
create table if not exists email_replies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  from_email text not null,
  subject text,
  body text not null,
  classification text,
  sentiment text,
  follow_up_required boolean default false,
  received_at timestamptz default now(),
  analyzed_at timestamptz
);

-- Enable RLS
alter table email_replies enable row level security;

-- Create policy for all operations
create policy "allow all read insert update" on email_replies for all using (true) with check (true);
-- Create contacts table and helpful index
create table if not exists contacts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text,
  email text not null,
  company text,
  created_at timestamp with time zone default now()
);

-- helpful index for fast queries
create index if not exists contacts_user_id_idx on contacts(user_id);


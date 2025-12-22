-- Create email_replies table
create table if not exists email_replies (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references threads(id) on delete cascade,
  sender text,
  subject text,
  snippet text,
  received_at timestamptz default now(),
  is_read boolean default false
);

-- Create indexes for better query performance
create index if not exists idx_email_replies_thread_id on email_replies(thread_id);
create index if not exists idx_email_replies_received_at on email_replies(received_at desc);
create index if not exists idx_email_replies_is_read on email_replies(is_read);

-- Enable RLS
alter table email_replies enable row level security;

-- RLS policy: allow authenticated users to read replies
-- Note: Adjust this policy based on your specific authorization requirements
drop policy if exists "users_select_own_replies" on email_replies;
create policy "users_select_own_replies" on email_replies
  for select to authenticated
  using (true);

-- Service role can manage all replies (for webhooks/system processes)
create policy "service_role_manages_replies" on email_replies
  for all to service_role
  using (true) with check (true);

-- Enable realtime for email_replies
do $$ begin
  alter publication supabase_realtime add table public.email_replies;
exception when duplicate_object then null; end $$;


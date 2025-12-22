-- Enable RLS and add safe policies for email_replies
-- Only the owner can read their rows (Edge Function will write with the service role)

alter table email_replies enable row level security;

-- Drop existing policy if it exists
drop policy if exists "Users can read their own replies" on email_replies;

create policy "Users can read their own replies"
on email_replies for select
to authenticated
using (user_id = auth.uid());

-- Optional index for faster loads
create index if not exists email_replies_user_created_idx
on email_replies (user_id, created_at desc);


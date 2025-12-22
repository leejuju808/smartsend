-- Add RPC functions for thread management
-- inc_unread_for_thread: Increment unread count for a thread
-- mark_thread_read: Mark all replies in a thread as read and reset unread_count

-- Create function to increment unread count
create or replace function inc_unread_for_thread(p_thread_id uuid)
returns void 
language plpgsql 
security definer
as $$
begin
  update threads 
  set unread_count = greatest(unread_count + 1, 0)
  where id = p_thread_id;
end; 
$$;

-- Create function to mark thread as read
create or replace function mark_thread_read(p_thread_id uuid)
returns void 
language plpgsql 
security definer
as $$
begin
  -- Mark all replies in the thread as read
  update replies 
  set is_read = true 
  where thread_id = p_thread_id and is_read = false;
  
  -- Reset unread count to 0
  update threads 
  set unread_count = 0 
  where id = p_thread_id;
end; 
$$;

-- Grant execute permissions
grant execute on function inc_unread_for_thread(uuid) to authenticated, service_role;
grant execute on function mark_thread_read(uuid) to authenticated, service_role;

-- Add is_read column to replies if it doesn't exist
alter table replies
  add column if not exists is_read boolean not null default false,
  add column if not exists body text,
  add column if not exists is_reply boolean not null default false;

-- Add index for is_read lookups
create index if not exists idx_replies_thread_read on replies(thread_id, is_read, created_at desc);


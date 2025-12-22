-- Create or replace function to get reply threads for a user
create or replace function public.get_reply_threads(search text default null, status text default null)
returns table (
  id uuid,
  lead_email text,
  last_message text,
  updated_at timestamptz
)
language sql
as $$
  select 
    t.id, 
    l.email as lead_email,
    (select body_text from messages m where m.thread_id = t.id order by created_at desc limit 1) as last_message,
    t.last_message_at as updated_at
  from threads t
  join leads l on l.id = t.lead_id
  where (get_reply_threads.status is null)
    and (get_reply_threads.search is null or l.email ilike '%' || get_reply_threads.search || '%')
  order by t.last_message_at desc;
$$;

-- Create or replace function to get all messages in a thread
create or replace function public.get_thread(thread_id uuid)
returns table (
  id uuid,
  direction text,
  body text,
  created_at timestamptz
)
language sql
as $$
  select 
    id, 
    direction, 
    coalesce(body_html, body_text) as body, 
    created_at
  from messages
  where thread_id = get_thread.thread_id
  order by created_at asc;
$$;

-- Grant execute permissions
grant execute on function public.get_reply_threads(text, text) to authenticated;
grant execute on function public.get_thread(uuid) to authenticated;


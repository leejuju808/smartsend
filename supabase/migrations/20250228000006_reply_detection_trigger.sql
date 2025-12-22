-- Create trigger function to call replyDetection edge function when inbound_emails are inserted
-- This enables automatic reply detection without user intervention

-- Ensure pg_net extension is available for HTTP requests
create extension if not exists pg_net;

-- Add thread_id column to inbound_emails if it doesn't exist
alter table public.inbound_emails
  add column if not exists thread_id text;

-- Create function to trigger reply detection
create or replace function handle_reply_detection()
returns trigger
language plpgsql
security definer
as $$
declare
  func_url text;
  payload jsonb;
  edge_func_result jsonb;
begin
  -- Build the edge function URL
  func_url := coalesce(
    current_setting('app.supabase_url', true),
    current_setting('app.public_supabase_url', true),
    'https://' || current_setting('app.project_ref', true) || '.supabase.co'
  ) || '/functions/v1/replyDetection';

  -- Build payload with threadId, from, and body
  payload := jsonb_build_object(
    'threadId', NEW.thread_id,
    'from', NEW.from_email,
    'body', coalesce(NEW.body_text, NEW.body_html, '')
  );

  -- Call Edge Function via HTTP if pg_net is available
  if exists (select 1 from pg_extension where extname = 'pg_net') then
    -- Fire and forget - don't wait for response
    perform net.http_post(
      url := func_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(
          current_setting('app.supabase_service_role_key', true),
          current_setting('app.service_role_key', true)
        )
      ),
      body := payload
    );
  else
    -- Log warning if pg_net is not available
    raise warning 'pg_net extension not available, cannot call replyDetection edge function';
  end if;

  return NEW;
exception
  when others then
    -- Log error but don't fail the insert
    raise warning 'Failed to trigger replyDetection: %', sqlerrm;
    return NEW;
end;
$$;

-- Drop existing trigger if exists
drop trigger if exists handle_reply_detection on public.inbound_emails;

-- Create trigger that calls the function after insert
create trigger handle_reply_detection
after insert on public.inbound_emails
for each row
execute function handle_reply_detection();


-- Create replies table for auto-reply detection
-- This table stores email replies that need to be analyzed by AI

-- Enable uuid extension if needed
create extension if not exists "uuid-ossp";

create table if not exists public.replies (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid references public.leads(id) on delete cascade,
  subject text,
  body text,
  is_reply boolean default false,
  created_at timestamptz default now()
);

-- Create index for faster lookups by lead_id
create index if not exists idx_replies_lead_id on public.replies(lead_id);

-- Create index for created_at for sorting
create index if not exists idx_replies_created_at on public.replies(created_at desc);

-- Enable RLS
alter table public.replies enable row level security;

-- RLS policy: allow authenticated users to read replies
drop policy if exists "users_select_replies" on public.replies;
create policy "users_select_replies" on public.replies
  for select to authenticated
  using (true);

-- Service role can manage all replies (for webhooks/system processes)
drop policy if exists "service_role_manages_replies" on public.replies;
create policy "service_role_manages_replies" on public.replies
  for all to service_role
  using (true) with check (true);

-- Enable pg_net extension for HTTP requests
create extension if not exists pg_net;

-- Create function to trigger reply detection edge function
create or replace function public.handle_new_reply()
returns trigger
language plpgsql
security definer
as $$
declare
  func_url text;
  payload jsonb;
begin
  -- Build the edge function URL
  func_url := coalesce(
    current_setting('app.supabase_url', true),
    current_setting('app.public_supabase_url', true),
    'https://' || current_setting('app.project_ref', true) || '.supabase.co'
  ) || '/functions/v1/detect-reply';
  
  -- Build payload with reply_id
  payload := jsonb_build_object('reply_id', new.id);
  
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
    raise warning 'pg_net extension not available, cannot call detect-reply function';
  end if;
  
  return new;
exception
  when others then
    -- Log error but don't fail the insert
    raise warning 'Failed to trigger detect-reply: %', sqlerrm;
    return new;
end;
$$;

-- Drop existing trigger if exists
drop trigger if exists on_reply_insert on public.replies;

-- Create trigger that calls the function after insert
create trigger on_reply_insert
after insert on public.replies
for each row
execute function public.handle_new_reply();


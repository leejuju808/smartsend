-- Add Gmail push webhook support to existing email_replies table

-- Add missing columns if they don't exist
alter table public.email_replies 
  add column if not exists workspace_id uuid,
  add column if not exists lead_id uuid references public.leads(id) on delete cascade,
  add column if not exists provider_message_id text,
  add column if not exists thread_id text,
  add column if not exists raw jsonb,
  add column if not exists updated_at timestamptz default now();

-- Create indexes if they don't exist
create index if not exists idx_email_replies_lead on public.email_replies(lead_id);
create index if not exists idx_email_replies_workspace on public.email_replies(workspace_id);
create index if not exists idx_email_replies_received_at on public.email_replies(received_at desc);
create index if not exists idx_email_replies_from_email on public.email_replies(from_email);

-- Enable RLS if not already enabled
alter table public.email_replies enable row level security;

-- Drop existing policy if exists to recreate
drop policy if exists "email_replies read within workspace" on public.email_replies;

-- RLS policy: allow authenticated users to read replies in their workspace
create policy "email_replies read within workspace"
on public.email_replies for select
to authenticated
using (
  workspace_id is null or
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = email_replies.workspace_id
    and wm.user_id = auth.uid()
  )
);

-- Drop existing policy if exists
drop policy if exists "email_replies service insert" on public.email_replies;

-- RLS policy: allow service role to insert (for webhooks)
create policy "email_replies service insert"
on public.email_replies for insert
to service_role
with check (true);

-- Create or replace trigger function to forward new replies to the Edge Function
create or replace function handle_new_email_reply()
returns trigger as $$
declare
  func_url text;
  payload jsonb;
begin
  -- Only trigger if we have lead_id
  if NEW.lead_id is null then
    return NEW;
  end if;
  
  -- Get the Edge Function URL from environment or use default
  func_url := coalesce(
    current_setting('app.supabase_url', true),
    current_setting('app.public_supabase_url', true)
  ) || '/functions/v1/ai-reply-detect';
  
  -- Build payload
  payload := jsonb_build_object(
    'lead_id', NEW.lead_id,
    'email_body', NEW.body,
    'subject', NEW.subject,
    'from_email', NEW.from_email,
    'workspace_id', NEW.workspace_id,
    'reply_id', NEW.id
  );
  
  -- Check if pg_net extension is available
  -- Note: You may need to enable pg_net extension first with: CREATE EXTENSION IF NOT EXISTS pg_net;
  if exists (select 1 from pg_extension where extname = 'pg_net') then
    -- Call Edge Function via HTTP
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
  end if;
  
  return NEW;
exception
  when others then
    -- Log error but don't fail the insert
    raise warning 'Failed to trigger ai-reply-detect: %', sqlerrm;
    return NEW;
end;
$$ language plpgsql security definer;

-- Drop existing trigger if exists
drop trigger if exists handle_reply on public.email_replies;

-- Create trigger
create trigger handle_reply after insert on public.email_replies
for each row execute function handle_new_email_reply();

-- Create or replace view for easy querying
create or replace view email_replies_with_leads as
select 
  er.*,
  l.name as lead_name,
  l.email as lead_email,
  l.phone as lead_phone,
  w.name as workspace_name
from public.email_replies er
left join public.leads l on l.id = er.lead_id
left join public.workspaces w on w.id = er.workspace_id;

-- Grant access to the view
grant select on email_replies_with_leads to authenticated; 
-- Enable Realtime for email_logs table
-- This allows the table to broadcast changes to subscribed clients

-- Add the email_logs table to the realtime publication
alter publication supabase_realtime add table public.email_logs;
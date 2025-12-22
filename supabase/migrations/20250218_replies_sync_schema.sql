-- Add columns for inbound reply sync (Gmail/Outlook pull)
-- Adds fields needed for storing full reply data and human detection

alter table public.replies
  add column if not exists body_text text,
  add column if not exists body_html text,
  add column if not exists message_id text,
  add column if not exists thread_id text,
  add column if not exists is_human boolean default false,
  add column if not exists to_email text,
  add column if not exists campaign_id uuid references campaigns(id) on delete set null,
  add column if not exists status text default 'open' check (status in ('open', 'handled'));

-- Create indexes for efficient lookups
create index if not exists idx_replies_message_id on public.replies(message_id);
create index if not exists idx_replies_thread_id on public.replies(thread_id);
create index if not exists idx_replies_is_human on public.replies(is_human);
create index if not exists idx_replies_to_email on public.replies(to_email);


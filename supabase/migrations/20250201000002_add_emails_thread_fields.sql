-- Add thread and sender fields to emails table
-- Adds is_incoming, thread_id (uuid), and sender columns for thread-based inbox view

alter table public.emails
add column if not exists is_incoming boolean default false,
add column if not exists thread_id uuid,
add column if not exists sender text;

-- Add index on thread_id for efficient thread lookups
create index if not exists idx_emails_thread_id_uuid on public.emails(thread_id);

-- Add index on is_incoming for filtering
create index if not exists idx_emails_is_incoming on public.emails(is_incoming);


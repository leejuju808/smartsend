-- Add threading fields to emails table if they don't exist
-- These fields support the reply thread view and composer
-- Note: "from" and "to" are reserved keywords, so we quote them

alter table if exists public.emails 
  add column if not exists "from" text,
  add column if not exists "to" text,
  add column if not exists "body" text,
  add column if not exists "direction" text check ("direction" in ('inbound', 'outbound'));

-- Add index for threading queries
create index if not exists idx_emails_thread_id_direction 
  on public.emails(thread_id, direction);

-- Update thread_id to be a self-referencing FK (optional, for better data integrity)
-- Note: This assumes thread_id can reference emails.id
-- If thread_id is text-based (e.g., Gmail thread ID), skip the FK constraint
-- alter table if exists public.emails 
--   add constraint fk_emails_thread_id 
--   foreign key (thread_id) references public.emails(id) on delete set null;

-- Add columns if they don't exist (adjust types as per your schema)
alter table public.messages
  add column if not exists email_from citext,
  add column if not exists email_to citext,
  add column if not exists subject text,
  add column if not exists body_text text,
  add column if not exists body_html text,
  add column if not exists direction text,
  add column if not exists transport_message_id text,
  add column if not exists bounce boolean default false;

create index if not exists idx_messages_email_from on public.messages (email_from);
create index if not exists idx_messages_created_at on public.messages (created_at);

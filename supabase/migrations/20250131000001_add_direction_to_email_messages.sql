-- Add direction column to email_messages table for outbound reply tracking
alter table if exists public.email_messages
  add column if not exists direction text default 'out';

create index if not exists idx_email_messages_direction on public.email_messages(direction);

comment on column public.email_messages.direction is 'Message direction: out (sent) or in (received reply). Default is out.';


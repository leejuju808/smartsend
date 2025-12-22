alter table public.meetings
add column if not exists sent_message_id text;

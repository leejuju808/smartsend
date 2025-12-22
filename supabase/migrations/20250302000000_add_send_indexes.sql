-- Add helpful indexes for send system
-- These complement existing indexes in 20250228000000_gmail_inbound_system.sql

-- Additional index names as specified in the requirements
create index if not exists idx_sent_messages_provider_msg_id on sent_messages(provider_message_id);
create index if not exists idx_sent_messages_lead_id on sent_messages(lead_id);
create index if not exists idx_email_messages_thread_id on email_messages(thread_id);


-- Block 345: Inline Reply Composer v1
-- Add optional link column to tie manual replies to inbound messages

alter table send_logs
add column if not exists in_reply_to_reply_id uuid references reply_logs(id);

create index if not exists send_logs_in_reply_to_reply_idx
  on send_logs (in_reply_to_reply_id);







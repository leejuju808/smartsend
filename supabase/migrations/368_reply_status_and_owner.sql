-- Block 368 — Reply Status & Quick Actions v1
-- Add status and owner tracking to reply_logs

alter table public.reply_logs
  add column if not exists status text default 'new', -- 'new' | 'handling' | 'done'
  add column if not exists owner_user_id uuid;

-- Optional: simple check constraint
alter table public.reply_logs
  drop constraint if exists reply_logs_status_check;

alter table public.reply_logs
  add constraint reply_logs_status_check
  check (status in ('new', 'handling', 'done'));

-- Indexes for status filtering
create index if not exists reply_logs_status_idx
  on public.reply_logs (workspace_id, status);

create index if not exists reply_logs_owner_idx
  on public.reply_logs (workspace_id, owner_user_id);

-- If you want a FK to your users/profiles table, you can add it:
-- adjust to your actual users/profiles table
-- alter table public.reply_logs
--   add constraint reply_logs_owner_fk
--   foreign key (owner_user_id) references auth.users(id);






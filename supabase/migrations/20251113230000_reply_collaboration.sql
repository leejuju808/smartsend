-- Block 188: Reply Collaboration - Add Assignment + Status to reply_threads
-- Adds assignment and status workflow columns to reply_threads table

alter table public.reply_threads
  add column if not exists assigned_to uuid references auth.users(id),
  add column if not exists status text
    default 'open'
    check (status in ('open','in_progress','resolved','closed'));

-- Update existing status values if needed (migrate from old status values)
do $$
begin
  -- Migrate 'snoozed' to 'open' (or keep as is, depending on business logic)
  update public.reply_threads
  set status = 'open'
  where status not in ('open','in_progress','resolved','closed');
end $$;

-- Drop old status constraint if it exists and create new one
alter table public.reply_threads
  drop constraint if exists reply_threads_status_check;

alter table public.reply_threads
  add constraint reply_threads_status_check
  check (status in ('open','in_progress','resolved','closed'));

-- Indexes for fast filtering
create index if not exists idx_reply_threads_assigned_to on public.reply_threads(assigned_to);
create index if not exists idx_reply_threads_status on public.reply_threads(status);
create index if not exists idx_reply_threads_assigned_status on public.reply_threads(assigned_to, status);

-- Comments
comment on column public.reply_threads.assigned_to is 'User assigned to handle this thread';
comment on column public.reply_threads.status is 'Thread status: open, in_progress, resolved, or closed';













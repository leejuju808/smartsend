-- Send Queue Schema Complete
-- Add missing columns per spec: user_id, mailbox_id, step_no, last_error

-- Add missing columns to send_queue
do $$
begin
  -- Add user_id if missing
  if not exists (
    select 1 from information_schema.columns 
    where table_name = 'send_queue' and column_name = 'user_id'
  ) then
    alter table public.send_queue add column user_id uuid references auth.users(id) on delete cascade;
    -- Populate from campaigns if possible
    update public.send_queue sq
    set user_id = c.user_id
    from public.campaigns c
    where sq.campaign_id = c.id and sq.user_id is null;
  end if;

  -- Add mailbox_id if missing
  if not exists (
    select 1 from information_schema.columns 
    where table_name = 'send_queue' and column_name = 'mailbox_id'
  ) then
    alter table public.send_queue add column mailbox_id uuid references public.connected_accounts(id) on delete cascade;
  end if;

  -- Add step_no if missing (default 1 for first step)
  if not exists (
    select 1 from information_schema.columns 
    where table_name = 'send_queue' and column_name = 'step_no'
  ) then
    alter table public.send_queue add column step_no int not null default 1;
  end if;

  -- Add last_error if missing
  if not exists (
    select 1 from information_schema.columns 
    where table_name = 'send_queue' and column_name = 'last_error'
  ) then
    alter table public.send_queue add column last_error text;
  end if;

  -- Ensure status includes 'skipped'
  -- Check constraint would be added if status column uses check constraint
end $$;

-- Update indexes
create index if not exists idx_send_queue_due on public.send_queue (status, scheduled_at) where status = 'queued';
create index if not exists idx_send_queue_user on public.send_queue (user_id) where user_id is not null;
create index if not exists idx_send_queue_mailbox on public.send_queue (mailbox_id) where mailbox_id is not null;

-- Update RLS to include user_id check
drop policy if exists "send_queue_owner_all" on public.send_queue;
create policy if not exists "send_queue_owner_all" on public.send_queue
  for all using (
    exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid())
    and (user_id is null or user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid())
    and (user_id is null or user_id = auth.uid())
  );







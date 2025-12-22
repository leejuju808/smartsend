-- Block 137 — AI Reply Detection + Auto-Mark as Replied

-- 1) Extend send_logs with reply tracking

alter table public.send_logs
add column if not exists reply_status text
  check (reply_status in ('none','replied','ignored'))
  default 'none';

alter table public.send_logs
add column if not exists reply_label text;

alter table public.send_logs
add column if not exists reply_metadata jsonb;

alter table public.send_logs
add column if not exists replied_at timestamptz;

-- 2) Optional: central table for raw replies (if you don't already have one)
-- Note: This creates a new email_replies table that references send_logs
-- If you already have an email_replies table that references email_logs, 
-- you may want to adjust this or create a separate table

create table if not exists public.email_replies (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  account_id uuid not null,
  send_log_id uuid references public.send_logs(id) on delete set null,

  from_email text,
  to_email text,
  subject text,
  raw_text text,

  -- AI fields
  ai_label text,
  ai_score numeric,
  ai_payload jsonb,
  reply_kind text check (
    reply_kind in (
      'positive_meeting',
      'positive_no_meeting',
      'neutral_question',
      'ooh',
      'unsubscribe',
      'bounce',
      'other'
    )
  ) default 'other',
  has_meeting_intent boolean default false,
  is_unsubscribe boolean default false,
  is_bounce boolean default false
);

-- If email_replies already exists, add missing AI columns
-- Note: account_id and send_log_id are added separately to handle FK constraints
alter table public.email_replies
  add column if not exists account_id uuid,
  add column if not exists send_log_id uuid,
  add column if not exists raw_text text,
  add column if not exists ai_label text,
  add column if not exists ai_score numeric,
  add column if not exists ai_payload jsonb,
  add column if not exists reply_kind text default 'other',
  add column if not exists has_meeting_intent boolean default false,
  add column if not exists is_unsubscribe boolean default false,
  add column if not exists is_bounce boolean default false;

-- Add FK constraint for send_log_id if column was just added
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'email_replies' 
    and column_name = 'send_log_id'
    and is_nullable = 'YES'
  ) then
    -- Check if constraint doesn't already exist
    if not exists (
      select 1 from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name
      where tc.table_schema = 'public'
      and tc.table_name = 'email_replies'
      and kcu.column_name = 'send_log_id'
      and tc.constraint_type = 'FOREIGN KEY'
    ) then
      alter table public.email_replies
        add constraint fk_email_replies_send_log
        foreign key (send_log_id) references public.send_logs(id) on delete set null;
    end if;
  end if;
end $$;

-- Add check constraint for reply_kind if it doesn't exist
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'email_replies' 
    and column_name = 'reply_kind'
  ) then
    -- Check if constraint doesn't already exist
    if not exists (
      select 1 from information_schema.constraint_column_usage ccu
      join information_schema.table_constraints tc on ccu.constraint_name = tc.constraint_name
      where tc.table_schema = 'public'
      and tc.table_name = 'email_replies'
      and ccu.column_name = 'reply_kind'
      and tc.constraint_type = 'CHECK'
    ) then
      alter table public.email_replies
        add constraint chk_email_replies_reply_kind
        check (
          reply_kind in (
            'positive_meeting',
            'positive_no_meeting',
            'neutral_question',
            'ooh',
            'unsubscribe',
            'bounce',
            'other'
          )
        );
    end if;
  end if;
end $$;

create index if not exists idx_email_replies_send_log
  on public.email_replies (send_log_id);

create index if not exists idx_email_replies_account
  on public.email_replies (account_id);

create index if not exists idx_send_logs_reply_status
  on public.send_logs (reply_status);

create index if not exists idx_send_logs_replied_at
  on public.send_logs (replied_at);

-- Trigger to update updated_at for email_replies
create or replace function public.update_email_replies_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_email_replies_updated_at on public.email_replies;
create trigger trg_email_replies_updated_at before update on public.email_replies
  for each row execute function public.update_email_replies_updated_at();

-- Enable RLS on email_replies
alter table public.email_replies enable row level security;

-- RLS policies for email_replies
-- Allow service role to insert/update (for webhooks and API routes)
drop policy if exists "email_replies_insert_service" on public.email_replies;
create policy "email_replies_insert_service" on public.email_replies
  for insert to service_role
  using (true) with check (true);

drop policy if exists "email_replies_update_service" on public.email_replies;
create policy "email_replies_update_service" on public.email_replies
  for update to service_role
  using (true) with check (true);

-- Allow authenticated users to read their own replies
-- (assuming account_id relates to workspace/user ownership)
drop policy if exists "email_replies_select_own" on public.email_replies;
create policy "email_replies_select_own" on public.email_replies
  for select to authenticated
  using (true); -- Adjust this based on your auth model


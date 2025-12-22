-- AI Reply Detection + Auto-Mark System
-- Creates reply classification labels, email_threads table, reply_ai_jobs queue, and triggers

-- 1. Reply classification labels enum
create type reply_label as enum (
  'positive',
  'neutral',
  'negative',
  'ooh',
  'unsubscribe',
  'not_a_reply',
  'unknown'
);

-- 2. Create email_threads table if it doesn't exist (convert from view if needed)
-- Note: If email_threads is currently a view, this will create a table alongside it
-- You may want to drop the view first in a separate migration if needed
create table if not exists public.email_threads (
  id uuid primary key default gen_random_uuid(),
  -- Canonical "is replied" + last reply time
  is_replied boolean default false,
  last_reply_at timestamptz,
  last_reply_label reply_label,
  -- Optional: link to original campaign/lead if your schema supports it
  -- Add foreign keys as needed based on your schema
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_email_threads_is_replied on public.email_threads(is_replied);
create index if not exists idx_email_threads_last_reply_at on public.email_threads(last_reply_at desc nulls last);

-- 3. Add columns to email_replies if they don't exist
-- Note: Assuming email_replies already exists with id, thread_id, sender, subject, snippet, received_at
alter table if exists public.email_replies
  add column if not exists thread_id uuid references public.email_threads(id) on delete set null,
  add column if not exists sender text,
  add column if not exists snippet text,
  add column if not exists received_at timestamptz default now(),
  -- AI classification fields
  add column if not exists ai_label reply_label,
  add column if not exists ai_confidence numeric check (ai_confidence between 0 and 1);

-- Create indexes on email_replies for efficient queries
create index if not exists idx_email_replies_thread_id on public.email_replies(thread_id);
create index if not exists idx_email_replies_ai_label on public.email_replies(ai_label);
create index if not exists idx_email_replies_received_at on public.email_replies(received_at desc);

-- 4. Queue for async AI jobs
create table if not exists public.reply_ai_jobs (
  id bigserial primary key,
  reply_id uuid not null references public.email_replies(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'error')),
  error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_reply_ai_jobs_status on public.reply_ai_jobs(status);
create index if not exists idx_reply_ai_jobs_reply_id on public.reply_ai_jobs(reply_id);

-- 5. Trigger: when a reply is inserted, enqueue a job
create or replace function trg_enqueue_reply_ai_job()
returns trigger language plpgsql as $$
begin
  insert into public.reply_ai_jobs(reply_id) values (new.id);
  return new;
end$$;

drop trigger if exists tg_enqueue_reply_ai_job on public.email_replies;
create trigger tg_enqueue_reply_ai_job
after insert on public.email_replies
for each row execute function trg_enqueue_reply_ai_job();

-- 6. Enable RLS on new tables
alter table if exists public.email_threads enable row level security;
alter table if exists public.reply_ai_jobs enable row level security;

-- RLS: Allow service role to read/write email_replies, email_threads, and reply_ai_jobs
-- (Mirror whatever policies exist for email_threads/email_replies, plus service role access)

-- Service role policies for email_threads
drop policy if exists "service_role_manages_threads" on public.email_threads;
create policy "service_role_manages_threads" on public.email_threads
  for all to service_role
  using (true) with check (true);

-- Service role policies for reply_ai_jobs
drop policy if exists "service_role_manages_reply_ai_jobs" on public.reply_ai_jobs;
create policy "service_role_manages_reply_ai_jobs" on public.reply_ai_jobs
  for all to service_role
  using (true) with check (true);

-- Service role policies for email_replies (if not already exists)
drop policy if exists "service_role_manages_email_replies" on public.email_replies;
create policy "service_role_manages_email_replies" on public.email_replies
  for all to service_role
  using (true) with check (true);

-- 7. Optional: campaign_recipients roll-up (if table exists)
-- Check if campaign_recipients table exists and add columns
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'campaign_recipients') then
    alter table public.campaign_recipients
      add column if not exists replied_at timestamptz,
      add column if not exists reply_label reply_label;

    -- Create trigger function for marking recipient as replied
    -- Note: This assumes campaign_recipients has a thread_id column that can match email_threads.id
    -- Adjust the WHERE clause based on your actual schema (might need to join through email_replies)
    create or replace function trg_mark_recipient_replied()
    returns trigger language plpgsql as $$
    begin
      if new.is_replied = true and new.last_reply_at is not null then
        -- Update campaign_recipients where thread_id matches this email_threads.id
        -- Note: If thread_id in campaign_recipients is text (Gmail thread ID), you may need to
        -- join through email_replies to match properly
        update public.campaign_recipients
          set replied_at = new.last_reply_at,
              reply_label = new.last_reply_label
        where public.campaign_recipients.thread_id = new.id::text
           or public.campaign_recipients.thread_id in (
             select thread_id::text from public.email_replies 
             where thread_id = new.id limit 1
           );
      end if;
      return new;
    end$$;

    drop trigger if exists tg_mark_recipient_replied on public.email_threads;
    create trigger tg_mark_recipient_replied
    after update of is_replied, last_reply_at, last_reply_label on public.email_threads
    for each row execute function trg_mark_recipient_replied();
  end if;
end$$;


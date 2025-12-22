-- DB hardening: add Gmail sync columns + indexes for replies table
-- Speed up lookups + avoid duplicates

alter table public.replies
  add column if not exists gmail_thread_id text,
  add column if not exists gmail_message_id text,
  add column if not exists message_id text,          -- RFC822 Message-Id
  add column if not exists references_ids text,      -- raw "References" header
  add column if not exists in_reply_to text,        -- raw "In-Reply-To" header
  add column if not exists internal_ts timestamptz;  -- gmail internalDate

-- Unique index to prevent duplicates per user
create unique index if not exists replies_gmail_message_id_key
  on public.replies (user_id, gmail_message_id)
  where gmail_message_id is not null;

-- Index for efficient user-based queries sorted by date
create index if not exists replies_user_created_idx
  on public.replies (user_id, created_at desc);

-- Index for thread-based lookups
create index if not exists replies_user_thread_idx
  on public.replies (user_id, gmail_thread_id)
  where gmail_thread_id is not null;


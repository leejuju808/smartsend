-- 1) Threads table
create table if not exists threads (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid not null references leads(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete set null,
  subject text,
  last_message_snippet text,
  last_message_at timestamptz not null default now(),
  unread_count int not null default 0,
  created_at timestamptz default now()
);

create unique index if not exists uq_threads_lead_subject
  on threads(lead_id, (coalesce(lower(subject), ''))) with (fillfactor = 100);

create index if not exists idx_threads_campaign_last on threads(campaign_id, last_message_at desc);

-- 2) Replies: add thread_id, raw/plain
alter table replies
  add column if not exists thread_id uuid references threads(id) on delete cascade,
  add column if not exists raw_body text,     -- full body before trimming
  add column if not exists from_email text;   -- normalized sender

-- 3) Fast lookups
create index if not exists idx_replies_thread on replies(thread_id, created_at desc);

-- Enable RLS for threads
alter table threads enable row level security;

-- RLS Policies for threads
drop policy if exists "Users can view threads for their leads" on threads;
create policy "Users can view threads for their leads" on threads
  for select using (
    exists (
      select 1 from public.leads l
      where l.id = threads.lead_id
    )
  );

drop policy if exists "Service role can manage threads" on threads;
create policy "Service role can manage threads" on threads
  for all using (true) with check (true);


-- 15_replies.sql
alter table email_sends
  add column if not exists message_id text; -- provider message id (if available)

create table if not exists email_replies (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references email_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  from_email text not null,
  to_email text not null,
  subject text,
  text_body text,
  html_body text,
  raw jsonb not null default '{}',
  is_positive boolean,          -- naive heuristic
  created_at timestamptz not null default now()
);
create index if not exists email_replies_user_idx on email_replies(user_id, created_at desc);

-- mark a contact as "responded" to stop future sends if you want
alter table contacts add column if not exists last_replied_at timestamptz;
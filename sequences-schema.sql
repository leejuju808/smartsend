-- sequences owned by user
create table if not exists sequences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

-- steps inside a sequence
create table if not exists sequence_steps (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references sequences(id) on delete cascade,
  step_order int not null,                  -- 1,2,3...
  delay_hours int not null default 0,       -- delay from prior step
  subject text not null,
  body text not null,
  created_at timestamptz default now()
);

create index if not exists idx_sequences_user on sequences(user_id);
create index if not exists idx_steps_sequence on sequence_steps(sequence_id, step_order);
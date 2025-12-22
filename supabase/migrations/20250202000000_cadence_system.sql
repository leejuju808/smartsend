-- Cadence System Migration
-- Creates tables for email sequences, enrollments, and send queue

-- Note: There's an existing sequences table from 20250124_sequences.sql
-- We're creating a separate cadence-specific schema to avoid conflicts

-- A reusable sequence (e.g., "Discovery 3-step")
create table if not exists public.cadence_sequences (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid,
  timezone text default 'America/Los_Angeles',
  daily_start time default '08:30', -- local window start
  daily_end time   default '16:30', -- local window end
  quiet_weekends boolean default true,
  created_at timestamptz default now()
);

-- Steps inside a sequence
create table if not exists public.cadence_steps (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid references public.cadence_sequences(id) on delete cascade,
  step_index int not null,                 -- 0..N
  wait_days int not null default 0,        -- days after previous step
  subject text,
  body text not null,                      -- can contain {{first_name}}, {{company}}, etc.
  created_at timestamptz default now()
);
create index if not exists cadence_steps_seq_idx on public.cadence_steps(sequence_id, step_index);

-- Enrollment of a lead into a sequence
create table if not exists public.cadence_enrollments (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid references public.cadence_sequences(id) on delete cascade,
  lead_email text not null,
  lead_first_name text,
  lead_company text,
  campaign_id uuid references public.campaigns(id),   -- optional link
  current_step int default 0,                         -- next step to send
  status text not null default 'active',              -- active|paused|completed|cancelled
  last_sent_at timestamptz,
  replied boolean default false,
  reply_type text,
  created_at timestamptz default now()
);
create index if not exists cadence_enroll_status_idx on public.cadence_enrollments(status, sequence_id);
create index if not exists cadence_enroll_email_idx on public.cadence_enrollments(lead_email);
create index if not exists cadence_enroll_campaign_idx on public.cadence_enrollments(campaign_id, lead_email);

-- Send queue (normalized, easy to scan)
-- Note: There may be existing send_queue tables, using a distinct name
create table if not exists public.cadence_send_queue (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid references public.cadence_enrollments(id) on delete cascade,
  sequence_id uuid references public.cadence_sequences(id) on delete cascade,
  step_index int not null,
  to_email text not null,
  subject text,
  body text not null,
  scheduled_at timestamptz not null,
  attempts int default 0,
  locked_at timestamptz,
  sent_at timestamptz,
  error text
);
create index if not exists cadence_queue_due_idx on public.cadence_send_queue(scheduled_at) where sent_at is null;

-- Trigger to mark enrollment as replied when campaign_logs.replied is true
create or replace function mark_cadence_enrollment_replied()
returns trigger as $$
begin
  if new.replied = true then
    update public.cadence_enrollments
      set replied = true, status = 'completed', reply_type = new.reply_type
    where campaign_id = new.campaign_id and lead_email = new.from_email;
  end if;
  return new;
end; $$ language plpgsql;

drop trigger if exists trg_cadence_enroll_reply on public.campaign_logs;
create trigger trg_cadence_enroll_reply
after update of replied on public.campaign_logs
for each row execute procedure mark_cadence_enrollment_replied();

-- Queue locker function for processing cadence sends
create or replace function lock_due_cadence_queue_items(p_now timestamptz, p_limit int default 20)
returns table (
  id uuid, enrollment_id uuid, sequence_id uuid, step_index int, to_email text, subject text, body text, attempts int
) language plpgsql as $$
begin
  return query
  with cte as (
    select id from public.cadence_send_queue
    where sent_at is null
      and (locked_at is null or locked_at < (p_now - interval '5 minutes'))
      and scheduled_at <= p_now
    order by scheduled_at asc
    limit p_limit
    for update skip locked
  )
  update public.cadence_send_queue q
  set locked_at = p_now
  from cte where q.id = cte.id
  returning q.id, q.enrollment_id, q.sequence_id, q.step_index, q.to_email, q.subject, q.body, q.attempts;
end $$;

-- RLS policies
alter table public.cadence_sequences enable row level security;
alter table public.cadence_steps enable row level security;
alter table public.cadence_enrollments enable row level security;
alter table public.cadence_send_queue enable row level security;

-- Service role can do everything (for cron workers)
create policy "service_role_all" on public.cadence_sequences for all to service_role using (true) with check (true);
create policy "service_role_all" on public.cadence_steps for all to service_role using (true) with check (true);
create policy "service_role_all" on public.cadence_enrollments for all to service_role using (true) with check (true);
create policy "service_role_all" on public.cadence_send_queue for all to service_role using (true) with check (true);

-- Users can manage their own cadences
create policy "users_manage_own_cadences" on public.cadence_sequences for all to authenticated using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
create policy "users_manage_own_steps" on public.cadence_steps for all to authenticated using (
  exists (select 1 from public.cadence_sequences s where s.id = cadence_steps.sequence_id and s.owner_user_id = auth.uid())
) with check (
  exists (select 1 from public.cadence_sequences s where s.id = cadence_steps.sequence_id and s.owner_user_id = auth.uid())
);
create policy "users_manage_own_enrollments" on public.cadence_enrollments for all to authenticated using (
  exists (select 1 from public.cadence_sequences s where s.id = cadence_enrollments.sequence_id and s.owner_user_id = auth.uid())
) with check (
  exists (select 1 from public.cadence_sequences s where s.id = cadence_enrollments.sequence_id and s.owner_user_id = auth.uid())
);
create policy "users_read_own_queue" on public.cadence_send_queue for select to authenticated using (
  exists (select 1 from public.cadence_sequences s where s.id = cadence_send_queue.sequence_id and s.owner_user_id = auth.uid())
);


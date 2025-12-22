-- Enhance sequences with enrollment tracking and condition-based logic

-- Create sequence_enrollments table for tracking who is in which sequence
create table if not exists public.sequence_enrollments (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid references public.sequences(id) on delete cascade,
  email citext not null,
  current_step int default 0,
  last_sent timestamptz,
  created_at timestamptz default now(),
  unique(sequence_id, email)
);

-- Add indexes for performance
create index if not exists idx_sequence_enrollments_sequence on public.sequence_enrollments(sequence_id);
create index if not exists idx_sequence_enrollments_email on public.sequence_enrollments(email);
create index if not exists idx_sequence_enrollments_active on public.sequence_enrollments(sequence_id, current_step, last_sent);

-- Add condition column to sequence_steps if it doesn't exist
alter table if exists public.sequence_steps 
  add column if not exists condition text default 'always';

-- Update existing steps to have 'always' condition
update public.sequence_steps set condition = 'always' where condition is null;

-- Create RPC function to find due sequence steps
create or replace function public.due_sequence_steps()
returns table(
  id uuid, 
  sequence_id uuid, 
  step_order int, 
  email text, 
  subject text, 
  body_text text, 
  body_html text
) as $$
begin
  return query
  select 
    st.id, 
    st.sequence_id, 
    st.step_number as step_order, 
    e.email, 
    st.subject, 
    st.body as body_text, 
    st.body as body_html
  from sequence_enrollments e
  join sequence_steps st on st.sequence_id = e.sequence_id and st.step_number = e.current_step + 1
  where (e.last_sent is null or now() >= e.last_sent + (st.delay_days || ' days')::interval)
    and not exists (
      select 1 from events ev
      where ev.campaign_id = st.sequence_id
        and ev.recipient_email = e.email
        and (
          (st.condition = 'opened' and ev.type = 'open')
          or (st.condition = 'clicked' and ev.type = 'click')
          or (st.condition = 'no_reply' and ev.type = 'reply')
        )
    );
end;
$$ language plpgsql;

-- Create RPC function to mark sequence step as sent
create or replace function public.mark_sequence_step_sent(step_id uuid, email text)
returns void as $$
begin
  update sequence_enrollments
  set current_step = current_step + 1, last_sent = now()
  where sequence_id = (select sequence_id from sequence_steps where id = step_id)
    and lower(email) = lower(mark_sequence_step_sent.email);
end;
$$ language plpgsql;

-- Enable RLS on sequence_enrollments
alter table public.sequence_enrollments enable row level security;

-- Create policies for sequence_enrollments
create policy "Users can view enrollments for their sequences" on public.sequence_enrollments
  for select using (
    exists (
      select 1 from public.sequences s 
      where s.id = sequence_enrollments.sequence_id 
      and s.user_id = auth.uid()
    )
  );

create policy "Users can manage enrollments for their sequences" on public.sequence_enrollments
  for all using (
    exists (
      select 1 from public.sequences s 
      where s.id = sequence_enrollments.sequence_id 
      and s.user_id = auth.uid()
    )
  ); 
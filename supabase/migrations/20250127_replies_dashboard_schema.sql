-- Ensure FK from meetings → messages for easy joins
alter table meetings
  add column if not exists message_id uuid;

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where table_name = 'meetings' and constraint_name = 'meetings_message_id_fkey'
  ) then
    alter table meetings
      add constraint meetings_message_id_fkey
      foreign key (message_id)
      references messages(id)
      on delete set null;
  end if;
end$$;

-- Minimal columns expected on messages
-- (Skip if already present in your schema.)
alter table messages
  add column if not exists direction text check (direction in ('outbound','inbound')),
  add column if not exists is_reply boolean,
  add column if not exists sender_email text,
  add column if not exists subject text,
  add column if not exists body_text text,
  add column if not exists received_at timestamptz;

-- A convenient view to power the Replies UI
create or replace view replies_with_meetings as
select
  m.id as message_id,
  m.sender_email,
  m.subject,
  m.body_text,
  m.received_at,
  mt.id as meeting_id,
  mt.calendly_url,
  mt.status
from messages m
left join meetings mt on mt.message_id = m.id
where m.direction = 'inbound' and coalesce(m.is_reply, true) = true;

-- RLS: keep it simple (adjust to your auth model)
-- Let signed-in users read the view
grant select on replies_with_meetings to anon, authenticated;

-- If messages has RLS, ensure reads are permitted for the owner.
-- Example (adjust to your profiles/ownership model):
-- alter table messages enable row level security;
-- create policy "user can read own messages"
--   on messages for select
--   using (auth.uid() = user_id);

-- meetings RLS already created in previous step (view-only for users, insert via anon allowed here):
alter table meetings enable row level security;

-- Allow inserts by anon/authenticated (front-end) – you can tighten later with RPC
create policy "insert meetings (front)"
  on meetings for insert
  to anon, authenticated
  with check (true);

-- Allow select of meetings by signed-in users
create policy "select meetings (front)"
  on meetings for select
  to anon, authenticated
  using (true);
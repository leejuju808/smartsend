-- Inbound messages table for webhook replies
create table if not exists public.inbound_messages (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  owner_user_id uuid references auth.users(id),
  message_id text,
  sender_email text,
  subject text,
  body_text text,
  raw_payload jsonb,
  processed_status text default 'received', -- received | forwarded | error
  detector_status text,                     -- booked | no_meeting | error
  created_at timestamptz default now()
);

alter table public.inbound_messages enable row level security;

drop policy if exists "inbound_select_own" on public.inbound_messages;
create policy "inbound_select_own"
on public.inbound_messages for select
to authenticated
using (owner_user_id = auth.uid());

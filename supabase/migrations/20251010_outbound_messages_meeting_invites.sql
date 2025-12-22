-- Migration: Outbound messages tracking and meeting invite status
-- Date: 2025-10-10
-- Description: Log of sent messages (invites, follow-ups, etc.) and meeting invite tracking

-- Log of sent messages (invites, follow-ups, etc.)
create table if not exists public.outbound_messages (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references public.meetings(id) on delete set null,
  message_id text,
  to_email text not null,
  subject text not null,
  calendly_url text,
  ics_blob text,
  sent_provider_id text,
  sent_at timestamptz default now(),
  created_at timestamptz default now()
);

-- Add indexes for performance
create index if not exists idx_outbound_messages_meeting_id on public.outbound_messages(meeting_id);
create index if not exists idx_outbound_messages_to_email on public.outbound_messages(to_email);
create index if not exists idx_outbound_messages_sent_at on public.outbound_messages(sent_at desc);

-- Enable row level security
alter table public.outbound_messages enable row level security;

-- Read for authenticated users
create policy "outbound select for authenticated"
on public.outbound_messages for select
to authenticated
using (true);

-- Insert by authenticated users (service role will bypass RLS anyway)
create policy "outbound insert for authenticated"
on public.outbound_messages for insert
to authenticated
with check (true);

-- Add invite_sent_at to meetings table
alter table public.meetings
add column if not exists invite_sent_at timestamptz;

-- Add index for querying meetings with sent invites
create index if not exists idx_meetings_invite_sent_at on public.meetings(invite_sent_at) where invite_sent_at is not null;

-- Optional lightweight metric view for MB/100
create or replace view public.metrics_meetings as
select
  date_trunc('day', detected_at)::date as day,
  count(*)::int as meetings_detected,
  count(invite_sent_at)::int as invites_sent,
  case 
    when count(*) > 0 then round((count(invite_sent_at)::numeric / count(*)::numeric) * 100, 2)
    else 0
  end as conversion_rate
from public.meetings
where detected_at is not null
group by 1
order by 1 desc;

-- Grant permissions on the view
grant select on public.metrics_meetings to authenticated;

-- Comment on table
comment on table public.outbound_messages is 'Tracks all outbound messages sent by the system including meeting invites';
comment on column public.outbound_messages.meeting_id is 'Reference to the meeting if this is a meeting invite';
comment on column public.outbound_messages.ics_blob is 'The ICS calendar file content sent with the email';
comment on column public.outbound_messages.sent_provider_id is 'Message ID returned by the email provider (SMTP/Resend)';

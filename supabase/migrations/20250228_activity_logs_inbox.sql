-- Activity log

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  actor_id uuid references auth.users(id),
  lead_id uuid,
  event_type text not null check (
    event_type in ('campaign_launched','email_sent','email_failed','reply_detected','member_invited','member_role_changed')
  ),
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.activity_logs enable row level security;

-- RLS: anyone with access to the campaign can read; only senders/admins write
create policy "activity read" on public.activity_logs
for select using (exists (
  select 1 from public.v_campaign_access v
  where v.campaign_id = activity_logs.campaign_id
    and v.user_id = auth.uid()
));

create policy "activity write by sender/admin" on public.activity_logs
for insert with check (exists (
  select 1 from public.v_campaign_access v
  where v.campaign_id = activity_logs.campaign_id
    and v.user_id = auth.uid()
    and v.role in ('sender','admin','owner','editor')
));

-- Helpful indexes
create index if not exists idx_activity_campaign_time on public.activity_logs(campaign_id, created_at desc);
create index if not exists idx_activity_type on public.activity_logs(event_type);

-- Fast "team inbox" materialized view-like query (simple view)
create or replace view public.v_team_inbox as
select
  q.id as queue_id,
  q.campaign_id,
  q.lead_id,
  l.email as lead_email,
  q.to_email as to_email,
  q.subject,
  q.status,
  q.fail_code,
  q.fail_kind,
  q.attempts,
  q.scheduled_at,
  q.next_attempt_at,
  q.created_at as queued_at,
  sl.created_at as sent_at,
  -- most recent reply marker from campaign_leads if you store it; else null
  null::timestamptz as replied_at
from public.send_queue q
left join public.campaign_leads cl on cl.id = q.lead_id
left join public.leads l on l.id = cl.lead_id
left join public.send_logs sl on sl.queue_id = q.id and sl.status = 'sent';

-- Secure the view
grant select on public.v_team_inbox to anon, authenticated;


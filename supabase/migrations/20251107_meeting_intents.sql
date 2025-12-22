-- Meeting intent storage and helpers

-- A) Per-thread meeting intent (latest wins; can re-parse anytime)
create table if not exists public.meeting_intents (
  thread_id uuid primary key references public.inbox_threads(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  detected_at timestamptz not null default now(),
  source_message_id uuid not null references public.inbox_messages(id) on delete cascade,
  lead_tz text,
  my_tz text,
  candidate_iso text[],
  candidate_local text[],
  note text,
  confidence numeric not null default 0.7 check (confidence >= 0 and confidence <= 1)
);

create index if not exists idx_meeting_intents_campaign on public.meeting_intents(campaign_id);
create index if not exists idx_meeting_intents_detected on public.meeting_intents(detected_at desc);

-- B) Campaign scheduling prefs
alter table public.campaigns
  add column if not exists meet_my_tz text,
  add column if not exists meet_duration_min int default 30,
  add column if not exists meet_days int[] default '{1,2,3,4,5}',
  add column if not exists meet_hours_start int default 9,
  add column if not exists meet_hours_end int default 17,
  add column if not exists meet_buffer_min int default 15;

-- C) Fast view to fetch last positive/question inbound per thread (for parser trigger)
create or replace view public.v_thread_last_inbound_labeled as
select
  t.id as thread_id,
  t.campaign_id,
  t.lead_id,
  (array_agg(m.id order by m.created_at desc))[1] as last_msg_id,
  (array_agg(m.ai_label order by m.created_at desc))[1] as last_label,
  (array_agg(m.body_plain order by m.created_at desc))[1] as last_plain,
  (array_agg(m.body_html order by m.created_at desc))[1] as last_html,
  max(m.created_at) as last_inbound_at
from public.inbox_threads t
join public.inbox_messages m on m.thread_id = t.id and m.direction = 'in'
group by t.id, t.campaign_id, t.lead_id;

-- D) RLS (read via campaign membership)
alter table public.meeting_intents enable row level security;

drop policy if exists "mi_select" on public.meeting_intents;
create policy "mi_select" on public.meeting_intents
for select using (
  exists (
    select 1
    from public.campaign_members cm
    where cm.campaign_id = meeting_intents.campaign_id
      and cm.user_id = auth.uid()
  )
);

drop policy if exists "mi_mut" on public.meeting_intents;
create policy "mi_mut" on public.meeting_intents
for all using (
  exists (
    select 1
    from public.campaign_members cm
    where cm.campaign_id = meeting_intents.campaign_id
      and cm.user_id = auth.uid()
      and cm.role in ('owner', 'editor')
  )
)
with check (
  exists (
    select 1
    from public.campaign_members cm
    where cm.campaign_id = meeting_intents.campaign_id
      and cm.user_id = auth.uid()
      and cm.role in ('owner', 'editor')
  )
);




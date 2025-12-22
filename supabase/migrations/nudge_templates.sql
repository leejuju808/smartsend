-- Nudge templates per campaign and helper view for last inbound snippet

create table if not exists public.nudge_templates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  tone text not null,
  scenario text not null,
  subject text not null,
  body text not null,
  unique (campaign_id, tone, scenario)
);

comment on column public.nudge_templates.tone is 'e.g. professional, friendly, concise, assertive';
comment on column public.nudge_templates.scenario is 'e.g. no_reply, positive, question, routing, neutral, bounce';
comment on column public.nudge_templates.body is 'Supports tokens: {lead_first} {company} {me} {duration} {booking_link} {last_msg} {cta}';

create or replace view public.v_thread_last_inbound as
select
  t.id as thread_id,
  t.campaign_id,
  t.lead_id,
  nm.ai_label,
  left(coalesce(nm.text, nm.body, ''), 500) as snippet,
  nm.sent_at
from public.inbox_threads t
join lateral (
  select *
  from public.normalized_messages m
  where m.linked_thread_id = t.id
    and m.direction = 'inbound'
  order by m.sent_at desc
  limit 1
) as nm on true;


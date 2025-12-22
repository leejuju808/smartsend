-- Align open tracking rollups with latest aggregation rules
create or replace view public.open_stats as
select
  mp.account_id,
  mp.campaign_id,
  mp.lead_id,
  mp.message_id,
  mp.pixel,
  min(oe.created_at) filter (where oe.is_counted) as first_open_at,
  count(oe.*) filter (where oe.is_counted)::int as total_opens,
  count(oe.*)::int as raw_opens
from public.message_pixels mp
left join public.open_events oe on oe.pixel = mp.pixel
group by mp.account_id, mp.campaign_id, mp.lead_id, mp.message_id, mp.pixel;

create or replace view public.lead_open_summary as
select
  lead_id,
  count(distinct pixel)::int as messages_tracked,
  count(*) filter (where first_open_at is not null)::int as messages_opened,
  sum(total_opens)::int as opens_counted
from public.open_stats
group by lead_id;

comment on column public.open_events.pixel is 'token specific to this message/lead';
comment on column public.open_events.via is 'browser|apple_mpp|gmail_proxy|bot|unknown';
comment on column public.open_events.is_counted is 'true when the event should be reflected in UI aggregates';





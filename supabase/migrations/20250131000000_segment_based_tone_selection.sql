-- Step 1 — Define segments on contacts (lightweight & flexible)
-- Enrichment outputs assumed on contacts/company tables; add normalized segment fields

alter table public.contacts
  add column if not exists industry text,
  add column if not exists persona text, -- e.g., "Founder","Head of Sales","Ops Manager"
  add column if not exists company_size int; -- employee count

-- Derived segment label for fast grouping
alter table public.contacts
  add column if not exists segment text;

-- Backfill a simple default segment:
update public.contacts
set segment = coalesce(persona, '') || '|' ||
              coalesce(industry, '') || '|' ||
              case
                when company_size is null then ''
                when company_size < 50 then 'S'
                when company_size < 250 then 'M'
                else 'L'
              end
where segment is null;

create index if not exists ix_contacts_segment on public.contacts(segment);

-- Step 2 — Outcome view: performance by campaign × step × segment × tone

create or replace view public.tone_perf_by_segment_30d as
select
  mo.campaign_id,
  mo.step_number,
  c.segment,
  mo.tone_used as tone,
  count(*)                                         as sends,
  count(mo.opened_at)                              as opens,
  count(mo.clicked_at)                             as clicks,
  count(mo.replied_at)                             as replies,
  sum(case when mo.positive_reply then 1 else 0 end) as positives,
  sum(case when mo.meeting_intent then 1 else 0 end) as meetings,
  (count(mo.opened_at)::float / nullif(count(*),0))                   as open_rate,
  (count(mo.replied_at)::float / nullif(count(mo.opened_at),0))       as reply_rate_on_open,
  (sum(case when mo.positive_reply then 1 else 0 end)::float / nullif(count(mo.replied_at),0)) as positive_share,
  (sum(case when mo.meeting_intent then 1 else 0 end)::float / nullif(count(mo.replied_at),0)) as meeting_share
from public.message_outcomes mo
join public.contacts c on c.id = mo.contact_id
where mo.sent_at >= now() - interval '30 days'
group by 1,2,3,4;

create index if not exists ix_tone_perf_seg on public.message_outcomes(campaign_id, step_number, tone_used);

-- Step 5 — Rollout safeguards (caps & kill-switch)
-- Add per-campaign controls

alter table public.campaigns
  add column if not exists tone_rollout_cap_percent int default 50, -- max % of traffic that can be "non-default" tone in a new segment
  add column if not exists tone_enable_humorous boolean default true,
  add column if not exists tone_enable_assertive boolean default true;

-- Step 6 — Segment tone overrides table

create table if not exists public.segment_tone_overrides (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  segment text not null,
  tone text not null check (tone in ('formal','casual','humorous','assertive')),
  allowed boolean not null default true,
  created_at timestamptz not null default now(),
  unique (campaign_id, segment, tone)
);

create index if not exists ix_segment_tone_overrides_lookup on public.segment_tone_overrides(campaign_id, segment);

alter table public.segment_tone_overrides enable row level security;

create policy segment_tone_overrides_select on public.segment_tone_overrides
  for select
  using (
    exists (
      select 1
      from public.campaigns c
      where c.id = segment_tone_overrides.campaign_id
        and public.is_account_member(c.account_id)
    )
  );

create policy segment_tone_overrides_modify on public.segment_tone_overrides
  for all
  using (
    exists (
      select 1
      from public.campaigns c
      where c.id = segment_tone_overrides.campaign_id
        and public.is_account_member(c.account_id)
    )
  )
  with check (
    exists (
      select 1
      from public.campaigns c
      where c.id = segment_tone_overrides.campaign_id
        and public.is_account_member(c.account_id)
    )
  );
















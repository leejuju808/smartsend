-- Block 8600 — Lead Pipeline View (HOT / WARM / FOLLOW-UP Board)
-- SQL: pipeline_stage on contacts + lead_pipeline_view

-- 1. Add account_id to contacts if it doesn't exist (for compatibility with lead_intent_events)
alter table public.contacts
  add column if not exists account_id uuid;

-- Add index for account_id lookups
create index if not exists idx_contacts_account_id
  on public.contacts(account_id);

-- 2. Add pipeline_stage to contacts (manual override)
alter table public.contacts
  add column if not exists pipeline_stage text
    check (pipeline_stage in ('HOT', 'WARM', 'FOLLOW_UP', 'NOT_INTERESTED'))
    default null;

comment on column public.contacts.pipeline_stage is
  'Manual pipeline stage override: HOT | WARM | FOLLOW_UP | NOT_INTERESTED';

-- 3. View: latest intent per contact + manual override
-- Note: lead_intent_events.contact_id may be a lead_id (from trigger) or contact_id
-- We try to match contacts.id directly first, then fall back to joining through leads by email

create or replace view public.lead_pipeline_view
as
with latest_intents as (
  select
    lie.account_id,
    lie.contact_id,
    max(lie.created_at) as last_intent_at
  from public.lead_intent_events lie
  where lie.contact_id is not null
  group by lie.account_id, lie.contact_id
),
intent_details as (
  select
    lie.account_id,
    lie.contact_id,
    lie.intent,
    lie.confidence,
    lie.created_at
  from public.lead_intent_events lie
  join latest_intents li
    on li.account_id = lie.account_id
   and li.contact_id = lie.contact_id
   and li.last_intent_at = lie.created_at
),
-- Map lead_intent_events.contact_id to contacts.id
-- Try direct match first, then match through leads.email = contacts.email
contact_intent_map as (
  select distinct
    id.account_id,
    id.intent,
    id.confidence,
    id.created_at,
    coalesce(
      -- Direct match: contact_id = contacts.id
      c.id,
      -- Match through leads: find contact by email from lead
      (select c2.id
       from public.contacts c2
       join public.leads l on lower(l.email) = lower(c2.email)
       where l.id = id.contact_id
         and (
           (c2.account_id is not null and l.account_id = c2.account_id)
           or (c2.account_id is null and l.workspace_id = c2.workspace_id)
         )
       limit 1)
    ) as contact_id
  from intent_details id
  left join public.contacts c on c.id = id.contact_id
)
select
  c.id as contact_id,
  coalesce(c.account_id, c.workspace_id::uuid) as account_id,
  coalesce(
    nullif(trim(c.first_name || ' ' || c.last_name), ''),
    c.name,
    c.company,
    c.email,
    'Unknown'
  ) as display_name,
  c.email,
  c.company,
  cim.intent as latest_intent,
  cim.confidence as latest_intent_confidence,
  cim.created_at as last_intent_at,
  c.pipeline_stage,
  coalesce(c.pipeline_stage, cim.intent) as effective_stage
from public.contacts c
left join contact_intent_map cim
  on cim.contact_id = c.id
  and (
    -- Match by account_id if both exist
    (c.account_id is not null and cim.account_id = c.account_id)
    -- Or match by workspace_id if account_id is null on contacts
    or (c.account_id is null and cim.account_id::text = c.workspace_id::text)
  );

comment on view public.lead_pipeline_view is
  'Per-contact lead pipeline view combining manual pipeline_stage with latest AI intent.';

-- 4. Enable RLS on the view (inherits from contacts and lead_intent_events)
-- RLS policies should already exist on contacts and lead_intent_events tables


-- =========================================================
-- BLOCK 268100 — SmartSend Irreplaceability Sprint v1
-- “Make it feel dangerous to turn off” (truth + momentum, no dark patterns)
--
-- Adds:
-- - SmartSend-only "Homeowner" system tag (non-exportable)
-- - Surfaces tag in lead pipeline view for UI visibility
-- =========================================================

-- ---------------------------------------------------------
-- 1) SmartSend-only tag fields (contacts + leads)
-- ---------------------------------------------------------
alter table public.contacts
  add column if not exists smartsend_homeowner boolean not null default false;

alter table public.contacts
  add column if not exists smartsend_homeowner_at timestamptz;

create index if not exists idx_contacts_smartsend_homeowner_true
  on public.contacts(workspace_id, created_at desc)
  where smartsend_homeowner = true;

comment on column public.contacts.smartsend_homeowner is
  'Block 268100: SmartSend-only system tag. True when this contact has engaged (replied) via SmartSend intake.';

comment on column public.contacts.smartsend_homeowner_at is
  'Block 268100: When SmartSend first marked this contact as a SmartSend Homeowner.';

alter table public.leads
  add column if not exists smartsend_homeowner boolean not null default false;

alter table public.leads
  add column if not exists smartsend_homeowner_at timestamptz;

create index if not exists idx_leads_smartsend_homeowner_true
  on public.leads(workspace_id, created_at desc)
  where smartsend_homeowner = true;

comment on column public.leads.smartsend_homeowner is
  'Block 268100: SmartSend-only system tag. True when this lead has engaged (replied) via SmartSend intake.';

comment on column public.leads.smartsend_homeowner_at is
  'Block 268100: When SmartSend first marked this lead as a SmartSend Homeowner.';

-- ---------------------------------------------------------
-- 2) Surface system tag in lead pipeline view (contacts-based)
-- ---------------------------------------------------------
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
contact_intent_map as (
  select distinct
    id.account_id,
    id.intent,
    id.confidence,
    id.created_at,
    coalesce(
      c.id,
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
  coalesce(c.pipeline_stage, cim.intent) as effective_stage,
  c.smartsend_homeowner,
  c.smartsend_homeowner_at
from public.contacts c
left join contact_intent_map cim
  on cim.contact_id = c.id
  and (
    (c.account_id is not null and cim.account_id = c.account_id)
    or (c.account_id is null and cim.account_id::text = c.workspace_id::text)
  );

comment on view public.lead_pipeline_view is
  'Per-contact lead pipeline view combining manual pipeline_stage with latest AI intent (+ SmartSend-only homeowner tag).';









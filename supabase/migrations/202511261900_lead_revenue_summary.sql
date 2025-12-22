-- Block 8800 — Revenue & Activity Dashboard (Replies · Leads · Estimated Job Value)
-- SQL: add estimated_job_value + status and a lead_revenue_summary view

-- 1. Add revenue-related fields to contacts
alter table public.contacts
  add column if not exists estimated_job_value numeric(12,2),
  add column if not exists lead_status text
    check (lead_status in ('OPEN', 'WON', 'LOST'))
    default 'OPEN';

comment on column public.contacts.estimated_job_value is
  'Estimated job value in dollars for this contact/opportunity.';
comment on column public.contacts.lead_status is
  'Sales status: OPEN | WON | LOST';

-- 2. Ensure email_replies has contact_id (if not exists, we'll derive it)
-- Note: email_replies may link to contacts through send_logs -> leads -> contacts
-- For now, we'll count replies by account_id and derive contact_id when possible

-- 3. Summary view per account: replies, lead counts, and estimated value
-- Note: account_id in this context refers to coalesce(contacts.account_id, contacts.workspace_id::uuid)
-- as used in lead_pipeline_view

create or replace view public.lead_revenue_summary
as
with account_contacts as (
  -- Get all unique account_ids from contacts (account_id or workspace_id)
  select distinct coalesce(c.account_id, c.workspace_id::uuid) as account_id
  from public.contacts c
  where c.account_id is not null or c.workspace_id is not null
),
-- Map email_replies to contacts via send_logs -> leads -> contacts (by email)
reply_contacts as (
  select distinct
    er.account_id,
    c.id as contact_id
  from public.email_replies er
  left join public.send_logs sl on sl.id = er.send_log_id
  left join public.leads l on l.id = sl.lead_id
  left join public.contacts c on (
    lower(c.email) = lower(er.from_email)
    and (
      (c.account_id is not null and er.account_id = c.account_id)
      or (c.account_id is null and er.account_id::text = c.workspace_id::text)
    )
  )
  where er.account_id is not null
)
select
  a.account_id,

  -- total replies
  (
    select count(*)
    from public.email_replies r
    where r.account_id = a.account_id
  ) as total_replies,

  -- unique contacts who replied
  (
    select count(distinct rc.contact_id)
    from reply_contacts rc
    where rc.account_id = a.account_id
      and rc.contact_id is not null
  ) as contacts_replied,

  -- intent-based counts (using lead_pipeline_view from Block 8600)
  (
    select count(*)
    from public.lead_pipeline_view lp
    where lp.account_id = a.account_id
      and lp.effective_stage = 'HOT'
  ) as hot_leads,

  (
    select count(*)
    from public.lead_pipeline_view lp
    where lp.account_id = a.account_id
      and lp.effective_stage = 'WARM'
  ) as warm_leads,

  (
    select count(*)
    from public.lead_pipeline_view lp
    where lp.account_id = a.account_id
      and lp.effective_stage = 'FOLLOW_UP'
  ) as follow_up_leads,

  (
    select count(*)
    from public.lead_pipeline_view lp
    where lp.account_id = a.account_id
      and lp.effective_stage = 'NOT_INTERESTED'
  ) as not_interested_leads,

  -- revenue-related
  (
    select coalesce(sum(c.estimated_job_value), 0)
    from public.contacts c
    where coalesce(c.account_id, c.workspace_id::uuid) = a.account_id
      and c.lead_status = 'OPEN'
  ) as open_pipeline_value,

  (
    select coalesce(sum(c.estimated_job_value), 0)
    from public.contacts c
    where coalesce(c.account_id, c.workspace_id::uuid) = a.account_id
      and c.lead_status = 'WON'
  ) as won_revenue_value

from account_contacts a;

comment on view public.lead_revenue_summary is
  'Per-account summary of replies, lead counts by stage, and revenue metrics.';































































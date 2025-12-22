-- Ensure pg_trgm extension for trigram search support
create extension if not exists pg_trgm;

-- Helpful trigram indexes on lead fields
create index if not exists idx_leads_name_trgm
    on public.leads using gin (coalesce(name, '') gin_trgm_ops);

create index if not exists idx_leads_company_trgm
    on public.leads using gin (coalesce(company, '') gin_trgm_ops);

create index if not exists idx_leads_email_trgm
    on public.leads using gin (coalesce(email, '') gin_trgm_ops);

-- Last inbound label per thread
create or replace view public.v_thread_last_inbound as
select
    t.id as thread_id,
    (
        select nm.ai_label
        from public.normalized_messages nm
        where nm.linked_thread_id = t.id
          and nm.direction = 'inbound'
        order by nm.sent_at desc
        limit 1
    ) as last_inbound_label,
    (
        select nm.sent_at
        from public.normalized_messages nm
        where nm.linked_thread_id = t.id
          and nm.direction = 'inbound'
        order by nm.sent_at desc
        limit 1
    ) as last_inbound_at_real
from public.inbox_threads t;

alter view public.v_thread_last_inbound
    set (security_invoker = on);

-- Enriched inbox rows
create or replace view public.v_inbox_threads_enriched as
select
    t.id,
    t.campaign_id,
    t.lead_id,
    l.name as lead_name,
    l.company as lead_company,
    l.email as lead_email,
    t.last_inbound_at,
    t.last_outbound_at,
    t.replied_at,
    t.needs_reply,
    (t.snoozed_until is not null and t.snoozed_until > now()) as is_snoozed,
    t.snoozed_until,
    t.assigned_to,
    li.last_inbound_label
from public.inbox_threads t
join public.leads l on l.id = t.lead_id
left join public.v_thread_last_inbound li on li.thread_id = t.id;

alter view public.v_inbox_threads_enriched
    set (security_invoker = on);




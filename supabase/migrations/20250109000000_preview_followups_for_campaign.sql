-- Returns up to p_limit eligible leads for NEXT step (from_step+1),
-- with merged subject + scheduled_at (window-adjusted).
create or replace function public.preview_followups_for_campaign(
  p_campaign uuid,
  p_from_step int default 1,
  p_limit int default 50
) returns table(
  lead_id uuid,
  email citext,
  first_name text,
  last_name text,
  company text,
  step_no int,
  subject text,
  scheduled_at timestamptz
)
language sql
stable
set search_path=public
as $$
  with cfg as (
    select
      (p_from_step + 1) as next_step,
      coalesce(cs.offset_days, 2) as offset_days,
      cs.send_start, cs.send_end,
      cs.subject_template, cs.body_html_template
    from public.campaign_steps cs
    where cs.campaign_id = p_campaign
      and cs.step_no = p_from_step + 1
      and cs.enabled = true
    limit 1
  ),
  picked as (
    select
      coalesce(cfg.subject_template, c.subject_template) as subj,
      coalesce(cfg.body_html_template, c.body_html_template) as body,
      cfg.offset_days,
      cfg.send_start, cfg.send_end,
      (p_from_step + 1) as next_step
    from public.campaigns c
    cross join cfg
    where c.id = p_campaign
  ),
  last_sent as (
    select sl.lead_id, max(sl.created_at) as last_sent
    from public.send_logs sl
    where sl.campaign_id = p_campaign
      and sl.status = 'sent'
      and sl.step_no = p_from_step
    group by 1
  ),
  eligible as (
    select ls.lead_id, ls.last_sent
    from last_sent ls
    left join public.inbox_threads t
      on t.campaign_id = p_campaign and t.lead_id = ls.lead_id
    left join public.leads l on l.id = ls.lead_id
    left join lateral (
      select 1 from public.send_logs x
      where x.campaign_id = p_campaign and x.lead_id = ls.lead_id and x.step_no = (p_from_step+1)
      limit 1
    ) sent_next on true
    left join lateral (
      select 1 from public.send_queue q
      where q.campaign_id = p_campaign
        and q.lead_id = ls.lead_id
        and q.step_no = (p_from_step+1)
        and q.status in ('queued','sending')
      limit 1
    ) queued_next on true
    where t.replied_at is null
      and coalesce(l.opted_out_at, null) is null
      and coalesce(l.bounced_at, null) is null
      and sent_next is null
      and queued_next is null
  ),
  plan as (
    select
      e.lead_id,
      public.apply_send_window(
        e.last_sent + (picked.offset_days || ' days')::interval,
        picked.send_start, picked.send_end
      ) as scheduled_at
    from eligible e, picked
    order by 2 asc
    limit p_limit
  )
  select
    l.id as lead_id,
    l.email::citext as email,
    l.first_name, l.last_name, l.company,
    picked.next_step as step_no,
    coalesce(
      replace(replace(replace(replace(replace(picked.subj,
        '{{first_name}}', coalesce(l.first_name,'')),
        '{{last_name}}',  coalesce(l.last_name,'')),
        '{{company}}',    coalesce(l.company,'')),
        '{{email}}',      coalesce(l.email,'')),
        '{{domain}}',     coalesce(l.domain::text,'')),
      '[No subject]'
    ) as subject,
    plan.scheduled_at
  from plan
  join public.leads l on l.id = plan.lead_id
  cross join picked
  order by plan.scheduled_at asc;
$$;

grant execute on function public.preview_followups_for_campaign(uuid, int, int) to authenticated, service_role;

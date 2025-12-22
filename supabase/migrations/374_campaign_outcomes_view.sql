-- Block 374 — Campaign Outcomes Rollup v1
-- Per-campaign aggregated metrics: sends, replies, meetings, closed-won value

create or replace view campaign_outcomes as
with base as (
  select
    c.id as campaign_id,
    c.workspace_id,

    -- sends (count where status = 'sent')
    -- Handle both cases: send_logs with workspace_id directly or via campaigns join
    coalesce(
      (
        select count(*)
        from send_logs s
        left join campaigns sc on sc.id = s.campaign_id
        where coalesce(s.workspace_id, sc.workspace_id) = c.workspace_id
          and s.campaign_id = c.id
          and coalesce(s.status, 'sent') = 'sent'
      ),
      0
    ) as total_sent,

    -- replies (unique reply rows)
    coalesce(
      (
        select count(*)
        from reply_logs r
        where r.workspace_id = c.workspace_id
          and r.campaign_id = c.id
      ),
      0
    ) as total_replies,

    -- meetings (ai_has_meeting = true)
    coalesce(
      (
        select count(*)
        from reply_logs r
        where r.workspace_id = c.workspace_id
          and r.campaign_id = c.id
          and r.ai_has_meeting = true
      ),
      0
    ) as total_meetings,

    -- closed-won deal value
    coalesce(
      (
        select sum(r.deal_value_cents)
        from reply_logs r
        where r.workspace_id = c.workspace_id
          and r.campaign_id = c.id
          and r.meeting_stage = 'closed_won'
      ),
      0
    ) as closed_won_value_cents

  from campaigns c
)
select * from base;

-- Grant access to authenticated users
grant select on campaign_outcomes to authenticated;
grant select on campaign_outcomes to service_role;


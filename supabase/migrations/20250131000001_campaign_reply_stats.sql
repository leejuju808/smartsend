-- Block 141 — Campaign Reply Stats (per-campaign AI reply analytics strip)

-- Create view for per-campaign reply stats
create or replace view public.campaign_reply_stats as
select
  c.id as campaign_id,
  c.account_id,

  -- basic counts
  count(sl.id) as total_sends,
  count(sl.id) filter (where sl.reply_status = 'replied') as total_replied,

  -- AI-based counts (via email_replies)
  count(distinct er.id) filter (where er.reply_kind = 'positive_meeting') as meeting_replies,
  count(distinct er.id) filter (where er.reply_kind = 'positive_no_meeting') as positive_no_meeting_replies,
  count(distinct er.id) filter (where er.reply_kind = 'neutral_question') as neutral_question_replies,
  count(distinct er.id) filter (where er.reply_kind = 'unsubscribe' or er.is_unsubscribe = true) as unsubscribe_replies,
  count(distinct er.id) filter (where er.reply_kind = 'bounce' or er.is_bounce = true) as bounce_replies,

  max(er.created_at) as last_reply_at

from public.campaigns c
left join public.send_logs sl
  on sl.campaign_id = c.id
left join public.email_replies er
  on er.send_log_id = sl.id
group by c.id, c.account_id;

-- Grant access to authenticated users
grant select on public.campaign_reply_stats to authenticated;


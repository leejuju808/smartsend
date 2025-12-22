-- Optional RPC helper functions for bumping open and click stats

create or replace function bump_open(p_campaign_id uuid)
returns void language sql as $$
  update email_stats
     set opens = opens + 1
   where campaign_name in (select name from campaigns where id = p_campaign_id);
$$;

create or replace function bump_click(p_campaign_id uuid)
returns void language sql as $$
  update email_stats
     set clicks = clicks + 1
   where campaign_name in (select name from campaigns where id = p_campaign_id);
$$;
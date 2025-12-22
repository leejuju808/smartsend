-- Optional: a tiny view to speed up counts per user (owner or share-viewer)
-- Idempotent: safe to run multiple times

create or replace view public.v_inbox_triage as
select
  t.id,
  t.campaign_id,
  t.status,
  t.assigned_to,
  t.last_ai_label
from public.inbox_threads t
join public.campaigns c on c.id = t.campaign_id and c.deleted_at is null
where public.can_view_campaign(t.campaign_id);


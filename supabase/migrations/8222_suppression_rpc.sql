-- 8222 - Upsert function for global suppressions

create or replace function public.upsert_global_suppression(
  p_org_id uuid,
  p_email text,
  p_reason text,
  p_campaign_id uuid,
  p_queue_id uuid
)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.global_suppressions (org_id, email, reason, source, campaign_id, queue_id)
  values (p_org_id, p_email, p_reason, 'system', p_campaign_id, p_queue_id)
  on conflict (org_id, email_normalized)
  do update set reason = excluded.reason,
                source = excluded.source,
                campaign_id = excluded.campaign_id,
                queue_id = excluded.queue_id,
                created_at = now();
end;
$$;


































































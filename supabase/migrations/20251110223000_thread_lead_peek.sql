set search_path = public, pg_temp;

create or replace view public.v_thread_lead_peek as
select
  t.id as thread_id,
  t.campaign_id,
  l.id as lead_id,
  coalesce(nullif(l.first_name, ''), split_part(coalesce(l.full_name, ''), ' ', 1)) as lead_first,
  nullif(l.company, '') as company,
  nullif(l.booking_link, '') as booking_link
from public.inbox_threads t
left join public.leads l on l.id = t.lead_id;

create index if not exists idx_v_thread_lead_peek_thread on public.inbox_threads(id);

create or replace function public.thread_lead_peek(p_thread_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $function$
declare
  rec record;
begin
  select
    t.id,
    t.campaign_id,
    l.id as lead_id,
    coalesce(nullif(l.first_name, ''), split_part(coalesce(l.full_name, ''), ' ', 1)) as lead_first,
    nullif(l.company, '') as company,
    nullif(l.booking_link, '') as booking_link
  into rec
  from public.inbox_threads t
  left join public.leads l on l.id = t.lead_id
  where t.id = p_thread_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'thread_not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'thread_id', rec.id,
    'campaign_id', rec.campaign_id,
    'lead_id', rec.lead_id,
    'lead_first', coalesce(rec.lead_first, ''),
    'company', coalesce(rec.company, ''),
    'booking_link', coalesce(rec.booking_link, '')
  );
end;
$function$;


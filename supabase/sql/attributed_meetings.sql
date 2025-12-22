-- SmartSendAI — Meeting Attribution
-- Links meetings to campaigns when possible.
-- Attribution logic:
--   1) If meeting.contact_id exists → find their most recent message (sent or replied) → use that campaign_id
--   2) Otherwise, leave campaign_id NULL

-- 0) Add nullable campaign_id column if not present
alter table public.meetings
  add column if not exists campaign_id uuid references public.campaigns(id) on delete set null;

-- 1) Attribution RPC: attribute new meetings to campaigns
create or replace function public.attribute_meeting_campaigns(in_profile_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  rec record;
  v_camp uuid;
begin
  for rec in
    select m.id, m.contact_id
    from public.meetings m
    where m.profile_id = in_profile_id
      and m.contact_id is not null
      and m.campaign_id is null
  loop
    -- Find most recent campaign message for this contact
    select campaign_id into v_camp
    from public.messages
    where profile_id = in_profile_id
      and contact_id = rec.contact_id
    order by created_at desc
    limit 1;

    if v_camp is not null then
      update public.meetings
      set campaign_id = v_camp
      where id = rec.id;
    end if;
  end loop;
end;
$$;

grant execute on function public.attribute_meeting_campaigns(uuid) to authenticated;

-- 2) Attribution view for reporting
create or replace view public.meetings_by_campaign as
select
  c.profile_id,
  m.campaign_id,
  c.name as campaign_name,
  count(*) as meetings
from public.meetings m
left join public.campaigns c on c.id = m.campaign_id
group by c.profile_id, m.campaign_id, c.name; 
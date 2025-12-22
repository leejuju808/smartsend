-- Reply Tracking & Automation Hooks
-- Extends leads & campaign_sends for reply tracking with automation hooks

-- 1) Extend leads & campaign_sends for reply tracking
alter table public.leads
  add column if not exists last_replied_at timestamptz,
  add column if not exists replied boolean not null default false;

alter table public.campaign_sends
  add column if not exists replied boolean not null default false,
  add column if not exists replied_at timestamptz;

-- Indexes for performance
create index if not exists idx_leads_replied on public.leads(replied, last_replied_at desc);
create index if not exists idx_campaign_sends_replied on public.campaign_sends(replied, replied_at desc);

-- 2) Helper function to mark a lead as replied + pause sequences
create or replace function public.mark_as_replied(p_email_id uuid)
returns void language plpgsql security definer as $$
declare
  v_lead_id uuid;
  v_campaign_id uuid;
begin
  -- Get lead_id and campaign_id from emails table
  select lead_id, campaign_id into v_lead_id, v_campaign_id
  from public.emails where id = p_email_id;

  -- Update leads table
  if v_lead_id is not null then
    update public.leads
       set replied = true,
           last_replied_at = now()
     where id = v_lead_id;
  end if;

  -- Update campaign_sends table
  if v_lead_id is not null and v_campaign_id is not null then
    update public.campaign_sends
       set replied = true,
           replied_at = now()
     where lead_id = v_lead_id
       and campaign_id = v_campaign_id;
  end if;

  -- Pause sequences for this lead/campaign combination
  -- Try sequence_progress first (most common pattern)
  if v_lead_id is not null and v_campaign_id is not null then
    if exists (select 1 from information_schema.tables where table_name = 'sequence_progress') then
      update public.sequence_progress
         set status = 'paused'
       where lead_id = v_lead_id
         and campaign_id = v_campaign_id
         and status = 'active';
    end if;

    -- Also try sequence_enrollments if it exists
    if exists (select 1 from information_schema.tables where table_name = 'sequence_enrollments') then
      -- Check if sequence_enrollments has campaign_id column
      if exists (
        select 1 from information_schema.columns 
        where table_name = 'sequence_enrollments' and column_name = 'campaign_id'
      ) then
        update public.sequence_enrollments
           set status = 'paused'
         where lead_id = v_lead_id
           and campaign_id = v_campaign_id
           and status = 'active';
      -- If sequence_enrollments links via sequence_id -> campaign_id
      elsif exists (
        select 1 from information_schema.columns 
        where table_name = 'sequence_enrollments' and column_name = 'sequence_id'
      ) and exists (
        select 1 from information_schema.tables where table_name = 'sequences'
      ) then
        update public.sequence_enrollments
           set status = 'paused'
         where lead_id = v_lead_id
           and sequence_id in (
             select id from public.sequences where campaign_id = v_campaign_id
           )
           and status = 'active';
      end if;
    end if;
  end if;
end$$;

-- Grant execute permission to authenticated users
grant execute on function public.mark_as_replied(uuid) to authenticated;

-- 3) Trigger function to auto-mark when reply detected
create or replace function public.auto_mark_replied_from_brain()
returns trigger language plpgsql as $$
begin
  -- Check if this is a valid reply intent with sufficient confidence
  if new.intent in ('positive','neutral','negative','question','meeting_interest')
     and new.confidence >= 0.6 then
    perform public.mark_as_replied(new.email_id);
  end if;
  return new;
end$$;

-- Drop existing trigger if it exists
drop trigger if exists trg_auto_mark_replied on public.reply_brain_inferences;

-- Create trigger
create trigger trg_auto_mark_replied
after insert on public.reply_brain_inferences
for each row execute function public.auto_mark_replied_from_brain();

-- 4) Audit summary view
create or replace view public.reply_audit_summary as
select
  c.account_id,
  count(*) filter (where cs.replied) as total_replied,
  count(*) filter (where not cs.replied) as awaiting,
  round(100.0 * count(*) filter (where cs.replied) / greatest(count(*),1), 1) as reply_rate
from public.campaign_sends cs
join public.campaigns c on c.id = cs.campaign_id
group by c.account_id;

-- Grant select on view
grant select on public.reply_audit_summary to authenticated;
















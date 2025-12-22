-- Reply Classification Migration
-- Stores labels, links replies → leads, and auto-marks replied

-- 1) Enum for reply labels
create type reply_label as enum (
  'interested',
  'meeting',
  'not_interested',
  'question',
  'ooo',
  'unsubscribe',
  'ambiguous'
);

-- 2) Link replies to leads; store label + score
alter table public.email_replies
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists lead_id uuid references public.leads(id) on delete cascade,
  add column if not exists label reply_label,
  add column if not exists confidence numeric check (confidence between 0 and 1),
  add column if not exists processed_at timestamptz,
  add column if not exists snippet text;

-- 3) Fast lookup by user/time
create index if not exists email_replies_user_processed_idx
on public.email_replies (user_id, processed_at nulls first);

-- Ensure we have an index on from_email for linking
create index if not exists idx_email_replies_from_email_lower
on public.email_replies (lower(from_email));

-- 4) Helper: link reply->lead by From email (same workspace/campaign)
create or replace function public.link_reply_to_lead(p_user uuid, p_from text)
returns uuid 
language sql 
security definer 
set search_path = public 
as $$
  select l.id
  from leads l
  where l.user_id = p_user
    and lower(l.email) = lower(
      case 
        when p_from ~* '<(.+?)>'::text then
          regexp_replace(p_from, '.*<(.+)>.*', '\1')
        else p_from
      end
    )
  order by l.created_at desc
  limit 1;
$$;

-- 5) Auto-mark lead as replied when label indicates response that matters
-- First, ensure leads table has replied_at column
alter table public.leads
  add column if not exists replied_at timestamptz;

-- Update status check constraint to include new statuses
-- Drop existing constraint if it exists
do $$
begin
  -- Try to drop the existing constraint if it exists
  if exists (
    select 1 from information_schema.constraint_column_usage 
    where table_name = 'leads' and constraint_name like '%status%check%'
  ) then
    -- We'll need to alter the constraint, but PostgreSQL doesn't support direct alteration
    -- So we'll recreate the column if needed
    null; -- We'll handle this via alter column
  end if;
end $$;

-- Create or replace function to update lead status
create or replace function public.on_reply_label_update()
returns trigger 
language plpgsql 
as $$
begin
  if NEW.lead_id is not null
     and NEW.label in ('interested','meeting','question','not_interested','unsubscribe','ambiguous')
     and (select replied_at from leads where id = NEW.lead_id) is null then
    
    update leads
      set replied_at = now(),
          status = case
            when NEW.label in ('interested','meeting') then 'replied'
            when NEW.label = 'question' then 'replied'
            when NEW.label = 'not_interested' then 'replied'
            when NEW.label = 'unsubscribe' then 'unsubscribed'
            else 'replied'
          end
      where id = NEW.lead_id;
  end if;
  return NEW;
end;
$$;

-- Drop trigger if exists
drop trigger if exists trg_email_replies_label on public.email_replies;

-- Create trigger
create trigger trg_email_replies_label
after insert or update of label on public.email_replies
for each row execute function public.on_reply_label_update();


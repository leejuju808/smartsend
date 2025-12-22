-- Notifications system for lead reply alerts
-- Creates notifications table, RLS policies, and trigger for auto-creation

-- 1) Notifications table
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  title text not null,
  body text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- 2) Speed up unread queries
create index if not exists idx_notifications_user_unread
  on notifications(user_id, is_read, created_at desc);

-- 3) RLS
alter table notifications enable row level security;

create policy "users see their own notifications"
on notifications for select
to authenticated
using (auth.uid() = user_id);

create policy "users can update their notifications"
on notifications for update
to authenticated
using (auth.uid() = user_id);

-- 4) Allow insert from service role only (via trigger)
create policy "service role can insert notifications"
on notifications for insert
to service_role
with check (true);

-- 5) Trigger: when a lead is marked replied, insert a notification
create or replace function public.fn_notify_lead_reply()
returns trigger language plpgsql as $$
declare
  v_user_id uuid;
  v_campaign_id uuid;
  v_title text;
begin
  -- only fire when replied flips to true or status changes to 'replied'
  if TG_OP = 'UPDATE' and (
    (not coalesce(OLD.replied,false)) and NEW.replied = true
    OR OLD.status != 'replied' and NEW.status = 'replied'
  ) then
    -- lookup campaign and user
    -- If leads has user_id directly, use that
    select c.user_id, NEW.campaign_id into v_user_id, v_campaign_id
    from campaigns c
    where c.id = NEW.campaign_id
    limit 1;

    -- fallback: try to get user_id from leads if it exists
    if v_user_id is null and NEW.user_id is not null then
      v_user_id := NEW.user_id;
    end if;

    -- if we found a user, create notification
    if v_user_id is not null then
      v_title := 'New reply: ' || coalesce(
        NEW.first_name || ' ' || NEW.last_name,
        NEW.email,
        'Lead'
      );

      insert into notifications(user_id, campaign_id, lead_id, title, body)
      values (v_user_id, v_campaign_id, NEW.id, v_title, left(coalesce(NEW.reply_text, ''), 280));
    end if;
  end if;

  return NEW;
end $$;

drop trigger if exists trg_notify_lead_reply on leads;
create trigger trg_notify_lead_reply
after update on leads
for each row execute procedure public.fn_notify_lead_reply();


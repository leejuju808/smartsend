-- 1) Extend followup_rules with auto-mark policy columns
alter table public.followup_rules
  add column if not exists auto_mark_replied boolean not null default true,
  add column if not exists reply_labels text[] not null default '{human_reply,question,positive,neutral,routing}';

-- 2) Helper to determine whether a label counts as a reply for the given campaign
create or replace function public.label_is_reply_for_campaign(p_campaign uuid, p_label text)
returns boolean
language sql
stable
as $$
  select coalesce(p_label, '') = any(
    coalesce(
      (
        select fr.reply_labels
        from public.followup_rules fr
        where fr.campaign_id = p_campaign
      ),
      array['human_reply','question','positive','neutral','routing']::text[]
    )
  );
$$;

-- 3) Trigger function to auto-mark threads on inbound reply-ish messages
create or replace function public.fn_autoreply_mark()
returns trigger
language plpgsql
security definer
as $$
declare
  v_campaign uuid;
  v_lead uuid;
  v_auto boolean;
  v_is_reply boolean;
begin
  -- Only process inbound messages
  if new.direction <> 'inbound' then
    return new;
  end if;

  -- Resolve campaign + lead for this thread
  select t.campaign_id, t.lead_id
    into v_campaign, v_lead
  from public.inbox_threads t
  where t.id = new.linked_thread_id;

  if v_campaign is null then
    return new;
  end if;

  -- Check policy + label fit
  select coalesce(fr.auto_mark_replied, true)
    into v_auto
  from public.followup_rules fr
  where fr.campaign_id = v_campaign;

  v_is_reply := public.label_is_reply_for_campaign(v_campaign, new.ai_label);

  if coalesce(v_auto, true) and v_is_reply then
    -- 1) Mark thread as needing human reply in the UI
    update public.inbox_threads
      set needs_reply = true
    where id = new.linked_thread_id;

    -- 2) Flip campaign_lead status to 'replied'
    update public.campaign_leads cl
      set status = 'replied'
    where cl.campaign_id = v_campaign
      and cl.lead_id = v_lead
      and cl.status <> 'replied';

    -- 3) (Optional) Cancel any future queued sends for this thread if send_queue exists
    do $inner$
    begin
      if exists (
        select 1
        from information_schema.tables
        where table_schema = 'public'
          and table_name = 'send_queue'
      ) then
        if exists (
          select 1
          from information_schema.columns
          where table_schema = 'public'
            and table_name = 'send_queue'
            and column_name = 'canceled'
        ) then
          update public.send_queue
             set canceled = true
           where thread_id = new.linked_thread_id
             and coalesce(canceled, false) = false
             and (select now() at time zone 'utc') <= coalesce(scheduled_at, now());
        end if;
      end if;
    exception
      when others then
        -- Optional autopause issues should not block core auto-mark logic
        null;
    end
    $inner$;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_autoreply_mark on public.normalized_messages;

create trigger trg_autoreply_mark
after insert on public.normalized_messages
for each row
execute function public.fn_autoreply_mark();


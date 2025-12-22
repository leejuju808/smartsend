-- Follow-up resume mechanics (idempotent)

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.followup_tasks'::regclass
      and conname = 'followup_tasks_status_check_v2'
  ) then
    alter table public.followup_tasks
      drop constraint followup_tasks_status_check_v2;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.followup_tasks'::regclass
      and conname = 'followup_tasks_status_check'
  ) then
    alter table public.followup_tasks
      drop constraint followup_tasks_status_check;
  end if;
end
$$;

alter table public.followup_tasks
  add constraint followup_tasks_status_check_v3
  check (
    status in (
      'pending','queued','scheduled','working','running','processing',
      'done','sent','draft','drafted','paused','skipped','canceled',
      'error','failed','dead'
    )
  );

create index if not exists idx_followup_tasks_paused
  on public.followup_tasks(campaign_id, lead_id)
  where status = 'paused';

create or replace function public.resume_followups_for_lead(
  p_campaign_id uuid,
  p_lead_id uuid,
  p_reason text default 'auto_resume'
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed boolean := false;
  v_had_pause boolean := false;
begin
  with upd as (
    update public.followup_tasks
       set status = 'pending',
           reason = null,
           updated_at = now()
     where campaign_id = p_campaign_id
       and lead_id = p_lead_id
       and status = 'paused'
     returning 1
  )
  select true into v_changed
  where exists (select 1 from upd);

  select exists (
    select 1
    from public.campaign_leads
    where campaign_id = p_campaign_id
      and lead_id = p_lead_id
      and (
        paused_reason is not null
        or paused_until is not null
      )
  ) into v_had_pause;

  if v_changed or v_had_pause then
    begin
      update public.campaign_leads
         set paused_at = null,
             paused_until = null,
             paused_reason = null
       where campaign_id = p_campaign_id
         and lead_id = p_lead_id;
    exception
      when undefined_column then
        update public.campaign_leads
           set paused_until = null,
               paused_reason = null
         where campaign_id = p_campaign_id
           and lead_id = p_lead_id;
    end;

    begin
      update public.inbox_threads
         set paused_reason = null,
             paused_until = null,
             auto_paused_reason = null,
             auto_paused_until = null,
             paused_by_system = false
       where campaign_id = p_campaign_id
         and lead_id = p_lead_id;
    exception
      when undefined_column then
        null;
    end;

    insert into public.delivery_events (campaign_id, lead_id, event, meta)
    values (
      p_campaign_id,
      p_lead_id,
      'ooo_auto_resume',
      jsonb_build_object('reason', p_reason)
    );

    begin
      insert into public.activity_events (campaign_id, kind, subject_id, meta)
      values (
        p_campaign_id,
        'ooo_auto_resume',
        p_lead_id,
        jsonb_build_object('reason', p_reason)
      );
    exception
      when undefined_table then
        null;
    end;
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.delivery_events'::regclass
      and conname = 'delivery_events_event_check'
  ) then
    alter table public.delivery_events
      drop constraint delivery_events_event_check;
  end if;
end
$$;

alter table public.delivery_events
  add constraint delivery_events_event_check
  check (
    event in (
      'sent','delivered','opened','clicked','bounced',
      'reply_detected','ooo_detected','unsubscribe_detected',
      'manual_pause','enqueue_blocked','inbound_reply','ooo_auto_resume'
    )
  );

create or replace function public.tg_auto_resume_on_reply()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_label text;
begin
  if new.event <> 'inbound_reply' then
    return new;
  end if;

  v_label := coalesce(new.meta->>'label', '');

  if v_label is distinct from 'out_of_office' then
    perform public.resume_followups_for_lead(
      new.campaign_id,
      new.lead_id,
      'inbound_reply'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_auto_resume_on_reply on public.delivery_events;

create trigger trg_auto_resume_on_reply
after insert on public.delivery_events
for each row
execute function public.tg_auto_resume_on_reply();



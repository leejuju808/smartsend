-- Safe follow-up pause/resume, event dedupe, reconcile helpers

create or replace function public.safe_pause_followups(
  p_campaign_id uuid,
  p_lead_id uuid,
  p_reason text default 'ooo_auto',
  p_snooze_until timestamptz default null
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  affected int := 0;
  has_active boolean;
  new_snooze timestamptz;
begin
  select exists (
    select 1
    from public.followup_tasks
    where campaign_id = p_campaign_id
      and lead_id = p_lead_id
      and status in ('pending', 'scheduled')
  ) into has_active;

  if not has_active then
    return 0;
  end if;

  update public.followup_tasks
     set status = 'paused',
         reason = p_reason,
         updated_at = now(),
         snooze_until = case
           when p_snooze_until is null then snooze_until
           when snooze_until is null then p_snooze_until
           when p_snooze_until > snooze_until then p_snooze_until
           else snooze_until
         end
   where campaign_id = p_campaign_id
     and lead_id = p_lead_id
     and status in ('pending', 'scheduled');

  get diagnostics affected = row_count;

  if affected > 0 then
    select max(snooze_until)
      into new_snooze
      from public.followup_tasks
     where campaign_id = p_campaign_id
       and lead_id = p_lead_id
       and status = 'paused';

    insert into public.delivery_events (campaign_id, lead_id, type, meta)
    values (
      p_campaign_id,
      p_lead_id,
      'ooo_auto_pause',
      jsonb_build_object(
        'reason', p_reason,
        'snooze_until', new_snooze
      )
    );
  end if;

  return affected;
end;
$$;


create or replace function public.resume_followups_for_lead(
  p_campaign_id uuid,
  p_lead_id uuid,
  p_reason text default 'auto_resume'
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  affected int := 0;
begin
  update public.followup_tasks
     set status = 'pending',
         reason = null,
         snooze_until = null,
         updated_at = now()
   where campaign_id = p_campaign_id
     and lead_id = p_lead_id
     and status = 'paused';

  get diagnostics affected = row_count;

  if affected > 0 then
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

    insert into public.delivery_events (campaign_id, lead_id, type, meta)
    values (
      p_campaign_id,
      p_lead_id,
      'ooo_auto_resume',
      jsonb_build_object('reason', p_reason)
    );
  end if;

  return affected;
end;
$$;


create index if not exists idx_followup_tasks_pending
  on public.followup_tasks (campaign_id, lead_id)
  where status in ('pending', 'scheduled');

create index if not exists idx_followup_tasks_only_paused
  on public.followup_tasks (campaign_id, lead_id)
  where status = 'paused';


create or replace function public.tg_dedupe_events()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  cutoff timestamptz := (now() - interval '30 minutes');
  exists_recent boolean;
  v_kind text := coalesce(new.type, new.event);
begin
  if v_kind = any (array['ooo_auto_pause', 'ooo_auto_resume', 'ooo_skip_delegated']) then
    select exists (
      select 1
      from public.delivery_events e
      where e.campaign_id = new.campaign_id
        and e.lead_id     = new.lead_id
        and coalesce(e.type, e.event) = v_kind
        and e.created_at >= cutoff
    ) into exists_recent;

    if exists_recent then
      return null;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_dedupe_events on public.delivery_events;

create trigger trg_dedupe_events
before insert on public.delivery_events
for each row
execute function public.tg_dedupe_events();


create or replace function public.tg_auto_resume_on_reply()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_label text;
  recent_ooo boolean;
  v_kind text := coalesce(new.type, new.event);
begin
  if v_kind is distinct from 'inbound_reply' then
    return new;
  end if;

  v_label := coalesce(new.meta->>'label', '');

  select exists (
    select 1
    from public.delivery_events d
    where d.campaign_id = new.campaign_id
      and d.lead_id     = new.lead_id
      and coalesce(d.type, d.event) = 'ooo_auto_pause'
      and d.created_at >= now() - interval '5 minutes'
  ) into recent_ooo;

  if v_label is distinct from 'out_of_office' and not recent_ooo then
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


create or replace function public.reconcile_candidates()
returns table(
  id uuid,
  campaign_id uuid,
  lead_id uuid,
  created_at timestamptz,
  meta jsonb
)
language sql
stable
as $$
  with ranked as (
    select
      e.*,
      row_number() over (
        partition by e.campaign_id, e.lead_id
        order by e.created_at desc
      ) as rn
    from public.delivery_events e
    where coalesce(e.type, e.event) = 'inbound_reply'
      and e.created_at >= now() - interval '30 days'
  )
  select id, campaign_id, lead_id, created_at, meta
  from ranked
  where rn = 1
  limit 1000
$$;

create index if not exists idx_delivery_events_inbound_recent
  on public.delivery_events (campaign_id, lead_id, created_at desc)
  where coalesce(type, event) = 'inbound_reply'
    and created_at >= now() - interval '30 days';


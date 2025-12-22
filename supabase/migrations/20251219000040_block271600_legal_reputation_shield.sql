-- Block 271600 — SmartSend Legal + Reputation Shield Sprint
-- Compliance-by-default + instant DNC enforcement.

begin;

-- 1) Cancel any queued outbound for a recipient (best-effort across schemas)
create or replace function public.ss_cancel_outbound_for_email(
  p_workspace_id uuid,
  p_email text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  v_email := lower(trim(p_email));
  if v_email is null or v_email = '' then
    return;
  end if;

  -- campaign_send_queue (Outbound Engine v2)
  begin
    if to_regclass('public.campaign_send_queue') is not null then
      execute $q$
        update public.campaign_send_queue
        set
          status = 'skipped_suppressed',
          skip_reason = 'global_suppression',
          suppressed = true,
          locked_at = null,
          worker_id = null,
          last_error = coalesce(last_error, 'global_suppression')
        where workspace_id = $1
          and lower(to_email) = $2
          and status in ('pending','retry','queued','scheduled','throttled')
      $q$
      using p_workspace_id, v_email;
    end if;
  exception when others then
    -- schema drift safe
    null;
  end;

  -- send_queue (legacy / campaign queue)
  begin
    if to_regclass('public.send_queue') is not null and to_regclass('public.leads') is not null then
      execute $q$
        update public.send_queue sq
        set
          status = 'skipped',
          skip_reason = 'global_suppression',
          last_error = coalesce(sq.last_error, 'global_suppression')
        where sq.workspace_id = $1
          and sq.lead_id in (
            select l.id from public.leads l
            where l.workspace_id = $1
              and lower(l.email) = $2
          )
          and sq.status in ('pending','queued','retry','sending')
      $q$
      using p_workspace_id, v_email;
    end if;
  exception when others then
    null;
  end;

  -- followup_tasks (if present)
  begin
    if to_regclass('public.followup_tasks') is not null and to_regclass('public.leads') is not null then
      -- Best effort: mark queued/running followups as skipped.
      execute $q$
        update public.followup_tasks ft
        set
          status = 'skipped',
          reason = 'opted_out',
          updated_at = now()
        where ft.lead_id in (
          select l.id from public.leads l
          where l.workspace_id = $1
            and lower(l.email) = $2
        )
          and ft.status in ('queued','running')
      $q$
      using p_workspace_id, v_email;
    end if;
  exception when others then
    null;
  end;
end;
$$;

comment on function public.ss_cancel_outbound_for_email(uuid, text)
  is 'Cancel queued outbound sends + followups for a recipient (instant DNC).';

-- 2) Trigger: when a suppression is added, instantly cancel queued outbound.
create or replace function public.ss_on_suppression_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ss_cancel_outbound_for_email(new.workspace_id, new.email);
  return new;
end;
$$;

drop trigger if exists trg_ss_on_suppression_insert on public.suppression_list;
create trigger trg_ss_on_suppression_insert
after insert on public.suppression_list
for each row
execute function public.ss_on_suppression_insert();

commit;




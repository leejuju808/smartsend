-- ============================================================================
-- Block 292000 — Audit Logs: allow lead outreach status overrides
-- Ensures audit_logs.action check constraint includes lead.outreach_status_override.
-- Idempotent and best-effort (handles schema drift).
-- ============================================================================

do $$
begin
  -- Only attempt if audit_logs exists and has an action column
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'audit_logs' and column_name = 'action'
  ) then
    -- Drop existing action constraint if present
    if exists (select 1 from pg_constraint where conname = 'audit_logs_action_check') then
      alter table public.audit_logs drop constraint audit_logs_action_check;
    end if;

    -- Recreate with existing known actions + our new action
    alter table public.audit_logs
      add constraint audit_logs_action_check check (action in (
        'share.add', 'share.update', 'share.remove',
        'invite.create', 'invite.accept', 'invite.expire',
        'launch', 'launch_denied', 'launch_blocked', 'launch_error',
        'pause', 'resume',
        'edit_template', 'queue_build', 'tick_error',
        'share_add', 'share_remove', 'role_change',
        'schedule_update',
        'lead.outreach_status_override'
      ));
  end if;
exception when others then
  -- Keep permissive if constraint creation fails due to drift.
  null;
end $$;










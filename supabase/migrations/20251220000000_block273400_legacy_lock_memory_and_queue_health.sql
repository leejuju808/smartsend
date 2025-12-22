-- =========================================================
-- Block 273400 — SmartSend Legacy Lock Sprint (Foundations)
-- Goal:
-- - Make queue health + dead-letter workflows permanent (DB-migrated, not ad-hoc SQL)
-- - Add durable "long-term memory" rollups: reply patterns + seasonal truth from timeline_events
-- =========================================================

-- ============================================================================
-- 1) Outbound queue health primitives (admin UI depends on these)
--    - Views: v_queue_health, v_retry_attempts_hist, v_dead_letters_recent
--    - RPC:   dead_letter_resubmit(p_deadletter uuid)
-- ============================================================================

-- 1A) Make send_queue status constraint permissive enough for all known workers
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'send_queue' and column_name = 'status'
  ) then
    begin
      alter table public.send_queue drop constraint if exists send_queue_status_check;
    exception when undefined_object then null;
    end;

    -- NOTE: mark NOT VALID to avoid failing on legacy rows; can be validated later.
    begin
      alter table public.send_queue
        add constraint send_queue_status_check
        check (
          status in (
            -- legacy
            'queued','sending','sent','failed','skipped','canceled','cancelled',
            -- v2/v3
            'pending','scheduled','deferred','running','picked','retry_scheduled',
            -- resilience
            'dead_letter','dead','blocked_quota'
          )
        ) not valid;
    exception when duplicate_object then null;
    end;
  end if;
exception
  when undefined_table then null;
end $$;

-- 1B) Ensure send_queue has the columns required by health views / resubmit
alter table if exists public.send_queue
  add column if not exists attempts int not null default 0,
  add column if not exists attempt_count int not null default 0,
  add column if not exists retry_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists dead_letter boolean not null default false,
  add column if not exists last_error_code text,
  add column if not exists last_error_msg text,
  add column if not exists to_email text,
  add column if not exists locked_at timestamptz,
  add column if not exists not_before timestamptz,
  add column if not exists updated_at timestamptz default now();

create index if not exists idx_send_queue_status_retry_at
  on public.send_queue(status, retry_at);

create index if not exists idx_send_queue_dead_letter
  on public.send_queue(dead_letter)
  where dead_letter = true;

-- 1C) Dead letters table: ensure columns used by views exist
create table if not exists public.dead_letters (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  queue_id uuid references public.send_queue(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  account_id uuid references public.connected_accounts(id) on delete set null,
  lead_id uuid,
  error_code text,
  error_msg text,
  attempt_count int not null default 0,
  payload jsonb,
  provider text,
  provider_message_id text,
  meta jsonb
);

alter table if exists public.dead_letters
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists queue_id uuid,
  add column if not exists campaign_id uuid,
  add column if not exists account_id uuid,
  add column if not exists lead_id uuid,
  add column if not exists error_code text,
  add column if not exists error_msg text,
  add column if not exists attempt_count int not null default 0,
  add column if not exists payload jsonb,
  add column if not exists provider text,
  add column if not exists provider_message_id text,
  add column if not exists meta jsonb;

create index if not exists idx_dead_letters_created_at on public.dead_letters(created_at desc);
create index if not exists idx_dead_letters_campaign on public.dead_letters(campaign_id, created_at desc);
create index if not exists idx_dead_letters_account on public.dead_letters(account_id, created_at desc);

-- Protect dead_letters (admin/service-role writes; user reads should go through RLS-aware views)
alter table public.dead_letters enable row level security;
revoke all on table public.dead_letters from anon, authenticated;

-- 1D) RPC: resubmit a dead-letter back into the queue (admin tool)
create or replace function public.dead_letter_resubmit(p_deadletter uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_queue_id uuid;
  v_sql text;
  has_not_before boolean;
  has_retry_at boolean;
  has_failed_at boolean;
  has_attempt_count boolean;
  has_last_error_code boolean;
  has_last_error_msg boolean;
  has_dead_letter boolean;
  has_locked_at boolean;
  has_updated_at boolean;
begin
  select dl.queue_id into v_queue_id
  from public.dead_letters dl
  where dl.id = p_deadletter;

  if v_queue_id is null then
    raise exception 'dead-letter not found or missing queue_id';
  end if;

  -- detect optional columns (legacy compatibility)
  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='send_queue' and column_name='not_before'
  ) into has_not_before;
  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='send_queue' and column_name='retry_at'
  ) into has_retry_at;
  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='send_queue' and column_name='failed_at'
  ) into has_failed_at;
  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='send_queue' and column_name='attempt_count'
  ) into has_attempt_count;
  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='send_queue' and column_name='last_error_code'
  ) into has_last_error_code;
  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='send_queue' and column_name='last_error_msg'
  ) into has_last_error_msg;
  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='send_queue' and column_name='dead_letter'
  ) into has_dead_letter;
  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='send_queue' and column_name='locked_at'
  ) into has_locked_at;
  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='send_queue' and column_name='updated_at'
  ) into has_updated_at;

  -- Build an update that only touches existing columns.
  v_sql := 'update public.send_queue set status = ''pending''';
  if has_not_before then v_sql := v_sql || ', not_before = now()'; end if;
  if has_retry_at then v_sql := v_sql || ', retry_at = null'; end if;
  if has_failed_at then v_sql := v_sql || ', failed_at = null'; end if;
  if has_attempt_count then v_sql := v_sql || ', attempt_count = 0'; end if;
  if has_last_error_code then v_sql := v_sql || ', last_error_code = null'; end if;
  if has_last_error_msg then v_sql := v_sql || ', last_error_msg = null'; end if;
  if has_dead_letter then v_sql := v_sql || ', dead_letter = false'; end if;
  if has_locked_at then v_sql := v_sql || ', locked_at = null'; end if;
  if has_updated_at then v_sql := v_sql || ', updated_at = now()'; end if;
  v_sql := v_sql || ' where id = $1';

  begin
    execute v_sql using v_queue_id;
  exception
    when others then
      -- fallback for legacy schemas that use 'queued' instead of 'pending'
      v_sql := replace(v_sql, 'status = ''pending''', 'status = ''queued''');
      execute v_sql using v_queue_id;
  end;

  return v_queue_id;
end;
$$;

revoke all on function public.dead_letter_resubmit(uuid) from public;
grant execute on function public.dead_letter_resubmit(uuid) to service_role;

-- 1E) Views for dashboard health (admin)
create or replace view public.v_queue_health as
select
  now() as snapshot_at,
  count(*) filter (where status in ('pending','queued'))  as pending,
  count(*) filter (where status = 'scheduled')           as scheduled,
  count(*) filter (where status = 'deferred')            as deferred,
  count(*) filter (where status in ('sending','running','picked')) as sending,
  count(*) filter (where status = 'sent')                as sent,
  count(*) filter (where status = 'failed')              as failed,
  count(*) filter (
    where dead_letter = true
       or status in ('dead_letter','dead')
  ) as dead_letters
from public.send_queue;

create or replace view public.v_retry_attempts_hist as
select
  coalesce(attempt_count, attempts, 0) as attempt_count,
  count(*) as items
from public.send_queue
where status in ('pending','queued','scheduled','deferred','sending','running','picked','retry_scheduled')
group by 1
order by 1;

create or replace view public.v_dead_letters_recent as
select
  dl.id as deadletter_id,
  dl.created_at,
  dl.queue_id,
  dl.campaign_id,
  dl.account_id,
  dl.lead_id,
  dl.error_code,
  dl.error_msg,
  dl.attempt_count,
  coalesce(l.email, sq.to_email, (dl.payload->>'to'), (dl.payload->>'to_email')) as email
from public.dead_letters dl
left join public.leads l on l.id = dl.lead_id
left join public.send_queue sq on sq.id = dl.queue_id
order by dl.created_at desc
limit 200;

-- ============================================================================
-- 2) Long-term memory rollups: reply patterns + seasonal truth
--    Source-of-truth: timeline_events (Block 14200)
-- ============================================================================

-- Make timeline / activity logs feel permanent: no client-side UPDATE/DELETE privileges.
-- (RLS already blocks these, but explicit privilege revokes prevent accidental grants.)
revoke update, delete on table public.timeline_events from authenticated;
revoke update, delete on table public.activity_logs_v2 from authenticated;

-- 2A) Seasonal truth: monthly outreach + reply performance (multi-year compounding)
create materialized view if not exists public.mv_workspace_monthly_outreach as
select
  te.workspace_id,
  date_trunc('month', te.created_at)::date as month,
  count(*) filter (where te.event_type = 'email_sent')::int as emails_sent,
  count(*) filter (where te.event_type = 'reply_received')::int as replies_received,
  case
    when count(*) filter (where te.event_type = 'email_sent') > 0
    then round(
      100.0
      * (count(*) filter (where te.event_type = 'reply_received'))
      / (count(*) filter (where te.event_type = 'email_sent')),
      1
    )
    else 0
  end as reply_rate_pct
from public.timeline_events te
group by 1,2;

create index if not exists idx_mv_workspace_monthly_outreach_ws_month
  on public.mv_workspace_monthly_outreach(workspace_id, month desc);

-- RLS: only allow workspace members/owners to read
alter table public.mv_workspace_monthly_outreach enable row level security;
drop policy if exists "mv_workspace_monthly_outreach_select_workspace" on public.mv_workspace_monthly_outreach;
create policy "mv_workspace_monthly_outreach_select_workspace"
  on public.mv_workspace_monthly_outreach for select
  using (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
    or workspace_id in (select id from public.workspaces where owner_id = auth.uid())
  );
grant select on public.mv_workspace_monthly_outreach to authenticated;

-- 2B) Reply patterns: per-contact reply rate + average delay from last send to reply
create materialized view if not exists public.mv_contact_reply_patterns as
with ordered as (
  select
    te.contact_id,
    te.workspace_id,
    te.event_type,
    te.created_at,
    max(case when te.event_type = 'email_sent' then te.created_at end)
      over (partition by te.contact_id order by te.created_at rows between unbounded preceding and current row)
      as last_sent_at
  from public.timeline_events te
  where te.event_type in ('email_sent','reply_received')
),
reply_deltas as (
  select
    contact_id,
    workspace_id,
    case
      when event_type = 'reply_received' and last_sent_at is not null
      then extract(epoch from (created_at - last_sent_at)) / 3600.0
      else null
    end as reply_delay_hours
  from ordered
)
select
  te.contact_id,
  te.workspace_id,
  count(*) filter (where te.event_type = 'email_sent')::int as total_sends,
  count(*) filter (where te.event_type = 'reply_received')::int as total_replies,
  max(te.created_at) filter (where te.event_type = 'reply_received') as last_reply_at,
  avg(rd.reply_delay_hours) as avg_reply_delay_hours,
  case
    when count(*) filter (where te.event_type = 'email_sent') > 0
    then round(
      100.0
      * (count(*) filter (where te.event_type = 'reply_received'))
      / (count(*) filter (where te.event_type = 'email_sent')),
      1
    )
    else 0
  end as reply_rate_pct
from public.timeline_events te
left join reply_deltas rd
  on rd.contact_id = te.contact_id
 and rd.workspace_id = te.workspace_id
where te.event_type in ('email_sent','reply_received')
group by 1,2;

create index if not exists idx_mv_contact_reply_patterns_contact
  on public.mv_contact_reply_patterns(contact_id);
create index if not exists idx_mv_contact_reply_patterns_workspace
  on public.mv_contact_reply_patterns(workspace_id);

alter table public.mv_contact_reply_patterns enable row level security;
drop policy if exists "mv_contact_reply_patterns_select_workspace" on public.mv_contact_reply_patterns;
create policy "mv_contact_reply_patterns_select_workspace"
  on public.mv_contact_reply_patterns for select
  using (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
    or workspace_id in (select id from public.workspaces where owner_id = auth.uid())
  );
grant select on public.mv_contact_reply_patterns to authenticated;

-- 2C) Refresh helper (call from cron or admin when needed)
create or replace function public.refresh_legacy_lock_rollups()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Use CONCURRENTLY when possible to avoid read locks; if it fails, fall back.
  begin
    refresh materialized view concurrently public.mv_workspace_monthly_outreach;
  exception when others then
    refresh materialized view public.mv_workspace_monthly_outreach;
  end;

  begin
    refresh materialized view concurrently public.mv_contact_reply_patterns;
  exception when others then
    refresh materialized view public.mv_contact_reply_patterns;
  end;
end;
$$;

revoke all on function public.refresh_legacy_lock_rollups() from public;
grant execute on function public.refresh_legacy_lock_rollups() to service_role;

-- Optional: auto-refresh every 6 hours if pg_cron is available
do $$
begin
  perform cron.schedule(
    'legacy-lock-rollups-6h',
    '0 */6 * * *',
    $$select public.refresh_legacy_lock_rollups();$$
  );
exception
  when undefined_function then null;
  when invalid_schema_name then null;
  when insufficient_privilege then null;
end;
$$;



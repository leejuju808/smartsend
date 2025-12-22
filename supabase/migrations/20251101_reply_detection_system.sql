-- Reply Detection System Migration
-- Adds lead_status enum with 'replied', indexes, and mark_lead_replied RPC

-- 1) Create lead_status enum including 'replied'
do $$
begin
  if not exists (select 1 from pg_type where typname = 'lead_status') then
    create type lead_status as enum ('new','queued','sending','sent','failed','replied');
  end if;
end $$;

-- Add 'replied' to existing enum if it doesn't have it
do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    where t.typname = 'lead_status' and e.enumlabel = 'replied'
  ) then
    alter type lead_status add value if not exists 'replied';
  end if;
end $$;

-- Alter leads.status column to use the enum
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads' and column_name = 'status'
    and udt_name != 'lead_status'
  ) then
    alter table public.leads
      alter column status type lead_status using status::text::lead_status;
  end if;
end $$;

-- 2) Add helpful indexes if they don't exist
create index if not exists leads_ws_email_idx on public.leads (workspace_id, lower(email));
create index if not exists queue_ws_lead_status_idx on public.send_queue (workspace_id, lead_id, status);

-- 3) Create RPC to mark lead as replied and cancel future sends
create or replace function public.mark_lead_replied(
  _workspace_id uuid,
  _lead_id uuid,
  _campaign_id uuid default null,
  _source text default 'unknown',
  _snippet text default null
) returns void
language plpgsql
security definer
as $$
begin
  -- 3a) Update lead status to 'replied'
  update public.leads
     set status = 'replied',
         updated_at = now()
   where id = _lead_id and workspace_id = _workspace_id;

  -- 3b) Cancel pending queue items for this lead
  update public.send_queue
     set status = 'canceled',
         updated_at = now(),
         last_error = null
   where workspace_id = _workspace_id
     and lead_id = _lead_id
     and status in ('queued','sending');

  -- 3c) Log the event in campaign_logs
  -- Check if campaign_logs table exists and what schema it has
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'campaign_logs') then
    -- Try to insert with event column (more common schema)
    begin
      insert into public.campaign_logs (workspace_id, campaign_id, lead_id, event, meta)
      values (
        _workspace_id,
        _campaign_id,
        _lead_id,
        'lead_replied',
        jsonb_build_object('source', _source, 'snippet', coalesce(_snippet, ''))
      );
    exception when others then
      -- Try with type column instead
      begin
        insert into public.campaign_logs (workspace_id, campaign_id, lead_id, type, meta)
        values (
          _workspace_id,
          _campaign_id,
          _lead_id,
          'lead_replied',
          jsonb_build_object('source', _source, 'snippet', coalesce(_snippet, ''))
        );
      exception when others then
        -- If both fail, just skip logging
        null;
      end;
    end;
  end if;
end
$$;

-- Grant permissions
revoke all on function public.mark_lead_replied(uuid, uuid, uuid, text, text) from public;
grant execute on function public.mark_lead_replied(uuid, uuid, uuid, text, text) to authenticated, anon, service_role;


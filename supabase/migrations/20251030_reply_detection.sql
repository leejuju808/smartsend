-- 1) status on leads should include 'replied'

do $$
begin
  if not exists (select 1 from pg_type where typname = 'lead_status') then
    create type lead_status as enum ('new','queued','sending','sent','failed','replied');
  end if;
end $$;

alter table public.leads
  alter column status type lead_status using status::lead_status;

-- 2) Helpful indexes
create index if not exists leads_ws_email_idx on public.leads (workspace_id, lower(email));
create index if not exists queue_ws_lead_status_idx on public.send_queue (workspace_id, lead_id, status);

-- 3) RPC to flip a lead to replied + cancel future sends for that lead
create or replace function public.mark_lead_replied(
  _workspace_id uuid,
  _lead_id uuid,
  _campaign_id uuid,
  _source text,
  _snippet text
) returns void
language plpgsql
security definer
as $$
begin
  -- 3a) Update lead
  update public.leads
     set status = 'replied'
   where id = _lead_id and workspace_id = _workspace_id;

  -- 3b) Cancel pending queue items for this lead
  update public.send_queue
     set status = 'canceled',
         updated_at = now(),
         last_error = null
   where workspace_id = _workspace_id
     and lead_id = _lead_id
     and status in ('queued','sending');

  -- 3c) Log it (adjust table/columns if your schema differs)
  insert into public.campaign_logs (workspace_id, campaign_id, lead_id, event, detail)
  values (_workspace_id, _campaign_id, _lead_id, 'lead_replied',
          jsonb_build_object('source', _source, 'snippet', _snippet, 'ts', now()));
end
$$;

revoke all on function public.mark_lead_replied(uuid, uuid, uuid, text, text) from public;
grant execute on function public.mark_lead_replied(uuid, uuid, uuid, text, text) to authenticated;

-- Columns for send control if not present
alter table leads add column if not exists attempts int default 0 not null;
alter table leads add column if not exists max_attempts int default 3 not null;

-- Helpful partial index for failed rows
create index if not exists leads_failed_idx on leads (status) where status = 'failed';

-- RPC to re-enqueue in one roundtrip
create or replace function retry_failed_leads(p_lead_ids uuid[])
returns table (lead_id uuid, queued boolean) 
language plpgsql 
security definer 
as $$
declare
  r record;
begin
  for r in 
    select id, attempts, max_attempts, campaign_id
    from leads 
    where id = any(p_lead_ids)
  loop
    if (r.attempts < r.max_attempts) then
      update leads
        set attempts = attempts + 1,
            status = 'queued',
            updated_at = now()
      where id = r.id;

      -- optional: insert into a dedicated queue table
      if r.campaign_id is not null then
        insert into campaign_logs (campaign_id, lead_id, type, meta)
        values (
          r.campaign_id, 
          r.id, 
          'retry_enqueued',
          jsonb_build_object('lead_id', r.id, 'attempt', r.attempts + 1)
        );
      end if;

      return query select r.id::uuid, true;
    else
      -- too many attempts — no-op
      return query select r.id::uuid, false;
    end if;
  end loop;
end $$;

grant execute on function retry_failed_leads(uuid[]) to anon, authenticated;

-- Ensure status column supports 'replied' and has an index for fast filters
do $$ begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace
    where t.typname = 'lead_status'
  ) then
    create type lead_status as enum ('new','queued','sent','bounced','replied');
    alter table leads alter column status type lead_status using status::lead_status;
  end if;
exception when duplicate_object then null; end $$;

create index if not exists leads_status_idx on leads(status);
create index if not exists leads_thread_idx on leads(thread_id); 
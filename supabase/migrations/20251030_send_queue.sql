-- Core queue

create table if not exists public.send_queue (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  campaign_id uuid not null,
  lead_id uuid not null,
  status text not null check (status in ('queued','sending','sent','failed','canceled')),
  attempt int not null default 0,
  run_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists send_queue_run_idx on public.send_queue (status, run_at);
create index if not exists send_queue_lead_idx on public.send_queue (lead_id);
create index if not exists send_queue_campaign_idx on public.send_queue (campaign_id);

-- Enqueue leads for a campaign (skip replied)
create or replace function public.enqueue_campaign(
  p_workspace uuid,
  p_campaign uuid,
  p_lead_ids uuid[],
  p_start timestamptz,
  p_batch_size int default 100,
  p_spread_seconds int default 60
) returns int
language plpgsql
security definer
as $$
declare
  inserted int := 0;
  i int := 0;
  lead uuid;
begin
  foreach lead in array p_lead_ids loop
    -- skip already replied or with existing queued/sending items
    if exists (select 1 from public.leads where id = lead and status = 'replied') then
      continue;
    end if;
    if exists (select 1 from public.send_queue where lead_id = lead and status in ('queued','sending')) then
      continue;
    end if;

    insert into public.send_queue (workspace_id, campaign_id, lead_id, status, run_at)
    values (p_workspace, p_campaign, lead, 'queued', p_start + make_interval(secs => (i % greatest(p_batch_size,1)) * p_spread_seconds));
    i := i + 1;
    inserted := inserted + 1;
  end loop;
  return inserted;
end;
$$;

grant execute on function public.enqueue_campaign(uuid,uuid,uuid[],timestamptz,int,int) to anon, authenticated, service_role;



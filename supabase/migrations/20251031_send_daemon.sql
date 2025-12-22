-- Extra columns on send_queue for robustness
alter table public.send_queue
  add column if not exists locked_at timestamptz,
  add column if not exists last_error text;

-- Add to_email, subject, body_html if missing (for daemon compatibility)
do $$
begin
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'send_queue' and column_name = 'to_email') then
    alter table public.send_queue add column to_email text;
  end if;
  
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'send_queue' and column_name = 'subject') then
    alter table public.send_queue add column subject text;
  end if;
  
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'send_queue' and column_name = 'body_html') then
    alter table public.send_queue add column body_html text;
  end if;
end $$;

-- Add type and detail columns to campaign_logs for daemon compatibility
alter table public.campaign_logs
  add column if not exists type text,
  add column if not exists detail jsonb;

-- Helper: "sent today" materialization for limit checks
create or replace view public.campaigns_sent_today as
select
  q.campaign_id,
  count(*)::int as sent_today
from public.send_queue q
where q.status = 'sent'
  and q.created_at::date = now()::date
group by 1;

-- Index for performance
create index if not exists campaigns_sent_today_idx on public.campaigns_sent_today(campaign_id);

-- RPC: atomically reserve a batch of due, unlocked items for a campaign
create or replace function public.reserve_send_queue(p_campaign uuid, p_batch int)
returns table (id uuid, lead_id uuid, to_email text, subject text, body_html text)
language plpgsql
security definer
as $$
declare
begin
  return query
  with cte as (
    select q.id
    from public.send_queue q
    where q.campaign_id = p_campaign
      and q.status = 'queued'
      and (q.locked_at is null or q.locked_at < now() - interval '10 minutes')
      and q.scheduled_at <= now()
    order by q.scheduled_at asc
    limit p_batch
    for update skip locked
  )
  update public.send_queue q
     set status = 'sending',
         attempt = q.attempt + 1,
         locked_at = now()
  where q.id in (select cte.id from cte)
  returning q.id, q.lead_id, q.to_email, q.subject, q.body_html;
end $$;

grant execute on function public.reserve_send_queue(uuid,int) to anon, authenticated, service_role;

-- Optional retry RPC
create or replace function public.retry_queue(p_ids uuid[])
returns void
language sql
security definer
as $$
  update public.send_queue
     set status='queued',
         locked_at = null,
         last_error = null,
         scheduled_at = least(scheduled_at, now())
   where id = any(p_ids) and attempt < 3;
$$;

grant execute on function public.retry_queue(uuid[]) to authenticated, anon, service_role;


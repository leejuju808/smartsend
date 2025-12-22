-- Campaign pacing fields (add if missing)

alter table public.campaigns
  add column if not exists is_active boolean not null default true,
  add column if not exists daily_cap int not null default 200,
  add column if not exists per_minute int not null default 10,
  add column if not exists window_start time with time zone default '08:00',
  add column if not exists window_end   time with time zone default '17:00';


-- Lead status enum already created earlier; ensure 'queued' exists
do $$
begin
  if not exists (
    select 1 from pg_type t join pg_enum e on t.oid=e.enumtypid
    where t.typname='lead_status' and e.enumlabel='queued'
  ) then
    alter type lead_status add value if not exists 'queued';
  end if;
end$$;


-- Efficient picker: lock & move a batch to "queued" and return them
create or replace function public.pick_leads_for_dispatch(p_campaign uuid, p_limit int)
returns table(id uuid, email text)
language plpgsql
security definer
as $$
begin
  return query
  with picked as (
    select l.id, l.email
      from public.leads l
     where l.campaign_id = p_campaign
       and l.status = 'new'
     order by l.created_at
     for update skip locked
     limit p_limit
  ), upd as (
    update public.leads l
       set status='queued'
      from picked p
     where l.id = p.id
    returning l.id, l.email
  )
  select id, email from upd;
end;
$$;

grant execute on function public.pick_leads_for_dispatch(uuid,int) to service_role;


-- Cap check helper: how many were sent today for a campaign
create or replace view public.v_campaign_sent_today as
select c.id as campaign_id,
       count(sq.id) as sent_today
from public.campaigns c
left join public.send_queue sq
  on sq.campaign_id = c.id
 and sq.status in ('sent','sending')
 and sq.created_at::date = now()::date
group by c.id;


-- Indexes
create index if not exists leads_campaign_status_idx on public.leads (campaign_id, status);
create index if not exists send_queue_campaign_created_idx on public.send_queue (campaign_id, created_at desc);



-- helpful indexes

create index if not exists leads_status_idx on leads (status);

create index if not exists leads_campaign_status_idx on leads (campaign_id, status);

create index if not exists leads_created_idx on leads (created_at);

-- RPC: paginated filtered leads with total count

create or replace function list_leads_filtered(

  p_campaign_id uuid default null,

  p_status text default null,

  p_from timestamptz default null,

  p_to   timestamptz default null,

  p_page int default 1,

  p_page_size int default 25

) returns table (

  id uuid,

  email text,

  first_name text,

  last_name text,

  company text,

  status text,

  attempts int,

  max_attempts int,

  campaign_id uuid,

  created_at timestamptz,

  last_error text,

  total_count int

) language plpgsql security definer as $$

begin

  return query

  with filtered as (

    select *

    from leads

    where (p_campaign_id is null or campaign_id = p_campaign_id)

      and (p_status is null or status = p_status)

      and (p_from  is null or created_at >= p_from)

      and (p_to    is null or created_at <  p_to)

  ),

  counted as (

    select *, (select count(*) from filtered) as total_count

    from filtered

    order by created_at desc

    offset greatest((p_page-1),0) * p_page_size

    limit p_page_size

  )

  select id, email, first_name, last_name, company, status, attempts, max_attempts, campaign_id, created_at, last_error, total_count

  from counted;

end $$;

grant execute on function list_leads_filtered(uuid,text,timestamptz,timestamptz,int,int) to anon, authenticated;

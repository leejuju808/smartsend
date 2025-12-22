-- Threads list with search/status, paginated

create or replace function public.get_reply_threads(

  p_project uuid,

  p_search text default null,

  p_status thread_status default null,

  p_limit int default 25,

  p_offset int default 0

)

returns table (

  id uuid,

  project_id uuid,

  lead_email text,

  last_message text,

  status thread_status,

  unread_count int,

  updated_at timestamptz,

  ai_replied boolean,

  ai_reply_score numeric,

  triage triage_label,

  triage_score numeric

)

language sql

security definer

set search_path=public as

$$

  select t.id,

         t.project_id,

         l.email as lead_email,

         (select e.body from public.emails e where e.thread_id = t.id order by e.created_at desc limit 1) as last_message,

         t.status, t.unread_count, t.updated_at,

         t.ai_replied, t.ai_reply_score,

         t.triage, t.triage_score

  from public.threads t

  join public.leads l on l.id = t.lead_id

  where t.project_id = p_project

    and is_member(t.project_id)

    and (p_status is null or t.status = p_status)

    and (

      p_search is null

      or l.email ilike '%'||p_search||'%'

      or exists (

        select 1 from public.emails e

        where e.thread_id = t.id and e.body ilike '%'||p_search||'%'

      )

    )

  order by t.updated_at desc

  limit p_limit offset p_offset;

$$;



-- Full thread messages

create or replace function public.get_thread(

  p_project uuid,

  p_thread uuid

)

returns table (

  id uuid,

  direction email_direction,

  body text,

  subject text,

  sender text,

  recipient text,

  created_at timestamptz

)

language sql

security definer

set search_path=public as

$$

  select e.id, e.direction, e.body, e.subject, e.sender, e.recipient, e.created_at

  from public.emails e

  join public.threads t on t.id = e.thread_id

  where e.project_id = p_project

    and e.thread_id = p_thread

    and is_member(e.project_id)

  order by e.created_at asc;

$$;


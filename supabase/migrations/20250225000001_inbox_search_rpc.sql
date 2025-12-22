-- Optional RPC — better search ranking (websearch_to_tsquery)
-- If you want smarter queries (quotes, OR, -excludes), use this function

create or replace function public.search_threads(p_query text, p_limit int default 200)
returns table (thread_id uuid)
language sql
stable
as $$
  select distinct m.thread_id
  from public.inbox_messages m
  where m.fts @@ websearch_to_tsquery('simple', p_query)
  order by ts_rank(m.fts, websearch_to_tsquery('simple', p_query)) desc
  limit p_limit
$$;






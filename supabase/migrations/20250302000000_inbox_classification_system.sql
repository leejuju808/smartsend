-- =====================================================
-- Inbox Classification System: Heuristics + AI Labeling + Auto-Pause
-- =====================================================

-- A) Speed up "needs classification" queries
create index if not exists idx_inbox_unclassified
  on public.inbox_messages(direction, classified_at nulls first, created_at desc)
  where direction in ('in', 'inbound') and classified_at is null;

-- B) Lightweight heuristics: prelabel obvious OOO/unsub/bounce
create or replace function public._heuristic_label(p_subject text, p_text text)
returns text 
language plpgsql 
immutable 
as $$
declare 
  s text := coalesce(p_subject,''); 
  t text := coalesce(p_text,'');
begin
  if s ~* '(out of office|auto.?reply|away)' or t ~* '(out of office|auto.?reply|autoreply)' then
    return 'ooo';
  end if;
  if t ~* '(unsubscribe|remove me|opt[- ]?out)' then
    return 'unsubscribe';
  end if;
  if t ~* '(mailbox full|user unknown|undeliverable|delivery (failed|status notification))' then
    return 'bounce';
  end if;
  return null;
end;
$$;

-- C) On insert, set heuristic label + classified_at if matched (cheap win)
create or replace function public._inbox_heuristics()
returns trigger 
language plpgsql 
as $$
declare guess text;
begin
  -- Only process inbound messages
  if NEW.direction not in ('in', 'inbound') then
    return NEW;
  end if;

  -- Extract text from body_html if body_text is not available
  guess := public._heuristic_label(
    NEW.subject, 
    coalesce(
      NEW.body_text, 
      regexp_replace(coalesce(NEW.body_html,''),'<[^>]+>','','gi')
    )
  );

  if guess is not null and NEW.ai_label is null then
    NEW.ai_label := guess;
    NEW.ai_confidence := 0.6;
    NEW.classified_at := now();
  end if;

  return NEW;
end; 
$$;

drop trigger if exists trg_inbox_heuristics on public.inbox_messages;
create trigger trg_inbox_heuristics
before insert on public.inbox_messages
for each row execute function public._inbox_heuristics();

-- D) Smart pause: when a message gets a meaningful label, stop follow-ups and link reply
create or replace function public._autopause_on_label()
returns trigger 
language plpgsql 
as $$
declare 
  v_thread uuid; 
  v_campaign uuid; 
  v_email citext;
begin
  if TG_OP = 'INSERT' then
    if NEW.direction not in ('in', 'inbound') then return NEW; end if;
    if NEW.ai_label is null then return NEW; end if;
    v_thread := NEW.thread_id;
  else
    if NEW.direction not in ('in', 'inbound') then return NEW; end if;
    if NEW.ai_label is null or NEW.ai_label = OLD.ai_label then return NEW; end if;
    v_thread := NEW.thread_id;
  end if;

  -- mark replied + cancel queue + link to last send
  perform public.mark_thread_replied_and_link(v_thread, coalesce(NEW.created_at, now()));

  -- For 'unsubscribe' or 'bounce': add suppression
  if NEW.ai_label in ('unsubscribe','bounce') then
    select t.campaign_id into v_campaign 
    from public.inbox_threads t 
    where t.id = v_thread;
    
    -- best-effort grab lead email (if stored on messages; else join leads)
    select l.email::citext into v_email
      from public.inbox_threads t 
      join public.leads l on l.id = t.lead_id
      where t.id = v_thread 
      limit 1;
      
    if v_campaign is not null and v_email is not null then
      perform public.add_unsubscribe(v_campaign, v_email);
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_autopause_on_label_ins on public.inbox_messages;
create trigger trg_autopause_on_label_ins
after insert on public.inbox_messages
for each row execute function public._autopause_on_label();

drop trigger if exists trg_autopause_on_label_upd on public.inbox_messages;
create trigger trg_autopause_on_label_upd
after update of ai_label on public.inbox_messages
for each row execute function public._autopause_on_label();

-- E) Update reply_quality_list to include ai_intent
create or replace view public.v_thread_last_inbound as
select
  t.id                 as thread_id,
  t.campaign_id,
  t.lead_id,
  (array_agg(m.id           order by m.created_at desc))[1] as last_msg_id,
  (array_agg(m.created_at   order by m.created_at desc))[1] as last_inbound_at,
  (array_agg(m.ai_label     order by m.created_at desc))[1] as ai_label,
  (array_agg(m.ai_intent    order by m.created_at desc))[1] as ai_intent,
  (array_agg(coalesce(m.subject,'') order by m.created_at desc))[1] as subject,
  (array_agg(coalesce(nullif(trim(both from m.body_text),''), left(regexp_replace(coalesce(m.body_html,''),'<[^>]+>','','gi'),240)) order by m.created_at desc))[1] as preview
from public.inbox_threads t
join public.inbox_messages m on m.thread_id = t.id and (m.direction = 'in' or m.direction = 'inbound')
group by t.id, t.campaign_id, t.lead_id;

create or replace function public.reply_quality_list(
  p_campaign uuid,
  p_label text default null,
  p_q text default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table(
  thread_id uuid,
  lead_id uuid,
  last_inbound_at timestamptz,
  ai_label text,
  ai_intent text,
  subject text,
  preview text
) language sql stable as $$
  with base as (
    select * from public.v_thread_last_inbound
    where campaign_id = p_campaign
      and (p_label is null or ai_label = p_label)
      and (
        p_q is null
        or subject ilike '%'||p_q||'%'
        or preview ilike '%'||p_q||'%'
      )
  )
  select thread_id, lead_id, last_inbound_at, ai_label, ai_intent, subject, preview
  from base
  order by last_inbound_at desc
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$$;


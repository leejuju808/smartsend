-- Block 74 Reply Classifier rollout

-- 1) Label domain
create type public.reply_label as enum ('positive','neutral','oos','bounce','ooo','meeting_intent');

-- 2) Message labels + classifier trace
do $$ begin
  alter table public.messages add column if not exists label public.reply_label;
  alter table public.messages add column if not exists label_confidence numeric;
  alter table public.messages add column if not exists clf_source text;            -- 'rules','llm','ensemble'
  alter table public.messages add column if not exists clf_trace jsonb;            -- {rules:{...}, llm:{...}}
exception when duplicate_column then null; end $$;

-- 3) Threads quick status
do $$ begin
  alter table public.threads add column if not exists last_inbound_label public.reply_label;
  alter table public.threads add column if not exists paused_until timestamptz;    -- auto-pause via hooks
exception when duplicate_column then null; end $$;

-- 4) Fast view for routing
create or replace view public.v_recent_inbound as
select m.*, t.account_id, t.lead_id
from public.messages m
join public.threads t on t.id = m.thread_id
where m.direction = 'inbound'
order by m.received_at desc;


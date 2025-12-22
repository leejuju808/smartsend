-- Seed Eval Sets from reply_training_labels
-- Pulls labeled data to create initial gold sets

-- Step 1: Create eval set for reply_kind
insert into public.eval_sets (name, task, notes)
values ('Replies v1.0', 'reply_kind', '50 human-labeled replies')
on conflict do nothing;

-- Seed reply_kind items
with src as (
  select id, reply_text, reply_kind, coalesce(labeled_at, created_at) as labeled_at
  from public.reply_training_labels
  where reply_kind is not null
    and reply_text is not null
    and trim(reply_text) != ''
  order by coalesce(labeled_at, created_at) desc, created_at desc
  limit 50
)
insert into public.eval_items (eval_set_id, source, text, gold_label, aux)
select 
  (select id from public.eval_sets where name='Replies v1.0' and task='reply_kind'),
  'reply' as source,
  coalesce(reply_text,'') as text,
  reply_kind as gold_label,
  jsonb_build_object('reply_id', id, 'labeled_at', labeled_at) as aux
from src
where not exists (
  select 1 from public.eval_items ei
  join public.eval_sets es on es.id = ei.eval_set_id
  where es.name = 'Replies v1.0' and es.task = 'reply_kind'
    and ei.aux->>'reply_id' = src.id::text
);

-- Step 2: Create eval set for ooo
insert into public.eval_sets (name, task, notes)
values ('OOO v1.0', 'ooo', 'OOO detection examples')
on conflict do nothing;

with src as (
  select id, reply_text, reply_kind, coalesce(labeled_at, created_at) as labeled_at
  from public.reply_training_labels
  where reply_kind = 'ooo'
    and reply_text is not null
    and trim(reply_text) != ''
  order by coalesce(labeled_at, created_at) desc, created_at desc
  limit 30
)
insert into public.eval_items (eval_set_id, source, text, gold_label, aux)
select 
  (select id from public.eval_sets where name='OOO v1.0' and task='ooo'),
  'reply' as source,
  coalesce(reply_text,'') as text,
  'ooo' as gold_label,
  jsonb_build_object('reply_id', id, 'labeled_at', labeled_at) as aux
from src
where not exists (
  select 1 from public.eval_items ei
  join public.eval_sets es on es.id = ei.eval_set_id
  where es.name = 'OOO v1.0' and es.task = 'ooo'
    and ei.aux->>'reply_id' = src.id::text
);

-- Step 3: Create eval set for meeting_intent
insert into public.eval_sets (name, task, notes)
values ('Meeting Intent v1.0', 'meeting_intent', 'Meeting intent detection examples')
on conflict do nothing;

-- For meeting_intent, we'll use replies that have meeting_intents records
-- or replies with reply_kind='meeting'
with src as (
  select distinct
    rtl.id,
    rtl.reply_text,
    coalesce(rtl.labeled_at, rtl.created_at) as labeled_at,
    case when mi.id is not null then 'has_intent' else 'no_intent' end as label
  from public.reply_training_labels rtl
  left join public.meeting_intents mi on mi.reply_id = rtl.id
  where rtl.reply_text is not null
    and trim(rtl.reply_text) != ''
    and (
      rtl.reply_kind = 'meeting' 
      or mi.id is not null
      or rtl.reply_kind in ('positive', 'neutral')
    )
  order by coalesce(rtl.labeled_at, rtl.created_at) desc, rtl.created_at desc
  limit 40
)
insert into public.eval_items (eval_set_id, source, text, gold_label, aux)
select 
  (select id from public.eval_sets where name='Meeting Intent v1.0' and task='meeting_intent'),
  'reply' as source,
  coalesce(reply_text,'') as text,
  label as gold_label,
  jsonb_build_object('reply_id', id, 'labeled_at', labeled_at) as aux
from src
where not exists (
  select 1 from public.eval_items ei
  join public.eval_sets es on es.id = ei.eval_set_id
  where es.name = 'Meeting Intent v1.0' and es.task = 'meeting_intent'
    and ei.aux->>'reply_id' = src.id::text
);

-- Step 4: Create eval set for tone
insert into public.eval_sets (name, task, notes)
values ('Tone v1.0', 'tone', 'Tone classification examples')
on conflict do nothing;

with src as (
  select id, reply_text, tone, coalesce(labeled_at, created_at) as labeled_at
  from public.reply_training_labels
  where tone is not null
    and reply_text is not null
    and trim(reply_text) != ''
  order by coalesce(labeled_at, created_at) desc, created_at desc
  limit 30
)
insert into public.eval_items (eval_set_id, source, text, gold_label, aux)
select 
  (select id from public.eval_sets where name='Tone v1.0' and task='tone'),
  'reply' as source,
  coalesce(reply_text,'') as text,
  tone as gold_label,
  jsonb_build_object('reply_id', id, 'labeled_at', labeled_at) as aux
from src
where not exists (
  select 1 from public.eval_items ei
  join public.eval_sets es on es.id = ei.eval_set_id
  where es.name = 'Tone v1.0' and es.task = 'tone'
    and ei.aux->>'reply_id' = src.id::text
);


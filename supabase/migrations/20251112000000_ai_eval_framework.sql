-- 101A — Model catalogue --------------------------------------------------------

create table if not exists public.ai_model_versions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  provider text not null default 'openai',
  model text not null,
  version_tag text not null,
  notes text,
  is_current boolean not null default false,
  check (length(trim(version_tag)) > 0),
  check (length(trim(name)) > 0)
);

create unique index if not exists ai_model_versions_unique_tag
  on public.ai_model_versions(name, version_tag);


-- 101B — Eval set headers -------------------------------------------------------

create table if not exists public.ai_eval_sets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  name text not null,
  sample_size int not null check (sample_size > 0),
  source text not null default 'feedback' check (source in ('feedback','prod-mix','synthetic')),
  notes text,
  locked boolean not null default false
);


-- 101C — Samples in a set -------------------------------------------------------

create table if not exists public.ai_eval_samples (
  id uuid primary key default gen_random_uuid(),
  eval_set_id uuid not null references public.ai_eval_sets(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  gold_label text not null check (gold_label in ('positive','negative','neutral','question','unsubscribe','bounce','oof')),
  text_excerpt text not null,
  meta jsonb not null default '{}'::jsonb,
  unique (eval_set_id, message_id)
);

create index if not exists ai_eval_samples_set_idx on public.ai_eval_samples(eval_set_id);


-- 101D — Results per model ------------------------------------------------------

create table if not exists public.ai_eval_results (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  eval_set_id uuid not null references public.ai_eval_sets(id) on delete cascade,
  model_version_id uuid not null references public.ai_model_versions(id) on delete cascade,
  sample_id uuid not null references public.ai_eval_samples(id) on delete cascade,
  pred_label text not null check (pred_label in ('positive','negative','neutral','question','unsubscribe','bounce','oof')),
  pred_confidence numeric(4,3),
  latency_ms int,
  raw jsonb not null default '{}'::jsonb,
  unique (model_version_id, sample_id)
);

create index if not exists ai_eval_results_set_model_idx on public.ai_eval_results(eval_set_id, model_version_id);


-- 101E — Convenience view: confusion matrix + metrics (micro) -------------------

create or replace view public.v_ai_eval_metrics as
with labeled as (
  select
    r.eval_set_id,
    mv.name as model_name,
    mv.version_tag,
    r.latency_ms,
    r.created_at,
    r.pred_label,
    s.gold_label
  from public.ai_eval_results r
  join public.ai_eval_samples s on s.id = r.sample_id
  join public.ai_model_versions mv on mv.id = r.model_version_id
)
select
  eval_set_id,
  model_name,
  version_tag,
  count(*)::int as n,
  coalesce(avg(latency_ms)::int, 0) as avg_latency_ms,
  coalesce(sum((pred_label = gold_label)::int)::float / nullif(count(*), 0)::float, 0)::float as accuracy,
  jsonb_build_object(
    'positive', jsonb_build_object(
      'tp', sum((pred_label = 'positive' and gold_label = 'positive')::int),
      'fp', sum((pred_label = 'positive' and gold_label <> 'positive')::int),
      'fn', sum((pred_label <> 'positive' and gold_label = 'positive')::int)
    ),
    'negative', jsonb_build_object(
      'tp', sum((pred_label = 'negative' and gold_label = 'negative')::int),
      'fp', sum((pred_label = 'negative' and gold_label <> 'negative')::int),
      'fn', sum((pred_label <> 'negative' and gold_label = 'negative')::int)
    ),
    'neutral', jsonb_build_object(
      'tp', sum((pred_label = 'neutral' and gold_label = 'neutral')::int),
      'fp', sum((pred_label = 'neutral' and gold_label <> 'neutral')::int),
      'fn', sum((pred_label <> 'neutral' and gold_label = 'neutral')::int)
    ),
    'question', jsonb_build_object(
      'tp', sum((pred_label = 'question' and gold_label = 'question')::int),
      'fp', sum((pred_label = 'question' and gold_label <> 'question')::int),
      'fn', sum((pred_label <> 'question' and gold_label = 'question')::int)
    ),
    'unsubscribe', jsonb_build_object(
      'tp', sum((pred_label = 'unsubscribe' and gold_label = 'unsubscribe')::int),
      'fp', sum((pred_label = 'unsubscribe' and gold_label <> 'unsubscribe')::int),
      'fn', sum((pred_label <> 'unsubscribe' and gold_label = 'unsubscribe')::int)
    ),
    'bounce', jsonb_build_object(
      'tp', sum((pred_label = 'bounce' and gold_label = 'bounce')::int),
      'fp', sum((pred_label = 'bounce' and gold_label <> 'bounce')::int),
      'fn', sum((pred_label <> 'bounce' and gold_label = 'bounce')::int)
    ),
    'oof', jsonb_build_object(
      'tp', sum((pred_label = 'oof' and gold_label = 'oof')::int),
      'fp', sum((pred_label = 'oof' and gold_label <> 'oof')::int),
      'fn', sum((pred_label <> 'oof' and gold_label = 'oof')::int)
    )
  ) as confusion,
  max(created_at) as created_at
from labeled
group by 1,2,3;


-- 101F — Minimal RLS ------------------------------------------------------------

alter table public.ai_model_versions enable row level security;
alter table public.ai_eval_sets enable row level security;
alter table public.ai_eval_samples enable row level security;
alter table public.ai_eval_results enable row level security;

do $$
begin
  create policy ai_admin_read on public.ai_model_versions
    for select using (auth.role() = 'authenticated');
  create policy ai_admin_ins on public.ai_model_versions
    for insert with check (auth.role() = 'authenticated');

  create policy ai_admin_read_sets on public.ai_eval_sets
    for select using (auth.role() = 'authenticated');
  create policy ai_admin_write_sets on public.ai_eval_sets
    for insert with check (auth.role() = 'authenticated');

  create policy ai_admin_read_samples on public.ai_eval_samples
    for select using (auth.role() = 'authenticated');
  create policy ai_admin_write_samples on public.ai_eval_samples
    for insert with check (auth.role() = 'authenticated');

  create policy ai_admin_read_results on public.ai_eval_results
    for select using (auth.role() = 'authenticated');
  create policy ai_admin_write_results on public.ai_eval_results
    for insert with check (auth.role() = 'authenticated');
exception
  when duplicate_object then null;
end $$;


-- 101G — Helper RPCs ------------------------------------------------------------

create or replace function public.random_feedback_sample(p_label text, p_limit int)
returns table (id uuid, message_id uuid, label text, confidence numeric, text_excerpt text, source text)
language sql
stable
as $$
  select f.id,
         f.message_id,
         f.label,
         f.confidence,
         left(coalesce(m.body_text, m.body_html, ''), 4000) as text_excerpt,
         f.source
  from public.ai_feedback f
  join public.messages m on m.id = f.message_id
  where f.label = p_label
  order by random()
  limit greatest(1, coalesce(p_limit, 1));
$$;

create or replace function public.random_feedback_sample_any(p_limit int)
returns table (id uuid, message_id uuid, label text, confidence numeric, text_excerpt text, source text)
language sql
stable
as $$
  select f.id,
         f.message_id,
         f.label,
         f.confidence,
         left(coalesce(m.body_text, m.body_html, ''), 4000) as text_excerpt,
         f.source
  from public.ai_feedback f
  join public.messages m on m.id = f.message_id
  order by random()
  limit greatest(1, coalesce(p_limit, 1));
$$;


-- 101H — Seed current model row -------------------------------------------------

insert into public.ai_model_versions (name, provider, model, version_tag, notes, is_current)
values ('replies-cls', 'openai', 'gpt-4.1-mini', 'v1.0.0', 'Initial heuristic/dev model', true)
on conflict do nothing;



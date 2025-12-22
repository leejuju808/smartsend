-- QA quality assurance schema: runs, samples, predictions, metrics, helpers.

-- A) QA runs (each backfill/eval has a run_id)
create table if not exists public.qa_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  note text,
  model text default 'gpt-4o-mini',
  sample_size int,
  finished_at timestamptz
);

-- B) Samples chosen for this run
create table if not exists public.qa_samples (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.qa_runs(id) on delete cascade,
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  actual_label text,
  inbound_text text,
  ooo_actual timestamptz,
  gold_label text,
  created_at timestamptz not null default now(),
  unique (run_id, thread_id)
);

-- C) Model outputs for those samples
create table if not exists public.qa_predictions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.qa_runs(id) on delete cascade,
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  predicted_label text,
  ooo_predicted timestamptz,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (run_id, thread_id)
);

-- D) Views for metrics
create or replace view public.v_qa_confusion as
select
  p.run_id,
  s.actual_label,
  p.predicted_label,
  count(*) as n
from public.qa_predictions p
join public.qa_samples s using (run_id, thread_id)
group by p.run_id, s.actual_label, p.predicted_label;

create or replace view public.v_qa_accuracy as
select
  p.run_id,
  avg(case when s.actual_label = p.predicted_label then 1.0 else 0.0 end) as accuracy,
  count(*) as total
from public.qa_predictions p
join public.qa_samples s using (run_id, thread_id)
group by p.run_id;

-- Per-class precision/recall view
create or replace view public.v_qa_pr as
with labels as (
  select run_id, unnest(array['positive','neutral','question','negative','ooo']) as label
  from public.qa_predictions
  group by run_id
)
select
  l.run_id,
  l.label,
  (sum(case when p.predicted_label = l.label and s.actual_label = l.label then 1 else 0 end)::float) /
    nullif(sum(case when p.predicted_label = l.label then 1 else 0 end), 0) as precision,
  (sum(case when s.actual_label = l.label and p.predicted_label = l.label then 1 else 0 end)::float) /
    nullif(sum(case when s.actual_label = l.label then 1 else 0 end), 0) as recall,
  sum(case when s.actual_label = l.label then 1 else 0 end) as support
from public.qa_predictions p
join public.qa_samples s using (run_id, thread_id)
join labels l on l.run_id = p.run_id
group by l.run_id, l.label;

-- Gold-label adjusted accuracy
create or replace view public.v_qa_gold_accuracy as
select
  p.run_id,
  avg(case when coalesce(s.gold_label, s.actual_label) = p.predicted_label then 1.0 else 0.0 end) as accuracy,
  count(*) as total
from public.qa_predictions p
join public.qa_samples s using (run_id, thread_id)
group by p.run_id;

-- Helper function: choose threads to evaluate (e.g., last 30 days, with at least one inbound)
create or replace function public.qa_pick_threads(p_limit int default 200)
returns table(thread_id uuid)
language sql
as $$
  select t.id
  from public.inbox_threads t
  where t.updated_at >= now() - interval '30 days'
    and exists (
      select 1
      from public.inbox_messages m
      where m.thread_id = t.id
        and m.direction = 'inbound'
    )
  order by t.updated_at desc
  limit coalesce(p_limit, 200)
$$;

-- Create a run and materialize samples
create or replace function public.qa_create_run(p_name text, p_limit int default 200)
returns uuid
language plpgsql
as $$
declare
  v_run uuid;
begin
  insert into public.qa_runs (name, sample_size)
  values (coalesce(p_name, 'nightly'), p_limit)
  returning id into v_run;

  insert into public.qa_samples (run_id, thread_id, actual_label, inbound_text, ooo_actual)
  select
    v_run,
    t.id,
    t.reply_type,
    public.latest_inbound_text(t.id),
    t.ooo_return_at
  from public.qa_pick_threads(p_limit) tt
  join public.inbox_threads t on t.id = tt.thread_id;

  return v_run;
end;
$$;

-- Fetch samples lacking predictions
create or replace function public.qa_fetch_pending(p_run uuid, p_limit int default 100)
returns table(thread_id uuid, inbound_text text)
language sql
as $$
  select s.thread_id, s.inbound_text
  from public.qa_samples s
  left join public.qa_predictions p
    on p.run_id = s.run_id and p.thread_id = s.thread_id
  where s.run_id = p_run
    and p.id is null
  limit p_limit
$$;

-- Nightly cron helpers
create extension if not exists pg_cron;

create or replace function public.qa_nightly_start()
returns void
language plpgsql
as $$
declare
  v_run uuid;
begin
  v_run := public.qa_create_run('nightly-' || to_char(now(), 'YYYYMMDD'), 300);

  insert into public.thread_banners (thread_id, kind, message)
  values (gen_random_uuid(), 'qa-run', v_run::text);
end;
$$;

create or replace function public.qa_nightly_process()
returns void
language plpgsql
as $$
declare
  v_run uuid;
begin
  select id
  into v_run
  from public.qa_runs
  where finished_at is null
  order by created_at desc
  limit 1;

  if v_run is null then
    return;
  end if;

  perform net.http_post(
    url := public.edge_base_url() || '/qa-reprocess',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object('run_id', v_run, 'batch', 150)::text,
    timeout_milliseconds := 120000
  );
end;
$$;

-- Schedule nightly jobs if not already present
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'qa-nightly-start') then
    perform cron.schedule('qa-nightly-start', '10 2 * * *', $$select public.qa_nightly_start();$$);
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'qa-nightly-process') then
    perform cron.schedule('qa-nightly-process', '*/5 * * * *', $$select public.qa_nightly_process();$$);
  end if;
end;
$$;








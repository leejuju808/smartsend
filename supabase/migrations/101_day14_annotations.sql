-- Step 14 — Label Fast, Learn Faster

-- A) Immutable audit log of human annotations
create table if not exists public.ai_annotations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  annotator uuid, -- references auth.users(id) when present
  source text not null check (source in ('live','sample','backfill')),
  live_inference_id uuid references public.ai_live_inferences(id) on delete set null,
  sample_id uuid references public.ai_training_samples(id) on delete set null,
  label text not null,
  notes text
);

create index if not exists idx_ai_annotations_live on public.ai_annotations(live_inference_id);
create index if not exists idx_ai_annotations_sample on public.ai_annotations(sample_id);
create index if not exists idx_ai_annotations_source on public.ai_annotations(source);

-- B) Ensure training samples table has canonical fields
alter table public.ai_training_samples
  add column if not exists text text,
  add column if not exists locked boolean default false,
  add column if not exists source text default 'mixed' check (source in ('live','import','mixed'));

-- C) RPC to label live inference and optionally upsert training sample
create or replace function public.label_live_inference(
  _live_id uuid,
  _label text,
  _notes text default null,
  _lock boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _sid uuid;
  _txt text;
begin
  -- ensure live inference exists
  select sample_id, text_preview
    into _sid, _txt
  from public.ai_live_inferences
  where id = _live_id
  for update;

  if not found then
    raise exception 'live inference % not found', _live_id using errcode = 'P0002';
  end if;

  -- record annotation
  insert into public.ai_annotations(annotator, source, live_inference_id, sample_id, label, notes)
  values (null, 'live', _live_id, _sid, _label, _notes);

  -- stamp truth on live inference
  update public.ai_live_inferences
     set true_label = _label
   where id = _live_id;

  -- ensure we have text for training sample
  if _txt is null then
    select text_preview into _txt
    from public.ai_live_inferences
    where id = _live_id;
  end if;

  if _sid is null then
    -- create new training sample
    insert into public.ai_training_samples(text, label, weight, split, locked, source)
    values (_txt, _label, 1.0, 'auto', _lock, 'live')
    returning id into _sid;
  else
    -- update existing sample
    update public.ai_training_samples
       set label = _label,
           locked = coalesce(locked, false) or _lock,
           updated_at = now()
     where id = _sid;
  end if;

  -- backfill annotation with sample id when newly created
  update public.ai_annotations
     set sample_id = _sid
   where live_inference_id = _live_id
     and sample_id is null;

  -- close review item
  update public.ai_review_queue
     set status = 'labeled'
   where live_inference_id = _live_id
     and status = 'open';

  return _sid;
end;
$$;

















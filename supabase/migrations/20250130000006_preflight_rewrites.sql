-- Block 123 — Smart Template Rewriter (AI auto-fix for held emails)
-- Idempotent migration for rewrite store, queue linkage, and apply function

-- A) Rewrite store
create table if not exists public.preflight_rewrites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  queue_id uuid not null references public.send_queue(id) on delete cascade,
  model text not null default 'gpt-4o-mini',
  controls jsonb not null default '{}'::jsonb,          -- {tone,length,links,max_links,cta_style}
  original_subject text,
  original_html text,
  rewritten_subject text,
  rewritten_html text,
  notes text,
  preflight_before jsonb,                               -- result from preflight_evaluate_row
  preflight_after  jsonb,                               -- result from preflight_evaluate_row
  decision_after   preflight_decision,                  -- allow/hold/block after rewrite
  score_after      int,
  auto_applied boolean not null default false
);

create index if not exists idx_rewrites_queue on public.preflight_rewrites (queue_id);
create index if not exists idx_rewrites_account on public.preflight_rewrites (account_id, created_at desc);

-- B) Queue fields to hold applied rewrite
alter table if exists public.send_queue
  add column if not exists rewrite_id uuid references public.preflight_rewrites(id) on delete set null,
  add column if not exists subject_effective text,
  add column if not exists body_html_effective text;

create index if not exists idx_send_queue_rewrite on public.send_queue(rewrite_id);

-- When applying a rewrite, copy subject/html into subject_effective/body_html_effective.
-- Your sender should prefer *_effective if present; else fallback to original fields.

-- C) RPC: create a rewrite record and (optionally) apply if it passes.
create or replace function public.apply_rewrite_if_allowed(p_rewrite_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  r record;
  d preflight_decision;
  s int;
  det jsonb;
  reasons text[];
begin
  select * into r from public.preflight_rewrites where id = p_rewrite_id for update;
  if not found then return false; end if;

  -- Run preflight on the prospective content using the queue row
  -- Temporarily update the queue row with rewritten content for evaluation
  update public.send_queue
     set subject = coalesce(r.rewritten_subject, subject),
         body_html = coalesce(r.rewritten_html, body_html)
   where id = r.queue_id;

  -- Evaluate preflight with rewritten content
  select decision, score, reasons, details into d, s, reasons, det
  from public.preflight_evaluate_row(r.queue_id);

  -- Store the after evaluation
  update public.preflight_rewrites
     set preflight_after = jsonb_build_object('decision',d,'score',s,'reasons',reasons,'details',det),
         decision_after = d,
         score_after = s
   where id = r.id;

  -- If it passes, apply the rewrite and auto-release
  if d = 'allow' and s >= 70 then
    update public.send_queue
       set subject_effective = coalesce(r.rewritten_subject, subject),
           body_html_effective = coalesce(r.rewritten_html, body_html),
           rewrite_id = r.id,
           status = 'pending',           -- auto-release
           released_at = now(),
           preflight_decision = d,
           preflight_score = s,
           preflight_reasons = reasons
     where id = r.queue_id;

    update public.preflight_rewrites set auto_applied = true where id = r.id;
    return true;
  end if;

  -- If still not allowed, keep it held; UI can show "after" result.
  -- Restore original content in queue row
  update public.send_queue
     set subject = r.original_subject,
         body_html = r.original_html
   where id = r.queue_id;

  return false;
end $$;















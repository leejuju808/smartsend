-- Step 16 — PII Detect · Mask · Enforce
-- Migration: 101_day16_pii_hygiene.sql

-- A) Catalog of PII regexes (extendable)
create table if not exists public.ai_pii_patterns (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null unique,
  pattern text not null,                     -- Postgres regex
  replacement text not null default '[REDACTED]',
  enabled boolean not null default true
);

insert into public.ai_pii_patterns (name, pattern, replacement) values
  ('email', '([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})', '[EMAIL]'),
  ('phone', '(\+?\d{1,2}[\s.-]?)?(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})', '[PHONE]'),
  ('url', '(https?://[^\s]+)', '[URL]'),
  ('ip', '\b(?:(?:2[0-5]{2}|1?\d{1,2})\.){3}(?:2[0-5]{2}|1?\d{1,2})\b', '[IP]'),
  ('credit4', '\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{1,4}\b', '[CARD]')
on conflict (name) do nothing;

-- B) Redact function applies all enabled patterns
create or replace function public.ai_redact_pii(_txt text)
returns text
language plpgsql
as $$
declare
  r record;
  out text := coalesce(_txt, '');
begin
  for r in select pattern, replacement from public.ai_pii_patterns where enabled loop
    out := regexp_replace(out, r.pattern, r.replacement, 'gi');
  end loop;
  return out;
end
$$;

-- C) Hygiene audit log for anything we catch
create table if not exists public.ai_hygiene_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null check (source in ('live_inference', 'training_sample', 'annotation', 'import', 'other')),
  entity_id uuid,
  field text not null,
  issue text not null,          -- e.g., 'pii_detected'
  sample_snippet text
);

-- D) Prevent unsafe inserts/updates into training + live tables
create or replace function public.ai_guard_training_samples()
returns trigger
language plpgsql
as $$
declare
  aggregated_pattern text;
begin
  if new.text is not null then
    select string_agg('(' || pattern || ')', '|') into aggregated_pattern from public.ai_pii_patterns where enabled;

    if aggregated_pattern is not null and new.text ~ aggregated_pattern then
      insert into public.ai_hygiene_events (source, entity_id, field, issue, sample_snippet)
      values ('training_sample', new.id, 'text', 'pii_detected', left(new.text, 200));

      new.text := public.ai_redact_pii(new.text);
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists trg_ai_guard_training on public.ai_training_samples;
create trigger trg_ai_guard_training
before insert or update of text on public.ai_training_samples
for each row execute function public.ai_guard_training_samples();

create or replace function public.ai_guard_live_inferences()
returns trigger
language plpgsql
as $$
declare
  aggregated_pattern text;
begin
  if new.text_preview is not null then
    select string_agg('(' || pattern || ')', '|') into aggregated_pattern from public.ai_pii_patterns where enabled;

    if aggregated_pattern is not null and new.text_preview ~ aggregated_pattern then
      insert into public.ai_hygiene_events (source, entity_id, field, issue, sample_snippet)
      values ('live_inference', new.id, 'text_preview', 'pii_detected', left(new.text_preview, 200));

      new.text_preview := public.ai_redact_pii(new.text_preview);
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists trg_ai_guard_live on public.ai_live_inferences;
create trigger trg_ai_guard_live
before insert or update of text_preview on public.ai_live_inferences
for each row execute function public.ai_guard_live_inferences();

-- E) Convenience views
create or replace view public.ai_hygiene_daily as
select
  date_trunc('day', created_at) as day,
  source,
  issue,
  count(*)::int as n
from public.ai_hygiene_events
group by 1, 2, 3
order by 1 desc;

















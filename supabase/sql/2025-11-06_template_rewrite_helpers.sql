-- Spam lint catalog, placeholder helpers, and variant utilities for template rewrite feature

-- A) Spam term catalog
create table if not exists public.spam_terms (
  term text primary key,
  weight numeric not null default 1.0
);

insert into public.spam_terms (term, weight) values
  ('free', 1.0),
  ('guarantee', 1.0),
  ('risk[- ]?free', 1.2),
  ('act now', 1.2),
  ('winner', 1.0),
  ('cheap', 0.8),
  ('limited time', 0.8),
  ('earn \$?\d+', 1.2),
  ('make money', 1.2),
  ('urgent', 0.8),
  ('congratulations', 1.0)
on conflict do nothing;

-- B) Lint helper
drop function if exists public.lint_spam(text);

create or replace function public.lint_spam(p_text text)
returns jsonb
language plpgsql
stable
as $$
declare
  t record;
  txt text := lower(coalesce(p_text, ''));
  total numeric := 0;
  hits jsonb := '[]'::jsonb;
  c int;
begin
  for t in select * from public.spam_terms loop
    select count(*) into c from regexp_matches(txt, t.term, 'g');
    if c > 0 then
      total := total + (t.weight * c);
      hits := hits || jsonb_build_object('term', t.term, 'count', c, 'weight', t.weight);
    end if;
  end loop;

  return jsonb_build_object('score', total, 'hits', hits);
end;
$$;

-- C) Placeholder utilities
drop function if exists public.required_placeholders();

create or replace function public.required_placeholders()
returns text[]
language sql
immutable
as $$
  select array['{{first_name}}', '{{company}}']::text[]
$$;

drop function if exists public.placeholders_missing(text);

create or replace function public.placeholders_missing(p_html text)
returns text[]
language sql
stable
as $$
  select array(
    select ph
    from unnest(public.required_placeholders()) ph
    where position(ph in coalesce(p_html, '')) = 0
  )
$$;

-- D) Variant clone helper
drop function if exists public.insert_variant(uuid, int, text, text, text, numeric, boolean);

create or replace function public.insert_variant(
  p_campaign uuid,
  p_step_no int,
  p_name text,
  p_subject text,
  p_body_html text,
  p_weight numeric default 0.5,
  p_enabled boolean default true
) returns uuid
language plpgsql
security definer
as $$
declare
  v_id uuid;
begin
  insert into public.campaign_step_variants (
    campaign_id,
    step_no,
    name,
    weight,
    subject_template,
    body_html_template,
    enabled
  ) values (
    p_campaign,
    p_step_no,
    p_name,
    p_weight,
    p_subject,
    p_body_html,
    p_enabled
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.insert_variant(uuid, int, text, text, text, numeric, boolean) from public;
grant execute on function public.insert_variant(uuid, int, text, text, text, numeric, boolean) to service_role, authenticated;

-- E) Variant quality view
create or replace view public.v_variant_quality as
select
  v.id,
  v.campaign_id,
  v.step_no,
  v.name,
  (public.lint_spam(coalesce(v.subject_template, '') || ' ' || coalesce(v.body_html_template, '')) ->> 'score')::numeric as spam_score,
  public.placeholders_missing(v.body_html_template) as missing_placeholders
from public.campaign_step_variants v;







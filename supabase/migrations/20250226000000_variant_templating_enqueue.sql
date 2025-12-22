-- ─────────────────────────────────────────────────────────────
-- Deterministic Variant Picker + JSON Templating + Enqueue Integration
-- ─────────────────────────────────────────────────────────────

-- A) send_queue columns to store the resolved content
-- ─────────────────────────────────────────────────────────────
alter table public.send_queue
  add column if not exists to_email citext,
  add column if not exists variant_id uuid,
  add column if not exists variant_name text,
  add column if not exists subject_rendered text,
  add column if not exists body_html_rendered text;

create index if not exists idx_sq_variant on public.send_queue(campaign_id, step_no, variant_id);

-- ─────────────────────────────────────────────────────────────
-- B) Helpers: hashing & weight pick
-- ─────────────────────────────────────────────────────────────

-- Uniform [0,1) from hash of (campaign:step:lead)
create or replace function public._u01_for_variant(p_campaign uuid, p_step int, p_lead uuid)
returns numeric
language sql immutable as $$
  with h as (
    select encode(digest(p_campaign::text || ':' || p_step::text || ':' || p_lead::text, 'sha256'), 'hex') as hex
  )
  select (('x' || substr(hex, 1, 8))::bit(32)::bigint)::numeric / 4294967296.0 from h;
$$;

-- Deterministic pick among enabled variants using weights; if no variants, returns nulls
create or replace function public.pick_step_variant(
  p_campaign uuid,
  p_step int,
  p_lead uuid
) returns table(variant_id uuid, variant_name text)
language sql stable as $$
  with vars as (
    select id, name, coalesce(nullif(weight::numeric,0), 0.0) as w
    from public.campaign_step_variants
    where campaign_id = p_campaign and step_no = p_step and enabled
    order by name
  ),
  tot as (select sum(w) as tw from vars),
  norm as (
    select id, name, (case when (select tw from tot) > 0 then w/(select tw from tot) else 0 end) as p
    from vars
  ),
  cum as (
    select id, name, p, sum(p) over (order by id) as cume
    from norm
  ),
  r as (select public._u01_for_variant(p_campaign, p_step, p_lead) as u)
  select c.id, c.name
  from cum c, r
  where c.cume >= r.u
  order by c.cume
  limit 1;
$$;

-- ─────────────────────────────────────────────────────────────
-- C) JSON context builder + flat templating
-- ─────────────────────────────────────────────────────────────

-- Build a default render context from leads + campaign
create or replace function public.build_render_context(p_campaign uuid, p_lead uuid)
returns jsonb
language sql stable as $$
  select jsonb_strip_nulls(
    jsonb_build_object(
      'lead_id', l.id::text,
      'email', l.email,
      'first_name', coalesce(l.first_name, (l.meta->>'first_name')),
      'last_name',  coalesce(l.last_name,  (l.meta->>'last_name')),
      'full_name',  trim(both ' ' from coalesce(l.first_name,'') || ' ' || coalesce(l.last_name,'')),
      'company',    coalesce(l.company, (l.meta->>'company')),
      'domain',     l.domain,
      'campaign_id', c.id::text,
      'campaign_name', c.name,
      'today', to_char(current_date, 'YYYY-MM-DD'),
      'now_iso', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF'),
      'unsubscribe_url', '{{unsubscribe_url}}' -- placeholder; fill at send time
    )
  )
  from public.leads l
  join public.campaigns c on c.id = p_campaign
  where l.id = p_lead;
$$;

-- Basic flat key replacement for {{key}} using JSONB top-level keys
create or replace function public.template_render(p_template text, p_ctx jsonb)
returns text
language plpgsql stable as $$
declare
  k text;
  v text;
  out text := coalesce(p_template,'');
begin
  if out = '' then
    return out;
  end if;

  -- Replace {{key}} for each top-level key
  for k in select key from jsonb_object_keys(p_ctx) as t(key)
  loop
    v := p_ctx ->> k;
    if v is not null then
      out := replace(out, '{{' || k || '}}', v);
    end if;
  end loop;

  -- Remove any untouched {{...}} tokens to avoid leaking brackets
  out := regexp_replace(out, '\{\{[^}]+\}\}', '', 'g');

  return out;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- D) Resolve subject/body for a (campaign, step, lead)
--    Prefers variant template; falls back to step template.
-- ─────────────────────────────────────────────────────────────

create or replace function public.resolve_step_content(
  p_campaign uuid,
  p_step int,
  p_lead uuid,
  p_extra jsonb default '{}'::jsonb -- caller can merge additional keys
) returns table(
  variant_id uuid,
  variant_name text,
  subject text,
  body_html text,
  ctx jsonb
)
language plpgsql stable
as $$
declare
  v jsonb;
  pv record;
  s record;
  t_subject text;
  t_body text;
begin
  v := coalesce(public.build_render_context(p_campaign, p_lead), '{}'::jsonb) || coalesce(p_extra, '{}'::jsonb);

  -- Try variant
  select * into pv from public.pick_step_variant(p_campaign, p_step, p_lead);

  if pv.variant_id is not null then
    select subject_template, body_html_template
      into t_subject, t_body
    from public.campaign_step_variants
    where id = pv.variant_id;

    subject := public.template_render(t_subject, v);
    body_html := public.template_render(t_body, v);
    variant_id := pv.variant_id;
    variant_name := pv.variant_name;
    ctx := v;
    return next;
  end if;

  -- Fallback: campaign_steps template
  select subject_template, body_html_template
    into t_subject, t_body
  from public.campaign_steps
  where campaign_id = p_campaign and step_no = p_step;

  subject := public.template_render(t_subject, v);
  body_html := public.template_render(t_body, v);
  variant_id := null;
  variant_name := null;
  ctx := v;
  return next;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- E) Enqueue with content resolution
-- ─────────────────────────────────────────────────────────────

drop function if exists public.enqueue_next_send_for_step(uuid,int,uuid,timestamptz,boolean);

create or replace function public.enqueue_next_send_for_step(
  p_campaign uuid,
  p_step_no int,
  p_lead uuid,
  p_base timestamptz default now(),
  p_include_jitter boolean default true,
  p_extra jsonb default '{}'::jsonb
) returns timestamptz
language plpgsql security definer
as $$
declare
  r record;
  rc record;
  v_email citext;
begin
  if not public.can_edit_campaign(p_campaign) then
    raise exception 'Forbidden';
  end if;

  -- compute schedule (existing preview)
  select * into r from public.preview_next_send_for_step(p_campaign, p_step_no, p_lead, p_base, p_include_jitter);

  -- resolve content & lead email
  select l.email into v_email from public.leads l where l.id = p_lead;

  select * into rc from public.resolve_step_content(p_campaign, p_step_no, p_lead, p_extra);

  insert into public.send_queue (
    campaign_id, lead_id, step_no,
    scheduled_at, status,
    to_email, variant_id, variant_name,
    subject_rendered, body_html_rendered,
    created_at
  )
  values (
    p_campaign, p_lead, p_step_no,
    r.scheduled_at, 'pending',
    v_email, rc.variant_id, rc.variant_name,
    rc.subject, rc.body_html,
    now()
  );

  return r.scheduled_at;
end;
$$;

-- Bulk variant-aware enqueue (replaces earlier simple bulk)
drop function if exists public.bulk_enqueue_next_send(uuid,int,uuid[],timestamptz,boolean);

create or replace function public.bulk_enqueue_next_send(
  p_campaign uuid,
  p_step_no int,
  p_leads uuid[],
  p_base timestamptz default now(),
  p_include_jitter boolean default true,
  p_extra jsonb default '{}'::jsonb
) returns int
language plpgsql security definer
as $$
declare
  lid uuid;
  v_count int := 0;
begin
  if not public.can_edit_campaign(p_campaign) then
    raise exception 'Forbidden';
  end if;

  foreach lid in array p_leads
  loop
    perform public.enqueue_next_send_for_step(p_campaign, p_step_no, lid, p_base, p_include_jitter, p_extra);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- Grant execute permissions
grant execute on function public._u01_for_variant to authenticated, service_role;
grant execute on function public.pick_step_variant to authenticated, service_role;
grant execute on function public.build_render_context to authenticated, service_role;
grant execute on function public.template_render to authenticated, service_role;
grant execute on function public.resolve_step_content to authenticated, service_role;
grant execute on function public.enqueue_next_send_for_step to authenticated, service_role;
grant execute on function public.bulk_enqueue_next_send to authenticated, service_role;


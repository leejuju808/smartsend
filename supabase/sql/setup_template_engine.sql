-- 1) DB prep — lead fields & campaign defaults (idempotent)

-- Common lead fields + flexible meta
alter table public.leads
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists company text,
  add column if not exists title text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists country text,
  add column if not exists meta jsonb default '{}'::jsonb;

-- Campaign default variables (e.g., from_name, signature, product lines)
alter table public.campaigns
  add column if not exists default_vars jsonb default '{}'::jsonb;


-- 2) Helpers — merge & render

-- A) Deep merge for jsonb (b overwrites a)
create or replace function public.jsonb_deep_merge(a jsonb, b jsonb)
returns jsonb
language sql immutable as $$
  select jsonb_object_agg(
           coalesce(ka, kb),
           case
             when va isnull then vb
             when vb isnull then va
             when jsonb_typeof(va) = 'object' and jsonb_typeof(vb) = 'object'
               then public.jsonb_deep_merge(va, vb)
             else vb
           end
         )
  from jsonb_each(a) ae(ka, va)
  full join jsonb_each(b) be(kb, vb)
    on ka = kb
$$;


-- B) Build render context for a campaign + lead (includes UNSUB_LINK)
create or replace function public.template_context_for_lead(p_campaign uuid, p_lead uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb := '{}'::jsonb;
  v_token uuid;
  v_lead  record;
  v_camp  record;
  v_host text := coalesce(current_setting('request.headers.x-forwarded-host', true), 'app.smartsendhq.com');
  k text;
  vj jsonb;
begin
  select * into v_lead from public.leads where id = p_lead;
  select * into v_camp from public.campaigns where id = p_campaign;

  v_token := public.ensure_optin_token(p_campaign, p_lead);

  v := public.jsonb_deep_merge(
        coalesce(v_camp.default_vars, '{}'::jsonb),
        jsonb_build_object(
          'LEAD_EMAIL', v_lead.email,
          'FIRST_NAME', v_lead.first_name,
          'LAST_NAME',  v_lead.last_name,
          'FULL_NAME',  trim(coalesce(v_lead.first_name,'')||' '||coalesce(v_lead.last_name,'')),
          'COMPANY',    v_lead.company,
          'TITLE',      v_lead.title,
          'CITY',       v_lead.city,
          'STATE',      v_lead.state,
          'COUNTRY',    v_lead.country
        )
      );

  -- include meta.* flattened one level (stringify scalars)
  if v_lead.meta is not null then
    for k, vj in select key, value from jsonb_each(coalesce(v_lead.meta,'{}'::jsonb))
    loop
      if jsonb_typeof(vj) in ('string','number','boolean') then
        v := public.jsonb_deep_merge(v, jsonb_build_object(upper(k), vj));
      end if;
    end loop;
  end if;

  -- unsubscribe link
  v := public.jsonb_deep_merge(v, jsonb_build_object(
    'UNSUB_LINK', ('https://'||v_host||'/functions/v1/unsubscribe?t='||v_token::text)
  ));

  return v;
end;
$$;


-- C) Minimal templater: replace {{KEY}} (case-insensitive on KEY)
create or replace function public.render_template(p_template text, p_vars jsonb)
returns text
language plpgsql
as $$
declare
  v_out text := coalesce(p_template,'');
  v_match text;
  v_key   text;
  v_val   text;
  v_regex constant text := '\{\{\s*([A-Za-z0-9_\.]+)\s*\}\}';
begin
  if v_out = '' then
    return v_out;
  end if;

  -- Replace {{KEY}} tokens
  for v_match in
    select distinct m[1]
    from regexp_matches(v_out, v_regex, 'g') as m
  loop
    v_key := upper(v_match);
    v_val := coalesce(p_vars ->> v_key, ''); -- empty string if missing
    v_out := regexp_replace(v_out,
              '\{\{\s*' || regexp_replace(v_match, '([^\w])', '\\\\\1', 'g') || '\s*\}\}',
              replace(v_val, '$', '$$'),
              'gi');
  end loop;

  return v_out;
end;
$$;


-- D) Lint: list missing variables for a given template/context
create or replace function public.lint_template(p_template text, p_vars jsonb)
returns text[]
language sql
immutable
as $$
  with toks as (
    select upper(m[1]) as key
    from regexp_matches(coalesce(p_template,''), '\{\{\s*([A-Za-z0-9_\.]+)\s*\}\}', 'g') as m
  )
  select array_agg(distinct t.key)
  from toks t
  where coalesce(p_vars ->> t.key, '') = ''
$$;


-- 3) Render at enqueue time
create or replace function public.enqueue_next_campaign_step(
  p_campaign uuid,
  p_lead uuid,
  p_sent_step int,
  p_sent_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next record;
  v_account uuid;
  v_base timestamptz;
  v_scheduled timestamptz;
  v_email citext;
  v_ctx jsonb;
  v_subject text;
  v_body text;
begin
  -- suppression guard
  select email into v_email from public.leads where id = p_lead;
  select account_id into v_account from public.campaigns where id = p_campaign;
  if public.is_suppressed(v_email, v_account) then return; end if;

  -- next enabled step
  select id, step_no, offset_days, subject_template, body_html_template
    into v_next
  from public.campaign_steps
  where campaign_id = p_campaign
    and enabled
    and step_no = p_sent_step + 1
  order by step_no
  limit 1;
  if not found then return; end if;

  -- base → business-day/window clamp
  v_base := p_sent_at + (v_next.offset_days || ' days')::interval;
  v_scheduled := public.business_windowed_send_time_for_step(v_account, v_base, v_next.id);

  -- build context + render
  v_ctx := public.template_context_for_lead(p_campaign, p_lead);
  v_subject := public.render_template(v_next.subject_template, v_ctx);
  v_body    := public.render_template(v_next.body_html_template, v_ctx);

  insert into public.send_queue (
    campaign_id, lead_id, account_id, step_no, scheduled_for,
    subject, body_html, status
  ) values (
    p_campaign, p_lead, v_account, v_next.step_no, v_scheduled,
    v_subject, v_body, 'queued'
  );
end;
$$;



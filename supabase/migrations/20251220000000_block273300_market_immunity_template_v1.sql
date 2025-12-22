-- =========================================================
-- Block 273300 — SmartSend Market Immunity Sprint v1
-- "Always-On Neighborhood Roof Check" (shock-proof evergreen outreach)
-- =========================================================
-- Goal:
-- - Provide an evergreen campaign template that performs under:
--   - algorithm/platform shocks (ads/SEO changes)
--   - downturns (others go quiet)
--   - competitor noise (price wars / promos)
--
-- Implementation notes:
-- - We seed defensively because campaign_templates exists in multiple shapes across migrations.
-- - We seed BOTH:
--   - template_steps (locked canonical copy; absolute delay_days from Day 0)
--   - campaign_template_steps (fallback for older flows)
-- - Variables used are consistent with other roofing templates: {{first_name}}, {{company_name}}, {{city}}, {{neighborhood}}, {{booking_link}}
-- =========================================================

-- 1) Ensure canonical locked-copy step table exists (absolute day offsets)
create table if not exists public.template_steps (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.campaign_templates(id) on delete cascade,
  step_number int not null,
  delay_days int not null, -- absolute days from Day 0 (0,2,5,9,14)
  subject text not null,
  body_text text not null,
  created_at timestamptz not null default now(),
  unique (template_id, step_number)
);

create index if not exists idx_template_steps_template_id
  on public.template_steps(template_id, step_number);

-- RLS: allow authenticated read (locked, global templates)
alter table public.template_steps enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'template_steps'
      and policyname = 'template_steps_select_authenticated'
  ) then
    create policy template_steps_select_authenticated
      on public.template_steps
      for select
      to authenticated
      using (true);
  end if;
end $$;

-- 2) Seed the Market Immunity evergreen template + its 5 locked steps (and fallback campaign_template_steps)
do $$
declare
  v_template_id uuid;
  v_slug text := 'market-immunity-always-on-neighborhood-check-v1';
  v_name text := 'Always‑On Neighborhood Roof Check (Market Immunity)';
  v_niche text := 'roofing';
  v_description text := 'Evergreen “always-on” outreach that keeps conversations steady even when ads/SEO shift, markets slow, or competitors get noisy.';
  v_goal text := 'book_estimates';
  v_recommended_steps int := 5;
  v_category text := 'evergreen';
  v_promo_tag text := 'Shock‑Proof';
  v_emails jsonb := '[
    {"step":1,"delay_days":0,"subject":"Quick roof question in {{neighborhood}}","body":"Hey {{first_name}},\n\nThis is {{company_name}} here in {{city}}.\n\nWe''re doing quick roof checkups in {{neighborhood}} this week — not a sales thing, just a simple look to catch small issues before they turn into leaks.\n\nIf you want one, grab a time here: {{booking_link}}\n\nOr just reply here and I''ll get you on the schedule."},
    {"step":2,"delay_days":2,"subject":"Want me to add you to the route?","body":"{{first_name}} — quick follow up.\n\nWe''re already in {{neighborhood}} this week. Want me to add your home to the route for a quick roof check?\n\n{{booking_link}}\n\nIf not, all good — just reply “no” and I''ll close it out."},
    {"step":3,"delay_days":5,"subject":"Most roof issues start small","body":"Hey {{first_name}},\n\nMost roof problems start as something tiny you can''t see from the ground (lifted shingle, flashing gap, small puncture).\n\nIf you want, we can take a quick look and send you photos of anything we find. Book here: {{booking_link}}"},
    {"step":4,"delay_days":9,"subject":"Still want a quick roof check?","body":"Just checking in, {{first_name}}.\n\nDo you want a quick roof check while we''re still in {{neighborhood}}?\n\n{{booking_link}}\n\nReply here if you want me to pencil you in."},
    {"step":5,"delay_days":14,"subject":"Close this out?","body":"Last note from me, {{first_name}}.\n\nShould I close this out, or do you want to schedule the roof check?\n\n{{booking_link}}\n\n— {{company_name}}"}
  ]'::jsonb;
  cols text[] := array[]::text[];
  vals text[] := array[]::text[];
  sql text;
begin
  -- Locate existing template row (prefer slug if present)
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='campaign_templates' and column_name='slug'
  ) then
    select id into v_template_id
    from public.campaign_templates
    where slug = v_slug
    limit 1;
  else
    select id into v_template_id
    from public.campaign_templates
    where name = v_name
      and (not exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name='campaign_templates' and column_name='niche'
      ) or niche = v_niche)
    limit 1;
  end if;

  -- Insert template if missing (defensive across schema variants)
  if v_template_id is null then
    cols := cols || 'name';
    vals := vals || quote_literal(v_name);

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='campaign_templates' and column_name='slug') then
      cols := cols || 'slug';
      vals := vals || quote_literal(v_slug);
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='campaign_templates' and column_name='niche') then
      cols := cols || 'niche';
      vals := vals || quote_literal(v_niche);
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='campaign_templates' and column_name='description') then
      cols := cols || 'description';
      vals := vals || quote_literal(v_description);
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='campaign_templates' and column_name='goal') then
      cols := cols || 'goal';
      vals := vals || quote_literal(v_goal);
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='campaign_templates' and column_name='category') then
      cols := cols || 'category';
      vals := vals || quote_literal(v_category);
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='campaign_templates' and column_name='promo_tag') then
      cols := cols || 'promo_tag';
      vals := vals || quote_literal(v_promo_tag);
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='campaign_templates' and column_name='recommended_steps') then
      cols := cols || 'recommended_steps';
      vals := vals || v_recommended_steps::text;
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='campaign_templates' and column_name='personalization_required') then
      cols := cols || 'personalization_required';
      vals := vals || 'true';
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='campaign_templates' and column_name='tone_options') then
      cols := cols || 'tone_options';
      vals := vals || quote_literal('{friendly,professional,simple}'::text);
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='campaign_templates' and column_name='recommended_list_types') then
      cols := cols || 'recommended_list_types';
      vals := vals || quote_literal('{neighborhood_lists,high_risk_zips}'::text);
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='campaign_templates' and column_name='emails') then
      cols := cols || 'emails';
      vals := vals || (quote_literal(v_emails::text) || '::jsonb');
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='campaign_templates' and column_name='is_active') then
      cols := cols || 'is_active';
      vals := vals || 'true';
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='campaign_templates' and column_name='is_global') then
      cols := cols || 'is_global';
      vals := vals || 'true';
    end if;

    sql := format(
      'insert into public.campaign_templates (%s) values (%s) returning id',
      array_to_string(cols, ','),
      array_to_string(vals, ',')
    );

    execute sql into v_template_id;
  else
    -- Best-effort: ensure active + description are up to date if those columns exist
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='campaign_templates' and column_name='description') then
      update public.campaign_templates set description = v_description where id = v_template_id;
    end if;
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='campaign_templates' and column_name='is_active') then
      update public.campaign_templates set is_active = true where id = v_template_id;
    end if;
  end if;

  -- Seed locked steps (template_steps; absolute day offsets)
  insert into public.template_steps (template_id, step_number, delay_days, subject, body_text)
  values
    (v_template_id, 1, 0,  'Quick roof question in {{neighborhood}}',
      'Hey {{first_name}},\n\nThis is {{company_name}} here in {{city}}.\n\nWe''re doing quick roof checkups in {{neighborhood}} this week — not a sales thing, just a simple look to catch small issues before they turn into leaks.\n\nIf you want one, grab a time here: {{booking_link}}\n\nOr just reply here and I''ll get you on the schedule.'),
    (v_template_id, 2, 2,  'Want me to add you to the route?',
      '{{first_name}} — quick follow up.\n\nWe''re already in {{neighborhood}} this week. Want me to add your home to the route for a quick roof check?\n\n{{booking_link}}\n\nIf not, all good — just reply “no” and I''ll close it out.'),
    (v_template_id, 3, 5,  'Most roof issues start small',
      'Hey {{first_name}},\n\nMost roof problems start as something tiny you can''t see from the ground (lifted shingle, flashing gap, small puncture).\n\nIf you want, we can take a quick look and send you photos of anything we find. Book here: {{booking_link}}'),
    (v_template_id, 4, 9,  'Still want a quick roof check?',
      'Just checking in, {{first_name}}.\n\nDo you want a quick roof check while we''re still in {{neighborhood}}?\n\n{{booking_link}}\n\nReply here if you want me to pencil you in.'),
    (v_template_id, 5, 14, 'Close this out?',
      'Last note from me, {{first_name}}.\n\nShould I close this out, or do you want to schedule the roof check?\n\n{{booking_link}}\n\n— {{company_name}}')
  on conflict (template_id, step_number) do update set
    delay_days = excluded.delay_days,
    subject = excluded.subject,
    body_text = excluded.body_text;

  -- Seed fallback steps (campaign_template_steps; per-step offsets)
  if exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name='campaign_template_steps'
  ) then
    insert into public.campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
    values
      (v_template_id, 1, 0, 'friendly',
        'Quick roof question in {{neighborhood}}',
        'Hey {{first_name}},\n\nThis is {{company_name}} here in {{city}}.\n\nWe''re doing quick roof checkups in {{neighborhood}} this week — not a sales thing, just a simple look to catch small issues before they turn into leaks.\n\nIf you want one, grab a time here: {{booking_link}}\n\nOr just reply here and I''ll get you on the schedule.'),
      (v_template_id, 2, 2, 'friendly',
        'Want me to add you to the route?',
        '{{first_name}} — quick follow up.\n\nWe''re already in {{neighborhood}} this week. Want me to add your home to the route for a quick roof check?\n\n{{booking_link}}\n\nIf not, all good — just reply “no” and I''ll close it out.'),
      (v_template_id, 3, 3, 'professional',
        'Most roof issues start small',
        'Hey {{first_name}},\n\nMost roof problems start as something tiny you can''t see from the ground (lifted shingle, flashing gap, small puncture).\n\nIf you want, we can take a quick look and send you photos of anything we find. Book here: {{booking_link}}'),
      (v_template_id, 4, 4, 'simple',
        'Still want a quick roof check?',
        'Just checking in, {{first_name}}.\n\nDo you want a quick roof check while we''re still in {{neighborhood}}?\n\n{{booking_link}}\n\nReply here if you want me to pencil you in.'),
      (v_template_id, 5, 5, 'simple',
        'Close this out?',
        'Last note from me, {{first_name}}.\n\nShould I close this out, or do you want to schedule the roof check?\n\n{{booking_link}}\n\n— {{company_name}}')
    on conflict (template_id, step_order) do update set
      delay_days = excluded.delay_days,
      tone = excluded.tone,
      subject_template = excluded.subject_template,
      body_template = excluded.body_template;
  end if;
end $$;




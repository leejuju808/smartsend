-- =========================================================
-- Roofing Campaign Template v1
-- "Storm Check — Free Roof Inspection" (5-step sequence, single CTA)
-- =========================================================
-- Notes:
-- - Copy is locked; do not edit the email copy in-app.
-- - delay_days in template_steps is ABSOLUTE from Day 0: (0,2,5,9,14).
-- - Campaign instantiation should convert absolute delay_days into per-step offsets.
--
-- Tables:
-- - campaign_templates (existing in many shapes across migrations; we seed defensively)
-- - template_steps (new; canonical source of locked copy for this template)
-- =========================================================

-- 1) Canonical locked-copy step table (absolute day offsets)
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

-- 2) Seed the single roofing campaign template + its 5 locked steps
do $$
declare
  v_template_id uuid;
  v_slug text := 'storm-check-free-roof-inspection-v1';
  v_name text := 'Storm Check — Free Roof Inspection';
  v_niche text := 'roofing';
  v_description text := 'Storm check outreach sequence offering a quick roof inspection. Single CTA: Reply YES to schedule.';
  v_goal text := 'inspection';
  v_recommended_steps int := 5;
  v_emails jsonb := '[
    {"step":1,"delay_days":0,"subject":"Quick roof question in {{City}}","body":"Hi {{Name}},\nWe\u2019ve been helping homeowners in {{City}} spot storm/wind damage before it turns into leaks.\nWould you like a quick inspection to see if anything stands out?\nReply YES and we\u2019ll get you scheduled."},
    {"step":2,"delay_days":2,"subject":"Following up \u2014 roof inspection","body":"Just checking in, {{Name}} \u2014 happy to take a quick look and let you know if anything needs attention.\nReply YES if you want to get it scheduled."},
    {"step":3,"delay_days":5,"subject":"Timing matters with roof issues","body":"Small issues can turn into bigger repairs fast, especially after wind/rain.\nWant us to check it out? Reply YES and we\u2019ll schedule."},
    {"step":4,"delay_days":9,"subject":"Still want a quick roof check?","body":"No pressure \u2014 just making sure you saw this.\nReply YES if you\u2019d like us to swing by for a quick inspection."},
    {"step":5,"delay_days":14,"subject":"Close the loop?","body":"Should I close this out, or do you want to schedule the inspection?\nReply YES and we\u2019ll set a time."}
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

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='campaign_templates' and column_name='emails') then
      cols := cols || 'emails';
      vals := vals || (quote_literal(v_emails::text) || '::jsonb');
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='campaign_templates' and column_name='recommended_steps') then
      cols := cols || 'recommended_steps';
      vals := vals || v_recommended_steps::text;
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
  end if;

  -- Upsert locked steps into template_steps (absolute delays)
  delete from public.template_steps where template_id = v_template_id;

  insert into public.template_steps (template_id, step_number, delay_days, subject, body_text)
  values
    (v_template_id, 1, 0,  'Quick roof question in {{City}}',
      'Hi {{Name}},
We’ve been helping homeowners in {{City}} spot storm/wind damage before it turns into leaks.
Would you like a quick inspection to see if anything stands out?
Reply YES and we’ll get you scheduled.'
    ),
    (v_template_id, 2, 2,  'Following up — roof inspection',
      'Just checking in, {{Name}} — happy to take a quick look and let you know if anything needs attention.
Reply YES if you want to get it scheduled.'
    ),
    (v_template_id, 3, 5,  'Timing matters with roof issues',
      'Small issues can turn into bigger repairs fast, especially after wind/rain.
Want us to check it out? Reply YES and we’ll schedule.'
    ),
    (v_template_id, 4, 9,  'Still want a quick roof check?',
      'No pressure — just making sure you saw this.
Reply YES if you’d like us to swing by for a quick inspection.'
    ),
    (v_template_id, 5, 14, 'Close the loop?',
      'Should I close this out, or do you want to schedule the inspection?
Reply YES and we’ll set a time.'
    );
end $$;

-- 3) Compatibility: make compose_email_by_step understand {{Name}} and {{City}}
-- (Some UI/spec copy uses these tokens; we map them to lead first_name/city.)
create or replace function public.compose_email_by_step(p_campaign uuid, p_lead uuid, p_step int)
returns table(to_email citext, subject text, html text)
language sql stable
set search_path=public
as $$
  with s as (
    select cs.subject_template, cs.body_html_template
    from public.campaign_steps cs
    where cs.campaign_id = p_campaign and cs.step_no = p_step and cs.enabled = true
  ),
  pick as (
    select
      coalesce(s.subject_template, c.subject_template, c.subject) as subj,
      coalesce(s.body_html_template, c.body_html_template, c.body_template) as body
    from public.campaigns c
    left join s on true
    where c.id = p_campaign
  )
  select
    l.email::citext as to_email,
    coalesce(
      -- Common tokens
      replace(replace(replace(replace(replace(replace(replace(pick.subj,
        '{{first_name}}', coalesce(l.first_name,'')),
        '{{last_name}}',  coalesce(l.last_name,'')),
        '{{company}}',    coalesce(l.company,'')),
        '{{email}}',      coalesce(l.email,'')),
        '{{domain}}',     coalesce(l.domain::text,'')),
        -- Locked-copy tokens
        '{{Name}}',       coalesce(l.first_name,'')),
        '{{City}}',       coalesce(l.city,'')),
      '[No subject]'
    ) as subject,
    coalesce(
      replace(replace(replace(replace(replace(replace(replace(pick.body,
        '{{first_name}}', coalesce(l.first_name,'')),
        '{{last_name}}',  coalesce(l.last_name,'')),
        '{{company}}',    coalesce(l.company,'')),
        '{{email}}',      coalesce(l.email,'')),
        '{{domain}}',     coalesce(l.domain::text,'')),
        '{{Name}}',       coalesce(l.first_name,'')),
        '{{City}}',       coalesce(l.city,'')),
      '<p>Hello,</p>'
    ) as html
  from public.leads l, pick
  where l.id = p_lead;
$$;

-- 4) Safety: follow-up scheduler should skip dead/replied/suppressed leads
-- (In addition to suppression checks at send-time.)
create or replace function public.schedule_followups_for_campaign(
  p_campaign uuid,
  p_from_step int default 1,
  p_limit int default 500
) returns int
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid;
  v_account uuid;
  v_daily_cap int;
  v_step int := p_from_step + 1;             -- schedule the "next" step
  v_offset int := 2;
  v_start text; v_end text;
  v_count int := 0;

  v_today_start timestamptz := date_trunc('day', now());
  v_today_end   timestamptz := v_today_start + interval '1 day' - interval '1 millisecond';
  v_sent_today int := 0;
  v_remaining int := 0;
begin
  -- campaign context
  select c.user_id,
         coalesce(c.daily_cap, 40) as daily_cap
    into v_user, v_daily_cap
  from public.campaigns c
  where c.id = p_campaign;

  -- mailbox/account for this user (best-effort; used by send_queue schema variants)
  select id into v_account
  from public.connected_accounts
  where user_id = v_user
  limit 1;

  -- step config
  select offset_days, send_start, send_end
    into v_offset, v_start, v_end
  from public.campaign_steps
  where campaign_id = p_campaign and step_no = v_step and enabled = true;

  if v_offset is null then
    return 0;
  end if;

  -- today's remaining cap (sent today only)
  select count(*)::int into v_sent_today
  from public.send_logs
  where campaign_id = p_campaign and status='sent'
    and created_at between v_today_start and v_today_end;

  v_remaining := greatest(0, v_daily_cap - v_sent_today);
  if v_remaining = 0 then
    return 0;
  end if;
  v_remaining := least(v_remaining, p_limit);

  with last_sent as (
    select sl.lead_id, min(sl.created_at) as first_sent, max(sl.created_at) as last_sent
    from public.send_logs sl
    where sl.campaign_id = p_campaign and sl.status='sent' and sl.step_no = p_from_step
    group by 1
  ),
  eligible as (
    select ls.lead_id, ls.last_sent
    from last_sent ls
    left join public.inbox_threads t on t.campaign_id = p_campaign and t.lead_id = ls.lead_id
    left join public.leads l on l.id = ls.lead_id
    left join lateral (
      select 1 from public.send_logs x
      where x.campaign_id = p_campaign and x.lead_id = ls.lead_id and x.step_no = v_step
      limit 1
    ) sent_next on true
    left join lateral (
      select 1 from public.send_queue q
      where q.campaign_id = p_campaign and q.lead_id = ls.lead_id and q.step_no = v_step and q.status in ('queued','sending')
      limit 1
    ) queued_next on true
    where coalesce(t.replied_at, null) is null
      and coalesce(l.opted_out_at, null) is null
      and coalesce(l.bounced_at, null) is null
      and coalesce(l.status, '') <> 'dead'
      and coalesce(l.has_replied, false) = false
      and coalesce(l.unsubscribed, false) = false
      and coalesce(l.bounced, false) = false
      and sent_next is null
      and queued_next is null
      and (t.ooo_until is null or t.ooo_until <= now())
  ),
  plan as (
    select
      e.lead_id,
      public.apply_send_window(e.last_sent + (v_offset || ' days')::interval, v_start, v_end) as scheduled_at
    from eligible e
    order by scheduled_at asc
    limit v_remaining
  )
  insert into public.send_queue (
    user_id, campaign_id, lead_id, scheduled_at, status, step_no
  )
  select v_user, p_campaign, p.lead_id,
         greatest(p.scheduled_at, now()), 'queued', v_step
  from plan p
  on conflict (campaign_id, lead_id, step_no) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end $$;










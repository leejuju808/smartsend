-- Saved replies storage, helpers, and render pipeline

-- =====================================================
-- 1) Saved replies table
-- =====================================================

create table if not exists public.saved_replies (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  title text not null,
  subject_template text,
  body_text_template text,
  body_html_template text,
  is_shared boolean not null default false,
  vars jsonb not null default '{}'::jsonb
);

create index if not exists idx_saved_replies_owner
  on public.saved_replies(owner_id, created_at desc);

create index if not exists idx_saved_replies_campaign
  on public.saved_replies(campaign_id, is_shared);


-- =====================================================
-- 2) Touch trigger for updated_at
-- =====================================================

create or replace function public._touch_saved_replies()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_saved_replies on public.saved_replies;

create trigger trg_touch_saved_replies
before update on public.saved_replies
for each row execute function public._touch_saved_replies();


-- =====================================================
-- 3) Row Level Security policies
-- =====================================================

alter table public.saved_replies enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'saved_replies'
      and policyname = 'sr_select'
  ) then
    create policy sr_select on public.saved_replies
      for select to authenticated using (
        owner_id = auth.uid()
        or (
          is_shared = true
          and campaign_id is not null
          and exists (
            select 1
            from public.campaign_members cm
            where cm.campaign_id = saved_replies.campaign_id
              and cm.user_id = auth.uid()
          )
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'saved_replies'
      and policyname = 'sr_insert'
  ) then
    create policy sr_insert on public.saved_replies
      for insert to authenticated with check (owner_id = auth.uid());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'saved_replies'
      and policyname = 'sr_update'
  ) then
    create policy sr_update on public.saved_replies
      for update to authenticated using (owner_id = auth.uid());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'saved_replies'
      and policyname = 'sr_delete'
  ) then
    create policy sr_delete on public.saved_replies
      for delete to authenticated using (owner_id = auth.uid());
  end if;
end;
$$;


-- =====================================================
-- 4) Rendering helpers
-- =====================================================

drop function if exists public.render_context(uuid, uuid);

create or replace function public.render_context(p_campaign uuid, p_lead uuid)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  l record;
  c record;
  acc record;
  ctx jsonb := '{}'::jsonb;
begin
  select first_name, last_name, company, email, meta
    into l
    from public.leads
    where id = p_lead;

  select user_id, from_account_id, name
    into c
    from public.campaigns
    where id = p_campaign;

  if c.from_account_id is not null then
    select email, meta
      into acc
      from public.connected_accounts
      where id = c.from_account_id;
  end if;

  ctx := ctx
    || jsonb_build_object('first_name', coalesce(l.first_name, ''))
    || jsonb_build_object('last_name', coalesce(l.last_name, ''))
    || jsonb_build_object('company', coalesce(l.company, ''))
    || jsonb_build_object('lead_email', coalesce(l.email, ''))
    || jsonb_build_object('campaign_name', coalesce(c.name, ''))
    || jsonb_build_object('my_email', coalesce(acc.email, ''))
    || jsonb_build_object('my_name', coalesce(acc.meta ->> 'display_name', ''))
    || jsonb_build_object('my_cal_link', coalesce(acc.meta ->> 'cal_link', ''));

  return ctx;
end;
$$;


drop function if exists public.replace_tokens(text, jsonb);

create or replace function public.replace_tokens(p_text text, p_vars jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  k text;
  v text;
  out text := coalesce(p_text, '');
begin
  if p_vars is null then
    return out;
  end if;

  for k in
    select key
    from jsonb_object_keys(p_vars) as t(key)
  loop
    v := coalesce(p_vars ->> k, '');
    out := regexp_replace(out, '{{\s*' || k || '\s*}}', v, 'g');
  end loop;

  return out;
end;
$$;


-- =====================================================
-- 5) RPC to render a saved reply
-- =====================================================

drop function if exists public.render_saved_reply(uuid, uuid, uuid);

create or replace function public.render_saved_reply(
  p_saved_reply uuid,
  p_campaign uuid,
  p_lead uuid
)
returns table(subject text, body_text text, body_html text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  sr saved_replies%rowtype;
  ctx jsonb;
  merged jsonb;
begin
  select *
    into sr
    from public.saved_replies
    where id = p_saved_reply;

  if not found then
    raise exception 'Saved reply not found';
  end if;

  if sr.owner_id <> auth.uid() then
    if not (
      sr.is_shared
      and sr.campaign_id is not null
      and sr.campaign_id = p_campaign
      and exists (
        select 1
        from public.campaign_members cm
        where cm.campaign_id = sr.campaign_id
          and cm.user_id = auth.uid()
      )
    ) then
      raise exception 'Not authorized';
    end if;
  end if;

  ctx := public.render_context(p_campaign, p_lead);
  merged := coalesce(sr.vars, '{}'::jsonb) || ctx;

  return query
  select
    public.replace_tokens(sr.subject_template, merged),
    public.replace_tokens(sr.body_text_template, merged),
    public.replace_tokens(sr.body_html_template, merged);
end;
$$;

revoke all on function public.render_saved_reply(uuid, uuid, uuid) from public;
grant execute on function public.render_saved_reply(uuid, uuid, uuid) to authenticated, service_role;


-- =====================================================
-- 6) Optional seed data (only when auth context available)
-- =====================================================

do $$
declare
  v_uid uuid;
begin
  select auth.uid() into v_uid;

  if v_uid is not null then
    insert into public.saved_replies (
      owner_id,
      title,
      subject_template,
      body_text_template,
      is_shared,
      vars
    )
    values
      (
        v_uid,
        'Book a quick intro',
        'Quick intro, {{first_name}}?',
        'Hi {{first_name}},\n\nWe help {{company}} book more meetings from cold email.\nOpen to a 10-min chat this week? Here''s my calendar: {{my_cal_link}}\n\n-- {{my_name}}',
        true,
        '{}'::jsonb
      ),
      (
        v_uid,
        'Not interested follow-up',
        'Re: quick note',
        'Totally get it, {{first_name}} -- appreciate the reply. I''ll close the loop on my side. If priorities change, here when helpful.\n\n-- {{my_name}}',
        true,
        '{}'::jsonb
      )
    on conflict do nothing;
  end if;
end;
$$;



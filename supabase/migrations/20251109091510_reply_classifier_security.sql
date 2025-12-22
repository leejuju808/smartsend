-- Block 1: Security & RLS hardening

alter table if exists public.reply_classes enable row level security;
alter table if exists public.out_of_office_logs enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'reply_classes'
      and policyname = 'reply_classes_select'
  ) then
    create policy reply_classes_select
    on public.reply_classes
    for select
    using (
      exists (
        select 1
        from public.inbox_threads t
        join public.campaign_members m on m.campaign_id = t.campaign_id
        where t.id = reply_classes.thread_id
          and m.user_id = auth.uid()
      )
    );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'out_of_office_logs'
      and policyname = 'ooo_logs_select'
  ) then
    create policy ooo_logs_select
    on public.out_of_office_logs
    for select
    using (
      exists (
        select 1
        from public.inbox_threads t
        join public.campaign_members m on m.campaign_id = t.campaign_id
        where t.id = out_of_office_logs.thread_id
          and m.user_id = auth.uid()
      )
    );
  end if;
end;
$$;

create index if not exists idx_nm_thread_dir_sent
  on public.normalized_messages (linked_thread_id, direction, sent_at desc);

create index if not exists idx_ooo_thread_active
  on public.out_of_office_logs (thread_id, active, resume_after desc);

create index if not exists idx_rc_thread_created
  on public.reply_classes (thread_id, created_at desc);

create or replace view public.v_inbox_state as
select
  t.id as thread_id,
  t.campaign_id,
  t.subject,
  t.last_message_preview,
  t.snoozed_until,
  vl.label,
  vl.confidence,
  vl.labeled_at,
  coalesce(
    (
      select o.resume_after
      from public.out_of_office_logs o
      where o.thread_id = t.id
        and o.active = true
      order by o.resume_after desc nulls last
      limit 1
    ),
    null
  ) as resume_after,
  exists (
    select 1
    from public.out_of_office_logs o
    where o.thread_id = t.id
      and o.active = true
  ) as has_active_ooo,
  t.updated_at
from public.inbox_threads t
left join public.v_inbox_labels vl on vl.thread_id = t.id;

alter view public.v_inbox_state set (security_invoker = true);

-- Block 2: Observability hooks (audit + health)

create table if not exists public.audit_classifier (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  thread_id uuid,
  message_id uuid,
  label text,
  confidence real,
  resume_after timestamptz,
  notes text
);

create or replace function public.fn_audit_classify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_classifier
    (thread_id, message_id, label, confidence, resume_after, notes)
  values
    (new.thread_id, new.message_id, new.label, new.confidence, null, 'reply_classes insert');
  return new;
end;
$$;

drop trigger if exists trg_audit_reply_classes on public.reply_classes;

create trigger trg_audit_reply_classes
after insert on public.reply_classes
for each row execute function public.fn_audit_classify();

create table if not exists public.health_flags (
  key text primary key,
  last_ok timestamptz,
  details text
);

create or replace function public.fn_health_classifier()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ts timestamptz;
begin
  select max(created_at) into ts
  from public.reply_classes;

  if ts is null or ts < now() - interval '6 hours' then
    insert into public.health_flags (key, last_ok, details)
    values ('reply_classifier', now(), 'No classifications in 6h')
    on conflict (key) do update
      set last_ok = excluded.last_ok,
          details = excluded.details;
  else
    insert into public.health_flags (key, last_ok, details)
    values ('reply_classifier', now(), 'OK')
    on conflict (key) do update
      set last_ok = excluded.last_ok,
          details = excluded.details;
  end if;
end;
$$;

select
  cron.schedule(
    'health_reply_classifier',
    '*/30 * * * *',
    $$select public.fn_health_classifier();$$
  )
on conflict do nothing;

-- Block 3: Feature flag + rate guard

create table if not exists public.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.feature_flags (key, enabled)
values ('reply_classifier_enabled', true)
on conflict (key) do update
  set enabled = excluded.enabled,
      updated_at = now();

create table if not exists public.rate_counters (
  bucket text primary key,
  count int not null default 0,
  updated_at timestamptz not null default now()
);

create or replace function public.fn_rate_guard_reply_classifier(max_per_min int default 120)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  b text := 'reply_classifier:' || to_char(now(), 'YYYYMMDDHH24MI');
  c int;
begin
  insert into public.rate_counters (bucket, count)
  values (b, 0)
  on conflict (bucket) do update
    set updated_at = now();

  update public.rate_counters
  set count = count + 1,
      updated_at = now()
  where bucket = b
  returning count into c;

  return c <= max_per_min;
end;
$$;

create or replace function public.fn_queue_reply_classify(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  base_url text;
  full_url text;
begin
  -- rate cap
  if not public.fn_rate_guard_reply_classifier(240) then
    return;
  end if;

  select value into base_url
  from public.app_settings
  where key = 'functions_base_url';

  if base_url is null or length(trim(base_url)) = 0 then
    raise exception 'app_settings.functions_base_url not configured';
  end if;

  full_url := base_url || '/ai-reply-classifier';

  perform net.http_post(
    url := full_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('message_id', p_message_id)::text
  );
end;
$$;

create or replace function public.trg_after_inbound_queue_classifier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  on_flag boolean;
begin
  if new.direction <> 'inbound' then
    return new;
  end if;

  select enabled
  into on_flag
  from public.feature_flags
  where key = 'reply_classifier_enabled';

  if coalesce(on_flag, false) then
    perform public.fn_queue_reply_classify(new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_inbound_queue_classifier on public.normalized_messages;

create trigger trg_inbound_queue_classifier
after insert on public.normalized_messages
for each row execute function public.trg_after_inbound_queue_classifier();



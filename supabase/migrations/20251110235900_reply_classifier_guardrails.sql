create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings(key, value)
values ('functions_base_url','https://<YOUR-REF>.functions.supabase.co')
on conflict (key) do update
set value = excluded.value,
    updated_at = now();

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
  select value into base_url
  from public.app_settings
  where key = 'functions_base_url';

  if base_url is null or length(trim(base_url)) = 0 then
    raise exception 'app_settings.functions_base_url not configured';
  end if;

  full_url := base_url || '/ai-reply-classifier';

  perform net.http_post(
    url := full_url,
    headers := jsonb_build_object('Content-Type','application/json'),
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
begin
  if new.direction = 'inbound' then
    perform public.fn_queue_reply_classify(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_inbound_queue_classifier on public.normalized_messages;

create trigger trg_inbound_queue_classifier
after insert on public.normalized_messages
for each row execute function public.trg_after_inbound_queue_classifier();

create or replace function public.fn_can_send(p_thread_id uuid)
returns boolean
language sql
stable
as $$
  with t as (
    select snoozed_until
    from public.inbox_threads
    where id = p_thread_id
  ),
  ooo as (
    select exists(
      select 1
      from public.out_of_office_logs
      where thread_id = p_thread_id
        and active = true
    ) as has_active_ooo
  )
  select case
    when (select snoozed_until from t) is not null
         and (select snoozed_until from t) > now()
      then false
    when (select has_active_ooo from ooo) = true
      then false
    else true
  end;
$$;

create or replace view public.v_send_queue_guarded as
select q.*
from public.send_queue q
join public.inbox_threads t on t.id = q.thread_id
left join public.leads l on l.id = q.lead_id
where q.thread_id is not null
  and public.fn_can_send(q.thread_id)
  and not exists (
    select 1
    from public.domain_suppressions ds
    where ds.account_id = q.account_id
      and ds.domain = lower(coalesce(split_part(l.email, '@', 2), split_part(q.to_email, '@', 2)))
      and ds.until > now()
  );

create or replace function public.fn_resume_from_ooo()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.out_of_office_logs
  set active = false
  where active = true
    and resume_after is not null
    and resume_after <= now();

  update public.inbox_threads
  set snoozed_until = null
  where snoozed_until is not null
    and snoozed_until <= now();
end;
$$;

insert into cron.job (job_name, schedule, command)
values (
  'smartsend_resume_from_ooo',
  '10 * * * *',
  $$select public.fn_resume_from_ooo();$$
)
on conflict (job_name) do update
set schedule = excluded.schedule,
    command = excluded.command;

create or replace function public.fn_send_email_guarded(p_thread_id uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.fn_can_send(p_thread_id) then
    raise exception 'Thread is paused (OOO or snoozed); send blocked';
  end if;

  -- TODO: call your existing send logic here.
  -- perform public.fn_send_email(p_thread_id, p_payload);
end;
$$;



-- Ensure schedule follow-up tasks and automation on positive replies

-- Helper: ensure a single open 'schedule' task per thread
create or replace function public.ensure_schedule_task(p_thread uuid, p_campaign uuid)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  select id
  into v_id
  from public.followup_tasks
  where thread_id = p_thread
    and kind = 'schedule'
    and status = 'open'
  limit 1;

  if v_id is null then
    insert into public.followup_tasks (campaign_id, thread_id, kind, status, note)
    values (p_campaign, p_thread, 'schedule', 'open', 'auto-created on positive')
    returning id into v_id;
  end if;

  return v_id;
end;
$$;


-- Trigger: create/open schedule task when reply_type flips to positive
create or replace function public.route_on_positive()
returns trigger
language plpgsql
as $$
begin
  if new.reply_type = 'positive' and coalesce(old.reply_type, '') <> 'positive' then
    perform public.ensure_schedule_task(new.id, new.campaign_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_route_on_positive on public.inbox_threads;
create trigger trg_route_on_positive
after update of reply_type on public.inbox_threads
for each row
execute function public.route_on_positive();


-- Helper to fetch the configured edge function base URL
create or replace function public.edge_base_url()
returns text
language sql
stable
as $$
  select nullif(
    coalesce(
      current_setting('app.settings.edge_base_url', true),
      current_setting('app.settings.edge_base', true)
    ),
    ''
  )
$$;


-- Optional automation: call draft-schedule edge function on positive replies
create or replace function public.call_draft_schedule()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base text := public.edge_base_url();
  v_auth text := current_setting('app.settings.service_role_key', true);
begin
  if new.reply_type = 'positive' and coalesce(old.reply_type, '') <> 'positive' then
    if coalesce(v_base, '') = '' or coalesce(v_auth, '') = '' then
      return new;
    end if;

    perform net.http_post(
      url := v_base || '/draft-schedule',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_auth
      ),
      body := jsonb_build_object('thread_id', new.id)::text,
      timeout_milliseconds := 8000
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_call_draft_schedule on public.inbox_threads;
create trigger trg_call_draft_schedule
after update of reply_type on public.inbox_threads
for each row
execute function public.call_draft_schedule();









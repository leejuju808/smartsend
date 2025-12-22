-- Usage tracking schema and helper objects

-- A) Core usage events (one per billable action)
create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.connected_accounts(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  event_type text not null check (event_type in ('send','open','click','reply')),
  quantity int not null default 1,
  meta jsonb default '{}'::jsonb
);

create index if not exists idx_usage_user_created on public.usage_events(user_id, created_at desc);
create index if not exists idx_usage_type_created on public.usage_events(event_type, created_at desc);

-- B) Helper RPC to record usage from queue or send_logs
create or replace function public.record_usage(
  p_user uuid,
  p_account uuid,
  p_campaign uuid,
  p_event text,
  p_qty int default 1,
  p_meta jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.usage_events(user_id, account_id, campaign_id, event_type, quantity, meta)
  values (p_user, p_account, p_campaign, p_event, p_qty, coalesce(p_meta, '{}'::jsonb));
end;
$$;

grant execute on function public.record_usage(uuid, uuid, uuid, text, int, jsonb) to authenticated, service_role;

-- C) Lightweight view: monthly usage summary
create or replace view public.v_usage_monthly as
select
  user_id,
  date_trunc('month', created_at) as month,
  event_type,
  sum(quantity) as qty
from public.usage_events
group by 1, 2, 3;

comment on view public.v_usage_monthly is 'Aggregated usage events by user, month, and event type for metered billing dashboards.';

-- D) Trigger to automatically record send usage from send_logs
create or replace function public._usage_on_send()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  select user_id into v_user
  from public.campaigns c
  where c.id = NEW.campaign_id;

  if v_user is not null then
    perform public.record_usage(
      v_user,
      NEW.account_id,
      NEW.campaign_id,
      'send',
      1,
      jsonb_build_object('to', NEW.to_email, 'subject', NEW.subject_snapshot)
    );
  end if;

  return NEW;
end;
$$;

grant execute on function public._usage_on_send() to authenticated, service_role;

drop trigger if exists trg_usage_on_send on public.send_logs;
create trigger trg_usage_on_send
after insert on public.send_logs
for each row execute function public._usage_on_send();













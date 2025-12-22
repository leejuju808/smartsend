-- Block 78: Email send ledger, events, outcomes, and variant rollups

-- 1) Send ledger (one row per email actually queued/sent)
create table if not exists public.email_sends (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  preset_key text not null,
  variant_id uuid references public.nudge_variants(id) on delete set null,
  subject text,
  to_email text,
  status text not null default 'queued' check (status in ('queued','sent','failed')),
  meta jsonb not null default '{}'::jsonb
);

create index if not exists idx_email_sends_account on public.email_sends(account_id);
create index if not exists idx_email_sends_variant on public.email_sends(variant_id);
create index if not exists idx_email_sends_lead on public.email_sends(lead_id);

-- 2) Events: open/click/reply/bounce
do
$$
begin
  create type public.email_event_type as enum ('sent','open','click','reply','bounce');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.email_events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  send_id uuid not null references public.email_sends(id) on delete cascade,
  type public.email_event_type not null,
  url text,
  user_agent text,
  ip inet,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists idx_email_events_send on public.email_events(send_id);
create index if not exists idx_email_events_type on public.email_events(type);

-- 3) Per-send outcome cache (fast joins)
create table if not exists public.email_outcomes (
  send_id uuid primary key references public.email_sends(id) on delete cascade,
  first_open_at timestamptz,
  first_click_at timestamptz,
  first_reply_at timestamptz,
  bounced boolean not null default false
);

-- Maintain outcomes from events
create or replace function public.fn_apply_email_event()
returns trigger
language plpgsql
as
$$
begin
  insert into public.email_outcomes(send_id)
  values (new.send_id)
  on conflict (send_id) do nothing;

  if new.type = 'open'
     and (select first_open_at from public.email_outcomes where send_id = new.send_id) is null then
    update public.email_outcomes
    set first_open_at = new.created_at
    where send_id = new.send_id;
  elsif new.type = 'click'
     and (select first_click_at from public.email_outcomes where send_id = new.send_id) is null then
    update public.email_outcomes
    set first_click_at = new.created_at
    where send_id = new.send_id;
  elsif new.type = 'reply'
     and (select first_reply_at from public.email_outcomes where send_id = new.send_id) is null then
    update public.email_outcomes
    set first_reply_at = new.created_at
    where send_id = new.send_id;
  elsif new.type = 'bounce' then
    update public.email_outcomes
    set bounced = true
    where send_id = new.send_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_apply_email_event on public.email_events;
create trigger trg_apply_email_event
after insert on public.email_events
for each row
execute function public.fn_apply_email_event();

-- 4) Variant rollups (materialized for speed)
create materialized view if not exists public.mv_variant_stats as
select
  v.id as variant_id,
  p.key as preset_key,
  v.name as variant_name,
  v.weight,
  v.status,
  s.account_id,
  count(s.id) as sends,
  count(o.first_open_at) as opens,
  count(o.first_click_at) as clicks,
  count(o.first_reply_at) as replies,
  count(*) filter (where o.bounced) as bounces,
  round((count(o.first_open_at)::numeric / nullif(count(s.id), 0))::numeric, 4) as open_rate,
  round((count(o.first_click_at)::numeric / nullif(count(s.id), 0))::numeric, 4) as click_rate,
  round((count(o.first_reply_at)::numeric / nullif(count(s.id), 0))::numeric, 4) as reply_rate
from public.nudge_variants v
join public.nudge_presets p on p.id = v.preset_id
left join public.email_sends s on s.variant_id = v.id
left join public.email_outcomes o on o.send_id = s.id
where v.status = 'active' and p.status = 'active'
group by v.id, p.key, v.name, v.weight, v.status, s.account_id;

create unique index if not exists idx_mv_variant_stats_unique
  on public.mv_variant_stats(variant_id, account_id);
create index if not exists idx_mv_variant_stats_account
  on public.mv_variant_stats(account_id, preset_key);

-- 5) RLS (adjust to tenant model)
alter table public.email_sends enable row level security;
do
$$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'email_sends'
      and policyname = 'email_sends_isolation'
  ) then
    create policy email_sends_isolation
      on public.email_sends
      using (account_id = auth.uid());
  end if;
end
$$;

alter table public.email_events enable row level security;
do
$$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'email_events'
      and policyname = 'email_events_isolation'
  ) then
    create policy email_events_isolation
      on public.email_events
      using (account_id = auth.uid());
  end if;
end
$$;

alter table public.email_outcomes enable row level security;
do
$$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'email_outcomes'
      and policyname = 'email_outcomes_isolation'
  ) then
    create policy email_outcomes_isolation
      on public.email_outcomes
      using (
        exists (
          select 1
          from public.email_sends s
          where s.id = email_outcomes.send_id
            and s.account_id = auth.uid()
        )
      );
  end if;
end
$$;


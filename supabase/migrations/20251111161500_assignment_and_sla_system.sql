-- Assignment rules, SLA policies, timers, and supporting logic

-- Ensure helper to maintain updated_at exists
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- A) Assignment rules (priority order applies)
create table if not exists public.assignment_rules (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null,
  priority int not null default 100,
  scope text not null check (scope in ('campaign','domain','keyword','fallback')),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  match_value text,
  strategy text not null check (strategy in ('fixed','round_robin')),
  assignees uuid[] not null,
  active boolean not null default true
);

drop trigger if exists assignment_rules_set_updated_at on public.assignment_rules;
create trigger assignment_rules_set_updated_at
before update on public.assignment_rules
for each row
execute function public.set_updated_at();

create index if not exists idx_ar_account_priority on public.assignment_rules(account_id, priority);

-- B) Round-robin cursor per rule (atomic)
create table if not exists public.assignment_rr_cursors (
  rule_id uuid primary key references public.assignment_rules(id) on delete cascade,
  idx int not null default 0,
  updated_at timestamptz not null default now()
);

-- C) Assignment log (immutable)
create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  lead_id uuid references public.leads(id) on delete cascade,
  reply_event_id uuid references public.reply_events(id) on delete set null,
  assigned_to uuid not null references auth.users(id) on delete cascade,
  rule_id uuid references public.assignment_rules(id) on delete set null,
  reason text
);

create index if not exists idx_assignments_open on public.assignments(account_id, lead_id, created_at);

-- D) SLA policies per account (defaults)
create table if not exists public.sla_policies (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  first_response_minutes int not null default 120,
  reassign_minutes int not null default 480,
  remind_minutes int[] not null default '{60,120}',
  business_hours int[] not null default '{1,2,3,4,5}',
  start_hour int not null default 9,
  end_hour int not null default 17,
  tz text default 'UTC'
);

-- E) SLA timers (pending → reminded/reassigned/done)
create table if not exists public.sla_timers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  reply_event_id uuid references public.reply_events(id) on delete cascade,
  assigned_to uuid not null references auth.users(id) on delete cascade,
  due_at timestamptz not null,
  remind_plan int[] not null,
  reminded_at timestamptz[],
  reassign_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','responded','reassigned','canceled'))
);

create index if not exists idx_sla_due on public.sla_timers(account_id, status, due_at);
create index if not exists idx_sla_reassign on public.sla_timers(account_id, status, reassign_at);

-- F) Mark responded when an outbound message to that lead is sent
create or replace function public.sla_mark_responded()
returns trigger
language plpgsql
as $$
begin
  update public.sla_timers
     set status = 'responded'
   where lead_id = new.lead_id
     and status = 'pending';
  return new;
end $$;

drop trigger if exists trg_sla_responded on public.send_events;
create trigger trg_sla_responded
  after insert on public.send_events
  for each row
  when (new.kind = 'sent')
  execute function public.sla_mark_responded();

-- RLS configuration
alter table public.assignment_rules enable row level security;
alter table public.assignments enable row level security;
alter table public.sla_policies enable row level security;
alter table public.sla_timers enable row level security;

create policy if not exists "rules_rw_own" on public.assignment_rules for all
  using (account_id in (select account_id from public.team_members where user_id = auth.uid()))
  with check (account_id in (select account_id from public.team_members where user_id = auth.uid()));

create policy if not exists "assign_read_own" on public.assignments for select
  using (account_id in (select account_id from public.team_members where user_id = auth.uid()));

create policy if not exists "sla_rw_own" on public.sla_policies for all
  using (account_id in (select account_id from public.team_members where user_id = auth.uid()))
  with check (account_id in (select account_id from public.team_members where user_id = auth.uid()));

create policy if not exists "slatimer_rw_own" on public.sla_timers for all
  using (account_id in (select account_id from public.team_members where user_id = auth.uid()))
  with check (account_id in (select account_id from public.team_members where user_id = auth.uid()));

-- G) RPC — evaluate rules + assign (round-robin safe)
create or replace function public.auto_assign(
  p_account uuid,
  p_lead uuid,
  p_campaign uuid,
  p_reply_event uuid,
  p_lead_email text,
  p_excerpt text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  chosen uuid;
  dom text := case when position('@' in p_lead_email) > 0 then split_part(p_lead_email, '@', 2) else null end;
  rr_idx int;
  rr_len int;
begin
  for r in
    select *
      from public.assignment_rules
     where account_id = p_account
       and active
       and (
         (scope = 'campaign' and campaign_id = p_campaign) or
         (scope = 'domain' and dom is not null and lower(match_value) = lower(dom)) or
         (scope = 'keyword' and p_excerpt ilike ('%' || match_value || '%')) or
         (scope = 'fallback')
       )
     order by priority asc
  loop
    rr_len := array_length(r.assignees, 1);
    if coalesce(rr_len, 0) = 0 then
      continue;
    end if;

    if r.strategy = 'fixed' then
      chosen := r.assignees[1];
    else
      insert into public.assignment_rr_cursors(rule_id, idx)
      values (r.id, 0)
      on conflict (rule_id) do nothing;

      update public.assignment_rr_cursors
         set idx = (idx + 1) % greatest(rr_len, 1),
             updated_at = now()
       where rule_id = r.id
       returning idx into rr_idx;

      if rr_idx is null then
        select idx into rr_idx from public.assignment_rr_cursors where rule_id = r.id;
      end if;

      chosen := r.assignees[coalesce(rr_idx, 0) + 1];
    end if;

    exit when chosen is not null;
  end loop;

  if chosen is null then
    return null;
  end if;

  insert into public.assignments(account_id, campaign_id, lead_id, reply_event_id, assigned_to, rule_id, reason)
  values (p_account, p_campaign, p_lead, p_reply_event, chosen, r.id, r.scope)
  returning assigned_to into chosen;

  return chosen;
end $$;

grant execute on function public.auto_assign(uuid, uuid, uuid, uuid, text, text) to authenticated;

-- H) Cron — reminders & auto-reassign
create or replace function public.process_sla_timers(p_limit int default 200)
returns void
language plpgsql
as $$
declare
  r record;
  next_agent uuid;
  rr_idx int;
  rr_assignees uuid[];
  rr_len int;
begin
  -- A) Send reminders due
  for r in
    select *
      from public.sla_timers
     where status = 'pending'
       and due_at <= now()
       and remind_plan is not null
       and (
         array_length(remind_plan, 1) is null
         or reminded_at is null
         or array_length(reminded_at, 1) < array_length(remind_plan, 1)
       )
     order by due_at asc
     limit p_limit
  loop
    -- TODO: emit notification (webhook/in-app)
    update public.sla_timers
       set reminded_at = coalesce(reminded_at, '{}') || now()
     where id = r.id;
  end loop;

  -- B) Auto-reassign overdue
  for r in
    select st.*, assignment.rule_id
      from public.sla_timers st
      join lateral (
        select a.rule_id
          from public.assignments a
         where a.lead_id = st.lead_id
         order by a.created_at desc
         limit 1
      ) assignment on true
     where st.status = 'pending'
       and st.reassign_at <= now()
     limit p_limit
  loop
    select assignees into rr_assignees from public.assignment_rules where id = r.rule_id;
    rr_len := array_length(rr_assignees, 1);

    if rr_len is null or rr_len < 2 then
      update public.sla_timers
         set status = 'reassigned'
       where id = r.id;
      continue;
    end if;

    select idx into rr_idx from public.assignment_rr_cursors where rule_id = r.rule_id;
    if rr_idx is null then
      rr_idx := 0;
      insert into public.assignment_rr_cursors(rule_id, idx)
      values (r.rule_id, rr_idx)
      on conflict (rule_id) do nothing;
    end if;

    rr_idx := (rr_idx + 1) % rr_len;
    next_agent := rr_assignees[rr_idx + 1];

    update public.assignment_rr_cursors
       set idx = rr_idx,
           updated_at = now()
     where rule_id = r.rule_id;

    insert into public.assignments(account_id, campaign_id, lead_id, reply_event_id, assigned_to, rule_id, reason)
    values (r.account_id, null, r.lead_id, r.reply_event_id, next_agent, r.rule_id, 'auto_reassign_sla');

    update public.sla_timers
       set assigned_to = next_agent,
           due_at = now() + interval '60 minutes',
           reassign_at = now() + interval '240 minutes',
           status = 'pending',
           reminded_at = '{}'
     where id = r.id;
  end loop;
end;
$$;

do $$
begin
  perform cron.schedule('sla-processor', '*/5 * * * *', $$select public.process_sla_timers();$$);
exception
  when undefined_function then null;
  when invalid_schema_name then null;
  when unique_violation then null;
end;
$$;
*** End Patch


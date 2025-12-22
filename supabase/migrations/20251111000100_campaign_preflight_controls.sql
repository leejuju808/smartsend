-- Campaign send policies, warmup, suppression, and preflight infrastructure

-- A) Per-identity send limits / warmup state ---------------------------------
create table if not exists public.send_identities (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  account_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('gmail','outlook','smtp')),
  email text not null,
  daily_limit int not null default 150,
  warmup_enabled boolean not null default true,
  warmup_stage int not null default 1,
  warmup_max_stage int not null default 10,
  is_active boolean not null default true,
  unique (account_id, email)
);

create index if not exists idx_send_identities_account on public.send_identities(account_id);

create or replace function public.tg_send_identities_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_send_identities_updated_at'
      and tgrelid = 'public.send_identities'::regclass
  ) then
    create trigger set_send_identities_updated_at
      before update on public.send_identities
      for each row
      execute function public.tg_send_identities_updated_at();
  end if;
end
$$;

alter table public.send_identities enable row level security;

do $$
begin
  create policy if not exists send_identities_rw
    on public.send_identities
    for all
    using (account_id = auth.uid())
    with check (account_id = auth.uid());
exception
  when duplicate_object then null;
end
$$;


-- B) Account-level policy configuration --------------------------------------
create table if not exists public.send_policies (
  account_id uuid primary key references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now(),
  min_score int not null default 0,
  cooldown_days int not null default 7,
  quiet_hours_start int not null default 20,
  quiet_hours_end int not null default 7,
  max_daily_sends int not null default 400,
  hard_unsubscribe boolean not null default true,
  block_bounced boolean not null default true,
  tz_send_window jsonb not null default '{"start":9,"end":17}'::jsonb,
  allow_weekends boolean not null default false
);

create or replace function public.tg_send_policies_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_send_policies_updated_at'
      and tgrelid = 'public.send_policies'::regclass
  ) then
    create trigger set_send_policies_updated_at
      before update on public.send_policies
      for each row
      execute function public.tg_send_policies_updated_at();
  end if;
end
$$;

alter table public.send_policies enable row level security;

do $$
begin
  create policy if not exists send_policies_rw
    on public.send_policies
    for all
    using (account_id = auth.uid())
    with check (account_id = auth.uid());
exception
  when duplicate_object then null;
end
$$;


-- C) Global account-level suppression list -----------------------------------
create table if not exists public.account_suppressions (
  account_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  reason text not null default 'manual',
  created_at timestamptz not null default now(),
  primary key (account_id, email)
);

create index if not exists idx_account_suppressions_reason on public.account_suppressions(account_id, reason);

alter table public.account_suppressions enable row level security;

do $$
begin
  create policy if not exists account_suppressions_rw
    on public.account_suppressions
    for all
    using (account_id = auth.uid())
    with check (account_id = auth.uid());
exception
  when duplicate_object then null;
end
$$;


-- D) Preflight snapshot storage ----------------------------------------------
create table if not exists public.campaign_preflights (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  account_id uuid not null references auth.users(id) on delete cascade,
  eligible_count int not null default 0,
  blocked_count int not null default 0,
  identity_capacity int not null default 0,
  status text not null default 'ok' check (status in ('ok','warn','block'))
);

create index if not exists idx_campaign_preflights_campaign on public.campaign_preflights(campaign_id);

create table if not exists public.campaign_preflight_issues (
  preflight_id uuid not null references public.campaign_preflights(id) on delete cascade,
  kind text not null,
  message text not null,
  count int not null default 1
);

create index if not exists idx_preflight_issues on public.campaign_preflight_issues(preflight_id);


-- E) Helper views ------------------------------------------------------------
create or replace view public.v_lead_last_contact as
select
  a.lead_id,
  max(a.created_at) as last_contact_at
from public.activities a
where a.kind in ('email_sent','reply_detected')
group by a.lead_id;

create or replace view public.v_leads_send_guard as
select
  l.id as lead_id,
  l.account_id,
  lower(split_part(l.email, '@', 2)) as domain,
  l.email,
  coalesce(ls.score, 0) as score,
  sup.reason as suppression_reason,
  lc.last_contact_at
from public.leads l
left join public.lead_scores ls on ls.lead_id = l.id
left join public.account_suppressions sup
  on sup.account_id = l.account_id
 and sup.email = l.email
left join public.v_lead_last_contact lc on lc.lead_id = l.id;


-- F) Warmup helper -----------------------------------------------------------
create or replace function public.advance_warmup_if_healthy(
  p_account_id uuid,
  p_date date default current_date - 1
)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_advanced int := 0;
begin
  update public.send_identities i
  set warmup_stage = least(i.warmup_stage + 1, i.warmup_max_stage),
      updated_at = now()
  where i.account_id = p_account_id
    and i.warmup_enabled
    and (
      select coalesce(avg(case when m.metric = 'bounce_rate' then m.value end), 0)
      from public.daily_mail_metrics m
      where m.identity_id = i.id
        and m.day = p_date
    ) < 0.03
    and (
      select coalesce(avg(case when m.metric = 'complaint_rate' then m.value end), 0)
      from public.daily_mail_metrics m
      where m.identity_id = i.id
        and m.day = p_date
    ) < 0.001;

  get diagnostics v_advanced = row_count;
  return v_advanced;
end;
$$;


-- G) Campaign preflight RPC --------------------------------------------------
create or replace function public.run_campaign_preflight(
  p_campaign_id uuid,
  p_now timestamptz default now()
)
returns table(
  eligible int,
  blocked int,
  identity_capacity int,
  status text,
  issues jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_account uuid;
  v_segment_id uuid;
  v_campaign_min_score int := 0;
  v_policy_min_score int := 0;
  v_policy_cooldown_days int := 7;
  v_policy_quiet_start int := 20;
  v_policy_quiet_end int := 7;
  v_policy_allow_weekends boolean := false;
  v_policy_acc_cap int := 400;
  v_policy_hard_unsubscribe boolean := true;
  v_policy_exists boolean := false;
  v_cooldown interval;
  v_id_capacity int := 0;
  v_total_targets int := 0;
  v_blocked_suppression int := 0;
  v_blocked_low_score int := 0;
  v_blocked_cooldown int := 0;
  v_in_quiet_hours boolean := false;
  v_is_weekend_block boolean := false;
  v_preflight_id uuid;
begin
  select account_id, segment_id, coalesce(min_score, 0)
  into v_account, v_segment_id, v_campaign_min_score
  from public.campaigns
  where id = p_campaign_id;

  if v_account is null then
    raise exception 'campaign not found';
  end if;

  select
    coalesce(min_score, v_policy_min_score),
    coalesce(cooldown_days, v_policy_cooldown_days),
    coalesce(quiet_hours_start, v_policy_quiet_start),
    coalesce(quiet_hours_end, v_policy_quiet_end),
    coalesce(max_daily_sends, v_policy_acc_cap),
    coalesce(hard_unsubscribe, v_policy_hard_unsubscribe),
    coalesce(allow_weekends, v_policy_allow_weekends),
    true
  into
    v_policy_min_score,
    v_policy_cooldown_days,
    v_policy_quiet_start,
    v_policy_quiet_end,
    v_policy_acc_cap,
    v_policy_hard_unsubscribe,
    v_policy_allow_weekends,
    v_policy_exists
  from public.send_policies
  where account_id = v_account;

  v_cooldown := make_interval(days => coalesce(v_policy_cooldown_days, 7));

  with caps as (
    select
      case
        when warmup_enabled and warmup_max_stage > 0 then
          least(
            daily_limit,
            greatest(
              1,
              ceiling(daily_limit * (warmup_stage::numeric / warmup_max_stage))
            )::int
          )
        else
          daily_limit
      end as cap
    from public.send_identities
    where account_id = v_account
      and is_active = true
  )
  select coalesce(sum(cap), 0)::int into v_id_capacity from caps;

  with base as (
    select
      t.lead_id,
      g.email,
      g.score,
      g.suppression_reason,
      g.last_contact_at
    from public.campaign_targets t
    join public.v_leads_send_guard g on g.lead_id = t.lead_id
    where t.campaign_id = p_campaign_id
  ),
  eval as (
    select
      *,
      (v_policy_hard_unsubscribe and suppression_reason is not null) as blocked_suppression,
      (score < greatest(v_campaign_min_score, coalesce(v_policy_min_score, 0))) as blocked_low_score,
      (last_contact_at is not null and (p_now - last_contact_at) <= coalesce(v_cooldown, make_interval(days => 7))) as blocked_cooldown
    from base
  ),
  agg as (
    select
      count(*) as total_count,
      count(*) filter (where blocked_suppression) as suppression_count,
      count(*) filter (where blocked_low_score) as low_score_count,
      count(*) filter (where blocked_cooldown) as cooldown_count
    from eval
  ),
  eligible_cte as (
    select count(*) as eligible_count
    from eval
    where not (blocked_suppression or blocked_low_score or blocked_cooldown)
  )
  select
    coalesce(agg.total_count, 0),
    coalesce(agg.suppression_count, 0),
    coalesce(agg.low_score_count, 0),
    coalesce(agg.cooldown_count, 0),
    coalesce(eligible_cte.eligible_count, 0)
  into
    v_total_targets,
    v_blocked_suppression,
    v_blocked_low_score,
    v_blocked_cooldown,
    eligible
  from agg, eligible_cte;

  blocked := greatest(v_total_targets - coalesce(eligible, 0), 0);

  v_is_weekend_block := (extract(isodow from p_now) in (6, 7)) and not coalesce(v_policy_allow_weekends, false);
  v_in_quiet_hours :=
    (extract(hour from p_now)::int >= coalesce(v_policy_quiet_start, 20))
    or (extract(hour from p_now)::int < coalesce(v_policy_quiet_end, 7));

  identity_capacity := least(coalesce(v_policy_acc_cap, 400), coalesce(v_id_capacity, 0));
  issues := '[]'::jsonb;

  if v_total_targets = 0 then
    issues := issues || jsonb_build_array(
      jsonb_build_object(
        'kind', 'no_segment',
        'message', 'No leads are attached to this campaign segment.',
        'count', 0
      )
    );
  end if;

  if v_blocked_suppression > 0 then
    issues := issues || jsonb_build_array(
      jsonb_build_object(
        'kind', 'suppressed',
        'message', 'Suppression rules block some leads.',
        'count', v_blocked_suppression
      )
    );
  end if;

  if v_blocked_low_score > 0 then
    issues := issues || jsonb_build_array(
      jsonb_build_object(
        'kind', 'low_score',
        'message', format('Leads below minimum score (%s).', greatest(v_campaign_min_score, coalesce(v_policy_min_score, 0))),
        'count', v_blocked_low_score
      )
    );
  end if;

  if v_blocked_cooldown > 0 then
    issues := issues || jsonb_build_array(
      jsonb_build_object(
        'kind', 'cooldown',
        'message', format('Cooldown of %s day(s) blocking recent contacts.', coalesce(v_policy_cooldown_days, 7)),
        'count', v_blocked_cooldown
      )
    );
  end if;

  if identity_capacity <= 0 then
    issues := issues || jsonb_build_array(
      jsonb_build_object(
        'kind', 'no_identity',
        'message', 'No active identities with available capacity.',
        'count', 0
      )
    );
  elsif coalesce(eligible, 0) > identity_capacity then
    issues := issues || jsonb_build_array(
      jsonb_build_object(
        'kind', 'no_capacity',
        'message', 'Eligible leads exceed today''s sending capacity.',
        'count', coalesce(eligible, 0) - identity_capacity
      )
    );
  end if;

  if v_is_weekend_block then
    issues := issues || jsonb_build_array(
      jsonb_build_object(
        'kind', 'quiet_hours',
        'message', 'Weekend sending disabled by policy.',
        'count', coalesce(eligible, 0)
      )
    );
  elsif v_in_quiet_hours then
    issues := issues || jsonb_build_array(
      jsonb_build_object(
        'kind', 'quiet_hours',
        'message', format('Quiet hours %s-%s in effect; schedule the send later.', coalesce(v_policy_quiet_start, 20), coalesce(v_policy_quiet_end, 7)),
        'count', coalesce(eligible, 0)
      )
    );
  end if;

  if identity_capacity <= 0 or coalesce(eligible, 0) = 0 or v_total_targets = 0 then
    status := 'block';
  elsif coalesce(eligible, 0) > identity_capacity or v_in_quiet_hours or v_is_weekend_block then
    status := 'warn';
  else
    status := 'ok';
  end if;

  insert into public.campaign_preflights (
    campaign_id,
    account_id,
    eligible_count,
    blocked_count,
    identity_capacity,
    status
  )
  values (
    p_campaign_id,
    v_account,
    coalesce(eligible, 0),
    blocked,
    identity_capacity,
    status
  )
  returning id into v_preflight_id;

  perform
    1
  from jsonb_array_elements(issues) as j;

  if found then
    insert into public.campaign_preflight_issues(preflight_id, kind, message, count)
    select
      v_preflight_id,
      elem->>'kind',
      elem->>'message',
      coalesce((elem->>'count')::int, 0)
    from jsonb_array_elements(issues) as elem;
  end if;

  return query
  select
    coalesce(eligible, 0),
    blocked,
    identity_capacity,
    status,
    issues;
end;
$$;


-- H) Convenience seed helper -------------------------------------------------
create or replace function public.ensure_send_policy(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.send_policies(account_id)
  values (p_account_id)
  on conflict (account_id) do nothing;
end;
$$;



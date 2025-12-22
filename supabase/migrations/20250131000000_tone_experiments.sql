-- Tone Experiments A/B Testing System
-- Creates experiment registry, assignments, metrics view, and updates scheduled_messages

-- 1) Experiment registry
create table if not exists public.tone_experiments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,                         -- e.g., "ToneLearner-v1"
  step_number int not null,
  scope text not null default 'segment' check (scope in ('global','segment')),
  status text not null default 'running' check (status in ('draft','running','paused','completed')),
  ramp_percent int not null default 10,       -- % of eligible traffic in treatment
  min_sample int not null default 500,        -- per arm before evaluate
  promote_threshold numeric not null default 0.05,  -- minimum absolute lift in primary metric
  primary_metric text not null default 'meeting_share'  -- 'open_rate'|'positive_share'|'meeting_share'
);

create index if not exists ix_tone_exp_campaign_step on public.tone_experiments(campaign_id, step_number);

-- 2) Deterministic assignments (logged)
create table if not exists public.tone_experiment_assignments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  experiment_id uuid not null references public.tone_experiments(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  step_number int not null,
  arm text not null check (arm in ('control','treatment')), -- control=baseline tone rules; treatment=Day18–22 learner
  segment text,
  unique (experiment_id, contact_id, step_number)
);

create index if not exists ix_assign_exp_arm on public.tone_experiment_assignments(experiment_id, arm);
create index if not exists ix_assign_campaign_contact_step on public.tone_experiment_assignments(campaign_id, contact_id, step_number);

-- 3) Per-arm rollup (view over message_outcomes + assignments)
create or replace view public.tone_experiment_perf_30d as
select
  tea.experiment_id,
  tea.arm,
  mo.campaign_id,
  mo.step_number,
  count(*) as sends,
  count(mo.opened_at) as opens,
  count(mo.replied_at) as replies,
  sum(case when mo.positive_reply then 1 else 0 end) as positives,
  sum(case when mo.meeting_intent then 1 else 0 end) as meetings,
  (count(mo.opened_at)::float / nullif(count(*),0)) as open_rate,
  (count(mo.replied_at)::float / nullif(count(mo.opened_at),0)) as reply_rate_on_open,
  (sum(case when mo.positive_reply then 1 else 0 end)::float / nullif(count(mo.replied_at),0)) as positive_share,
  (sum(case when mo.meeting_intent then 1 else 0 end)::float / nullif(count(mo.replied_at),0)) as meeting_share
from public.message_outcomes mo
join public.tone_experiment_assignments tea
  on tea.campaign_id = mo.campaign_id
 and tea.contact_id = mo.contact_id
 and tea.step_number = mo.step_number
where mo.sent_at >= now() - interval '30 days'
group by 1,2,3,4;

-- 4) Update scheduled_messages to track experiment assignment
alter table public.scheduled_messages
  add column if not exists experiment_arm text check (experiment_arm in ('control','treatment')),
  add column if not exists experiment_id uuid references public.tone_experiments(id) on delete set null;

create index if not exists ix_scheduled_messages_experiment on public.scheduled_messages(experiment_id, experiment_arm);

-- RLS policies
alter table public.tone_experiments enable row level security;
alter table public.tone_experiment_assignments enable row level security;

do $$
begin
  create policy tone_experiments_select on public.tone_experiments
    for select
    using (
      exists (
        select 1
        from public.campaigns c
        where c.id = tone_experiments.campaign_id
          and public.is_account_member(auth.uid(), c.account_id)
      )
    );

  create policy tone_experiments_insert on public.tone_experiments
    for insert
    with check (
      exists (
        select 1
        from public.campaigns c
        where c.id = tone_experiments.campaign_id
          and public.is_account_member(auth.uid(), c.account_id)
      )
    );

  create policy tone_experiments_update on public.tone_experiments
    for update
    using (
      exists (
        select 1
        from public.campaigns c
        where c.id = tone_experiments.campaign_id
          and public.is_account_member(auth.uid(), c.account_id)
      )
    )
    with check (
      exists (
        select 1
        from public.campaigns c
        where c.id = tone_experiments.campaign_id
          and public.is_account_member(auth.uid(), c.account_id)
      )
    );

  create policy tone_experiment_assignments_select on public.tone_experiment_assignments
    for select
    using (
      exists (
        select 1
        from public.campaigns c
        where c.id = tone_experiment_assignments.campaign_id
          and public.is_account_member(auth.uid(), c.account_id)
      )
    );

  create policy tone_experiment_assignments_insert on public.tone_experiment_assignments
    for insert
    with check (
      exists (
        select 1
        from public.campaigns c
        where c.id = tone_experiment_assignments.campaign_id
          and public.is_account_member(auth.uid(), c.account_id)
      )
    );

  -- Service role can insert/update assignments
  create policy tone_experiment_assignments_service_rw on public.tone_experiment_assignments
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');
exception
  when duplicate_object then null;
end
$$;


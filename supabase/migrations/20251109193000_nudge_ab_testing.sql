-- Nudge A/B testing schema: variants, assignments, outcomes, and analytics views

create table if not exists public.nudge_variants (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  scenario text not null,
  tone text not null,
  name text not null,
  subject text not null,
  body text not null,
  weight real not null default 1.0,
  is_active boolean not null default true,
  unique (campaign_id, scenario, tone, name)
);

comment on column public.nudge_variants.scenario is $$'no_reply','question','positive','neutral','routing',etc.$$;
comment on column public.nudge_variants.tone is $$'professional','friendly','concise','assertive',etc.$$;
comment on column public.nudge_variants.body is 'Supports tokens: {lead_first} {company} {me} {duration} {booking_link} {last_msg} {cta}';

create index if not exists idx_nudge_variants_campaign on public.nudge_variants (campaign_id);
create index if not exists idx_nudge_variants_active on public.nudge_variants (is_active);

create table if not exists public.nudge_assignments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  send_queue_id uuid references public.send_queue(id) on delete set null,
  variant_id uuid not null references public.nudge_variants(id) on delete restrict,
  scenario text not null,
  tone text not null
);

create index if not exists idx_nudge_assign_thread on public.nudge_assignments (thread_id);
create index if not exists idx_nudge_assign_variant on public.nudge_assignments (variant_id);

create table if not exists public.nudge_outcomes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  assignment_id uuid not null references public.nudge_assignments(id) on delete cascade,
  inbound_message_id uuid not null references public.normalized_messages(id) on delete cascade,
  label text not null,
  minutes_to_outcome int not null
);

create index if not exists idx_nudge_outcomes_assignment on public.nudge_outcomes (assignment_id);

create or replace view public.v_nudge_variant_stats as
select
  v.campaign_id,
  v.id as variant_id,
  v.scenario,
  v.tone,
  v.name,
  v.weight,
  count(a.id) as nudges_sent,
  coalesce(sum((o.label in ('human_reply','positive','question'))::int), 0) as good_outcomes,
  coalesce(sum((o.label in ('negative','unsubscribe'))::int), 0) as bad_outcomes,
  round(
    100.0 * nullif(coalesce(sum((o.label in ('human_reply','positive','question'))::int), 0), 0)
      / nullif(count(a.id), 0),
    1
  ) as good_rate_pct,
  percentile_disc(0.5) within group (order by o.minutes_to_outcome) as p50_minutes_to_outcome
from public.nudge_variants v
left join public.nudge_assignments a on a.variant_id = v.id
left join public.nudge_outcomes o on o.assignment_id = a.id
group by v.campaign_id, v.id, v.scenario, v.tone, v.name, v.weight;

create or replace view public.v_nudge_campaign_stats as
select
  campaign_id,
  scenario,
  sum(nudges_sent) as nudges_sent,
  sum(good_outcomes) as good_outcomes,
  round(
    100.0 * nullif(sum(good_outcomes), 0) / nullif(sum(nudges_sent), 0),
    1
  ) as good_rate_pct
from public.v_nudge_variant_stats
group by campaign_id, scenario;


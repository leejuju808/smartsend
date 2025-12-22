-- Block 313 — Sequence Variant A/B Testing v1
-- Multiple templates per step • weighted split • per-variant stats

-- a) sequence_step_variants table
create table if not exists public.sequence_step_variants (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sequence_id uuid not null references public.sequences(id) on delete cascade,
  step_id uuid not null references public.sequence_steps(id) on delete cascade,

  name text not null,              -- e.g. "Control", "Variant B"
  subject text,
  body text,

  weight integer not null default 100, -- relative weight, will be normalized
  is_default boolean not null default false,

  created_at timestamptz default now()
);

create index if not exists idx_sequence_step_variants_workspace on public.sequence_step_variants (workspace_id);
create index if not exists idx_sequence_step_variants_sequence on public.sequence_step_variants (sequence_id);
create index if not exists idx_sequence_step_variants_step on public.sequence_step_variants (step_id);

-- b) Link variant in send_logs (if column doesn't exist, add it)
alter table public.send_logs
  add column if not exists variant_id uuid references public.sequence_step_variants(id) on delete set null;

create index if not exists send_logs_variant_id_idx on public.send_logs (variant_id);

-- c) Per-variant stats view
-- Adapts to actual schema: email_events, email_replies, lead_meetings
create or replace view public.sequence_variant_stats as
select
  v.id as variant_id,
  v.workspace_id,
  v.sequence_id,
  v.step_id,
  v.name as variant_name,

  coalesce(count(distinct s.id), 0) as sent_count,

  coalesce(
    (
      select count(distinct s2.lead_id)
      from public.send_logs s2
      join public.email_events e on e.campaign_id = s2.campaign_id
        and e.lead_id = s2.lead_id
      where s2.variant_id = v.id
        and e.event_type = 'open'
    ),
    0
  ) as open_count,

  coalesce(
    (
      select count(distinct s2.lead_id)
      from public.send_logs s2
      join public.email_events e on e.campaign_id = s2.campaign_id
        and e.lead_id = s2.lead_id
      where s2.variant_id = v.id
        and e.event_type = 'click'
    ),
    0
  ) as click_count,

  coalesce(
    (
      select count(distinct s2.lead_id)
      from public.send_logs s2
      join public.email_replies r on r.campaign_id = s2.campaign_id
        and r.lead_id = s2.lead_id
      where s2.variant_id = v.id
    ),
    0
  ) as reply_count,

  coalesce(
    (
      select count(distinct s2.lead_id)
      from public.send_logs s2
      join public.lead_meetings m on m.campaign_id = s2.campaign_id
        and m.lead_id = s2.lead_id
      where s2.variant_id = v.id
    ),
    0
  ) as meeting_count,

  case when count(distinct s.id) > 0 
    then round(100.0 * (
      select count(distinct s2.lead_id)
      from public.send_logs s2
      join public.email_events e on e.campaign_id = s2.campaign_id
        and e.lead_id = s2.lead_id
      where s2.variant_id = v.id
        and e.event_type = 'open'
    )::numeric / count(distinct s.id), 2) 
    else 0 end as open_rate,

  case when count(distinct s.id) > 0 
    then round(100.0 * (
      select count(distinct s2.lead_id)
      from public.send_logs s2
      join public.email_events e on e.campaign_id = s2.campaign_id
        and e.lead_id = s2.lead_id
      where s2.variant_id = v.id
        and e.event_type = 'click'
    )::numeric / count(distinct s.id), 2) 
    else 0 end as click_rate,

  case when count(distinct s.id) > 0 
    then round(100.0 * (
      select count(distinct s2.lead_id)
      from public.send_logs s2
      join public.email_replies r on r.campaign_id = s2.campaign_id
        and r.lead_id = s2.lead_id
      where s2.variant_id = v.id
    )::numeric / count(distinct s.id), 2) 
    else 0 end as reply_rate,

  case when count(distinct s.id) > 0 
    then round(100.0 * (
      select count(distinct s2.lead_id)
      from public.send_logs s2
      join public.lead_meetings m on m.campaign_id = s2.campaign_id
        and m.lead_id = s2.lead_id
      where s2.variant_id = v.id
    )::numeric / count(distinct s.id), 2) 
    else 0 end as meeting_rate

from public.sequence_step_variants v
left join public.send_logs s on s.variant_id = v.id
group by v.id, v.workspace_id, v.sequence_id, v.step_id, v.name;

-- Enable RLS
alter table public.sequence_step_variants enable row level security;

-- RLS Policies: Users can manage variants for their workspace
create policy "users variants select" on public.sequence_step_variants 
  for select to authenticated using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = sequence_step_variants.workspace_id
      and wm.user_id = auth.uid()
    )
  );

create policy "users variants write" on public.sequence_step_variants 
  for all to authenticated using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = sequence_step_variants.workspace_id
      and wm.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = sequence_step_variants.workspace_id
      and wm.user_id = auth.uid()
    )
  );

-- Grant access to stats view
grant select on public.sequence_variant_stats to authenticated;

-- d) SQL function to pick a variant for a step (weighted random)
create or replace function public.pick_step_variant(
  p_step uuid
) returns uuid
language plpgsql
as $$
declare
  v_variant_id uuid;
  v_total_weight integer;
  v_random numeric;
  v_acc integer := 0;
begin
  -- Get all variants for this step with normalized weights
  -- Use weighted random selection
  select id into v_variant_id
  from (
    select 
      id,
      weight,
      sum(weight) over () as total_weight,
      sum(weight) over (order by created_at rows between unbounded preceding and current row) as cumulative_weight
    from public.sequence_step_variants
    where step_id = p_step
      and weight > 0
  ) weighted
  where cumulative_weight >= (
    select floor(random() * coalesce(total_weight, 1)) + 1
    from (select sum(weight) as total_weight from public.sequence_step_variants where step_id = p_step and weight > 0) t
  )
  order by cumulative_weight
  limit 1;

  return v_variant_id;
end;
$$;


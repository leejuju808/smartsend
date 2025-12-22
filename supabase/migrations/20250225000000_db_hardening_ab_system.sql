-- DB Hardening + A/B System Improvements
-- A) Ensure campaign_steps has the uniqueness we need
do $$ begin
  if not exists (select 1 from pg_constraint where conname='uq_campaign_steps_campaign_stepno') then
    alter table public.campaign_steps
      add constraint uq_campaign_steps_campaign_stepno unique (campaign_id, step_no);
  end if;
end $$;

-- B) Link variants to the parent step (composite FK)
do $$ begin
  if not exists (select 1 from pg_constraint where conname='fk_csv_parent_step') then
    alter table public.campaign_step_variants
      add constraint fk_csv_parent_step
      foreign key (campaign_id, step_no)
      references public.campaign_steps(campaign_id, step_no)
      on delete cascade;
  end if;
end $$;

-- C) Send logs safety columns (only if missing)
alter table public.send_logs
  add column if not exists step_no int,
  add column if not exists status text default 'sent' check (status in ('queued','sent','failed','bounced','blocked')),
  add column if not exists subject text,
  add column if not exists body_html text;

create index if not exists idx_send_logs_camp_step on public.send_logs(campaign_id, step_no);

-- D) Tracking events table (if you haven't created yet)
create table if not exists public.tracking_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  send_log_id uuid references public.send_logs(id) on delete cascade,
  type text not null check (type in ('open','click')),
  url text
);
create index if not exists idx_te_by_send on public.tracking_events(send_log_id, type);

-- E) Row Level Security (multi-tenant)
-- Assumes campaigns has user_id owner and you already have a policy pattern.
alter table public.campaign_step_variants enable row level security;

-- View to resolve owner for a variant
create or replace view public.v_csv_with_owner as
select v.*, c.user_id
from public.campaign_step_variants v
join public.campaigns c on c.id = v.campaign_id;

-- Policies: owner can CRUD
drop policy if exists csv_owner_read on public.campaign_step_variants;
create policy csv_owner_read on public.campaign_step_variants
for select using (exists (
  select 1 from public.v_csv_with_owner x
  where x.id = campaign_step_variants.id
    and x.user_id = auth.uid()
));

drop policy if exists csv_owner_write on public.campaign_step_variants;
create policy csv_owner_write on public.campaign_step_variants
for all using (exists (
  select 1 from public.v_csv_with_owner x
  where x.id = campaign_step_variants.id
    and x.user_id = auth.uid()
))
with check (exists (
  select 1 from public.campaigns c
  where c.id = campaign_step_variants.campaign_id
    and c.user_id = auth.uid()
));

-- Optional: helper to upsert a variant (keeps weights sane)
create or replace function public.upsert_step_variant(
  p_campaign uuid,
  p_step int,
  p_name text,
  p_weight numeric,
  p_subject text,
  p_body text,
  p_enabled boolean default true
) returns uuid
language plpgsql
security definer
as $$
declare
  v_id uuid;
begin
  insert into public.campaign_step_variants(campaign_id, step_no, name, weight, subject_template, body_html_template, enabled)
  values (p_campaign, p_step, p_name, greatest(0,least(1,p_weight)), p_subject, p_body, coalesce(p_enabled,true))
  on conflict (campaign_id, step_no, name)
  do update set
    weight = excluded.weight,
    subject_template = excluded.subject_template,
    body_html_template = excluded.body_html_template,
    enabled = excluded.enabled
  returning id into v_id;

  return v_id;
end $$;


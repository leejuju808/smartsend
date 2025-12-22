-- Step variants + metrics (idempotent)

-- A) Campaign steps metadata ---------------------------------------------------
create table if not exists public.campaign_steps (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null
);

create index if not exists idx_steps_campaign on public.campaign_steps(campaign_id);

-- B) Step variants -------------------------------------------------------------
create table if not exists public.step_variants (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  step_id uuid not null references public.campaign_steps(id) on delete cascade,
  name text not null,
  weight int not null default 1,
  subject text,
  body text not null,
  is_html boolean not null default false,
  active boolean not null default true
);

create index if not exists idx_variants_step on public.step_variants(step_id);

create or replace function public.tg_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_step_variants_touch on public.step_variants;
create trigger trg_step_variants_touch
before update on public.step_variants
for each row
execute function public.tg_touch_updated_at();

-- C) Attribution columns on queue / logs ---------------------------------------
alter table public.send_queue
  add column if not exists step_id uuid references public.campaign_steps(id) on delete set null,
  add column if not exists variant_id uuid references public.step_variants(id) on delete set null;

alter table public.send_logs
  add column if not exists step_id uuid references public.campaign_steps(id) on delete set null,
  add column if not exists variant_id uuid references public.step_variants(id) on delete set null;

-- D) KPI views -----------------------------------------------------------------
create or replace view public.v_variant_sends as
select
  q.id as queue_id,
  q.campaign_id,
  q.step_id,
  q.variant_id,
  q.lead_id,
  q.thread_id,
  q.status,
  q.queued_at
from public.send_queue q
where q.status in ('sent', 'queued', 'draft');

create or replace view public.v_variant_replies as
select
  s.variant_id,
  s.thread_id,
  count(*) as replies
from public.v_variant_sends s
join public.normalized_messages nm
  on nm.linked_thread_id = s.thread_id
 and nm.direction = 'inbound'
 and nm.sent_at >= s.queued_at
group by 1, 2;

create or replace view public.v_variant_metrics as
with base as (
  select
    v.id as variant_id,
    v.step_id,
    v.name,
    v.weight,
    v.active,
    count(*) filter (where s.status = 'sent') as sends
  from public.step_variants v
  left join public.v_variant_sends s
    on s.variant_id = v.id
   and s.status = 'sent'
  group by 1, 2, 3, 4, 5
),
r as (
  select
    variant_id,
    count(*) as replies
  from public.v_variant_replies
  group by 1
)
select
  b.variant_id,
  b.step_id,
  b.name,
  b.weight,
  b.active,
  b.sends,
  coalesce(r.replies, 0) as replies,
  case
    when b.sends > 0 then round(100.0 * coalesce(r.replies, 0) / b.sends, 2)
    else 0
  end as reply_rate
from base b
left join r on r.variant_id = b.variant_id;




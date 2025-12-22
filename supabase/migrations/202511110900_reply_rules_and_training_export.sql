set search_path = public;

-- A) Flattened view for analytics/exports
create or replace view public.v_reply_training_examples as
select
  e.id as example_id,
  e.created_at,
  e.label,
  coalesce(nullif(trim(e.subject), ''), '(no subject)') as subject,
  left(coalesce(e.text, ''), 8000) as text,
  e.headers
from public.reply_training_examples e;

-- B) Dynamic rules table (hotfixes without redeploying code)
create table if not exists public.reply_rules (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  scope text not null default 'global' check (scope in ('global', 'campaign')),
  campaign_id uuid references public.campaigns (id) on delete cascade,
  label text not null,
  kind text not null check (kind in ('subject_regex', 'text_regex', 'header_key', 'header_value_regex')),
  pattern text not null,
  weight real not null default 1.0,
  is_active boolean not null default true
);

create index if not exists idx_reply_rules_active on public.reply_rules (is_active, label, kind);

-- C) Touch updated_at automatically
create or replace function public.tg_touch_updated_at()
returns trigger
language plpgsql
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

drop trigger if exists trg_touch_reply_rules on public.reply_rules;
create trigger trg_touch_reply_rules
before update on public.reply_rules
for each row execute function public.tg_touch_updated_at();


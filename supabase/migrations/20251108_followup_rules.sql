create table if not exists public.followup_rules (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  labels text[] not null default '{human_reply,question,positive,neutral,routing}',
  hours_wait int not null default 48,
  max_nudges int not null default 2,
  auto_send boolean not null default false,
  tone text not null default 'professional',
  length text not null default 'short',
  updated_at timestamptz not null default now()
);

create or replace function public.tg_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_followup_rules_touch on public.followup_rules;
create trigger trg_followup_rules_touch
before update on public.followup_rules
for each row
execute function public.tg_touch_updated_at();




